#define _GNU_SOURCE

#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ptrace.h>
#include <sys/types.h>
#include <sys/user.h>
#include <sys/wait.h>
#include <unistd.h>

#define MAX_BREAKPOINTS 16
#define MAX_INSTRUCTIONS 2048
#define MAX_SYMBOLS 256
#define MAX_LINE 512
#define MAX_HEX_BYTES 256
#define MAX_JSON_TOKENS 512
#define MAX_CONDITIONS 64
#define MAX_CONDITION_CHILDREN 12
#define MAX_VIEWS 4
#define MAX_REACHED 256
#define MAX_PROGRAM_OUTPUT 8192

typedef struct {
    uint32_t address;
    unsigned length;
    char bytes[33];
    char text[160];
} instruction;

typedef struct {
    char name[64];
    uint32_t address;
} symbol;

typedef struct {
    int active;
    unsigned id;
    uint32_t address;
    uint8_t original;
} breakpoint;

typedef enum {
    JSON_UNDEFINED,
    JSON_OBJECT,
    JSON_ARRAY,
    JSON_STRING,
    JSON_PRIMITIVE,
} json_type;

typedef struct {
    json_type type;
    int start;
    int end;
    int parent;
} json_token;

typedef enum {
    CONDITION_ALL,
    CONDITION_ANY,
    CONDITION_NOT,
    CONDITION_REGISTER,
    CONDITION_MEMORY_U32,
    CONDITION_MEMORY_BYTES,
    CONDITION_INSTRUCTION_POINTER,
    CONDITION_REACHED_ADDRESS,
    CONDITION_EXIT_CODE,
} condition_type;

typedef enum {
    OP_NONE,
    OP_EQ,
    OP_NE,
    OP_MASK,
    OP_RANGE,
} condition_op;

typedef struct {
    condition_type type;
    condition_op op;
    char name[16];
    char address[64];
    char value[160];
    char mask[64];
    char min[64];
    char max[64];
    int children[MAX_CONDITION_CHILDREN];
    unsigned child_count;
} condition;

typedef struct {
    char type[16];
    char address[64];
    unsigned size;
} memory_view;

typedef struct {
    char target[256];
    char disasm[256];
    char symbols[256];
    condition conditions[MAX_CONDITIONS];
    unsigned condition_count;
    int success_root;
    memory_view views[MAX_VIEWS];
    unsigned view_count;
} config;

static config cfg;
static pid_t child = -1;
static int child_stopped;
static int child_exited;
static int child_exit_code;
static instruction instructions[MAX_INSTRUCTIONS];
static size_t instruction_count;
static symbol symbols[MAX_SYMBOLS];
static size_t symbol_count;
static breakpoint breakpoints[MAX_BREAKPOINTS];
static unsigned next_breakpoint_id = 1;
static int completion_started;
static uint32_t reached_addresses[MAX_REACHED];
static size_t reached_count;
static int output_pipe = -1;
static char program_output[MAX_PROGRAM_OUTPUT + 1];
static size_t program_output_length;

static int register_value(const struct user_regs_struct *regs, const char *name, uint32_t *value);

static void fatal(const char *message) {
    fprintf(stderr, "debugger: %s: %s\n", message, strerror(errno));
    exit(2);
}

static void trim(char *text) {
    char *start = text;
    while (isspace((unsigned char)*start)) start++;
    if (start != text) memmove(text, start, strlen(start) + 1);
    size_t length = strlen(text);
    while (length > 0 && isspace((unsigned char)text[length - 1])) text[--length] = '\0';
}

static int allocate_json_token(json_token *tokens, int *count, json_type type, int start,
                               int parent) {
    if (*count >= MAX_JSON_TOKENS) return -1;
    int index = (*count)++;
    tokens[index].type = type;
    tokens[index].start = start;
    tokens[index].end = -1;
    tokens[index].parent = parent;
    return index;
}

static int tokenize_json(const char *json, json_token tokens[MAX_JSON_TOKENS]) {
    int count = 0;
    int parent = -1;
    for (int position = 0; json[position] != '\0'; position++) {
        unsigned char ch = (unsigned char)json[position];
        if (isspace(ch) || ch == ':' || ch == ',') continue;
        if (ch == '{' || ch == '[') {
            int index = allocate_json_token(tokens, &count,
                                            ch == '{' ? JSON_OBJECT : JSON_ARRAY,
                                            position, parent);
            if (index < 0) return -1;
            parent = index;
            continue;
        }
        if (ch == '}' || ch == ']') {
            json_type expected = ch == '}' ? JSON_OBJECT : JSON_ARRAY;
            if (parent < 0 || tokens[parent].type != expected) return -1;
            tokens[parent].end = position + 1;
            parent = tokens[parent].parent;
            continue;
        }
        if (ch == '"') {
            int start = ++position;
            while (json[position] != '\0' && json[position] != '"') {
                if ((unsigned char)json[position] < 0x20 || json[position] == '\\') return -1;
                position++;
            }
            if (json[position] != '"') return -1;
            int index = allocate_json_token(tokens, &count, JSON_STRING, start, parent);
            if (index < 0) return -1;
            tokens[index].end = position;
            continue;
        }
        int start = position;
        while (json[position] != '\0' && !isspace((unsigned char)json[position]) &&
               json[position] != ',' && json[position] != ']' && json[position] != '}') {
            if (json[position] == ':' || json[position] == '[' || json[position] == '{' ||
                json[position] == '"') return -1;
            position++;
        }
        int index = allocate_json_token(tokens, &count, JSON_PRIMITIVE, start, parent);
        if (index < 0) return -1;
        tokens[index].end = position;
        position--;
    }
    if (parent != -1 || count == 0 || tokens[0].end < 0) return -1;
    for (int index = 0; index < count; index++) {
        if (tokens[index].end < tokens[index].start) return -1;
    }
    return count;
}

static int token_next(const json_token *tokens, int count, int index) {
    int next = index + 1;
    while (next < count && tokens[next].start < tokens[index].end) next++;
    return next;
}

static int token_equals(const char *json, const json_token *token, const char *text) {
    size_t length = strlen(text);
    return token->type == JSON_STRING && token->end - token->start == (int)length &&
           memcmp(json + token->start, text, length) == 0;
}

static int token_copy(const char *json, const json_token *token, char *output, size_t capacity) {
    int length = token->end - token->start;
    if (token->type != JSON_STRING || length < 0 || (size_t)length + 1 > capacity) return -1;
    memcpy(output, json + token->start, (size_t)length);
    output[length] = '\0';
    return 0;
}

static int object_value(const char *json, const json_token *tokens, int count, int object,
                        const char *key) {
    if (object < 0 || object >= count || tokens[object].type != JSON_OBJECT) return -1;
    int cursor = object + 1;
    while (cursor < count && tokens[cursor].start < tokens[object].end) {
        int value = cursor + 1;
        if (tokens[cursor].parent != object || tokens[cursor].type != JSON_STRING || value >= count ||
            tokens[value].parent != object) return -1;
        if (token_equals(json, &tokens[cursor], key)) return value;
        cursor = token_next(tokens, count, value);
    }
    return -1;
}

static int key_allowed(const char *json, const json_token *token, const char *const *allowed,
                       size_t allowed_count) {
    for (size_t index = 0; index < allowed_count; index++) {
        if (token_equals(json, token, allowed[index])) return 1;
    }
    return 0;
}

static int object_has_only(const char *json, const json_token *tokens, int count, int object,
                           const char *const *allowed, size_t allowed_count) {
    if (object < 0 || object >= count || tokens[object].type != JSON_OBJECT) return 0;
    int cursor = object + 1;
    while (cursor < count && tokens[cursor].start < tokens[object].end) {
        int value = cursor + 1;
        if (tokens[cursor].parent != object || value >= count || tokens[value].parent != object ||
            !key_allowed(json, &tokens[cursor], allowed, allowed_count)) return 0;
        cursor = token_next(tokens, count, value);
    }
    return 1;
}

static int primitive_uint(const char *json, const json_token *token, unsigned *value) {
    if (token->type != JSON_PRIMITIVE || token->end - token->start <= 0 ||
        token->end - token->start >= 20) return -1;
    char raw[20];
    int length = token->end - token->start;
    memcpy(raw, json + token->start, (size_t)length);
    raw[length] = '\0';
    char *end = NULL;
    errno = 0;
    unsigned long parsed = strtoul(raw, &end, 10);
    if (errno != 0 || end == raw || *end != '\0' || parsed > UINT32_MAX) return -1;
    *value = (unsigned)parsed;
    return 0;
}

static int parse_operation(const char *text, condition_op *op) {
    if (strcmp(text, "eq") == 0) *op = OP_EQ;
    else if (strcmp(text, "ne") == 0) *op = OP_NE;
    else if (strcmp(text, "mask") == 0) *op = OP_MASK;
    else if (strcmp(text, "range") == 0) *op = OP_RANGE;
    else return -1;
    return 0;
}

static int parse_condition(const char *json, const json_token *tokens, int count, int object) {
    if (cfg.condition_count >= MAX_CONDITIONS || tokens[object].type != JSON_OBJECT) return -1;
    int type_token = object_value(json, tokens, count, object, "type");
    char type[32];
    if (type_token < 0 || token_copy(json, &tokens[type_token], type, sizeof(type)) != 0) return -1;
    int index = (int)cfg.condition_count++;
    condition *node = &cfg.conditions[index];
    memset(node, 0, sizeof(*node));

    if (strcmp(type, "all") == 0 || strcmp(type, "any") == 0) {
        static const char *const allowed[] = {"type", "conditions"};
        int array = object_value(json, tokens, count, object, "conditions");
        if (!object_has_only(json, tokens, count, object, allowed, 2) || array < 0 ||
            tokens[array].type != JSON_ARRAY) return -1;
        node->type = strcmp(type, "all") == 0 ? CONDITION_ALL : CONDITION_ANY;
        int cursor = array + 1;
        while (cursor < count && tokens[cursor].start < tokens[array].end) {
            if (tokens[cursor].parent != array || node->child_count >= MAX_CONDITION_CHILDREN) return -1;
            int child_index = parse_condition(json, tokens, count, cursor);
            if (child_index < 0) return -1;
            node->children[node->child_count++] = child_index;
            cursor = token_next(tokens, count, cursor);
        }
        return node->child_count > 0 ? index : -1;
    }
    if (strcmp(type, "not") == 0) {
        static const char *const allowed[] = {"type", "condition"};
        int child = object_value(json, tokens, count, object, "condition");
        if (!object_has_only(json, tokens, count, object, allowed, 2) || child < 0 ||
            tokens[child].type != JSON_OBJECT) return -1;
        int child_index = parse_condition(json, tokens, count, child);
        if (child_index < 0) return -1;
        node->type = CONDITION_NOT;
        node->children[0] = child_index;
        node->child_count = 1;
        return index;
    }

    static const char *const leaf_allowed[] = {
        "type", "name", "address", "op", "value", "mask", "min", "max"
    };
    if (!object_has_only(json, tokens, count, object, leaf_allowed, 8)) return -1;
    if (strcmp(type, "register") == 0) node->type = CONDITION_REGISTER;
    else if (strcmp(type, "memory-u32") == 0) node->type = CONDITION_MEMORY_U32;
    else if (strcmp(type, "memory-bytes") == 0) node->type = CONDITION_MEMORY_BYTES;
    else if (strcmp(type, "instruction-pointer") == 0) node->type = CONDITION_INSTRUCTION_POINTER;
    else if (strcmp(type, "reached-address") == 0) node->type = CONDITION_REACHED_ADDRESS;
    else if (strcmp(type, "exit-code") == 0) node->type = CONDITION_EXIT_CODE;
    else return -1;

    int name = object_value(json, tokens, count, object, "name");
    int address = object_value(json, tokens, count, object, "address");
    int operation = object_value(json, tokens, count, object, "op");
    int value = object_value(json, tokens, count, object, "value");
    int mask = object_value(json, tokens, count, object, "mask");
    int min = object_value(json, tokens, count, object, "min");
    int max = object_value(json, tokens, count, object, "max");
    char op_text[16];
    if (node->type == CONDITION_REGISTER &&
        (name < 0 || token_copy(json, &tokens[name], node->name, sizeof(node->name)) != 0)) return -1;
    if ((node->type == CONDITION_MEMORY_U32 || node->type == CONDITION_MEMORY_BYTES ||
         node->type == CONDITION_REACHED_ADDRESS) &&
        (address < 0 || token_copy(json, &tokens[address], node->address, sizeof(node->address)) != 0)) return -1;
    if (operation < 0 || token_copy(json, &tokens[operation], op_text, sizeof(op_text)) != 0 ||
        parse_operation(op_text, &node->op) != 0) return -1;
    if (node->type == CONDITION_REACHED_ADDRESS &&
        ((node->op != OP_EQ && node->op != OP_NE) || name >= 0 || value >= 0 || mask >= 0 ||
         min >= 0 || max >= 0)) return -1;
    if (node->type != CONDITION_REACHED_ADDRESS &&
        (node->op == OP_EQ || node->op == OP_NE || node->op == OP_MASK) &&
        (value < 0 || token_copy(json, &tokens[value], node->value, sizeof(node->value)) != 0)) return -1;
    if (node->op == OP_MASK &&
        (mask < 0 || token_copy(json, &tokens[mask], node->mask, sizeof(node->mask)) != 0)) return -1;
    if (node->op == OP_RANGE &&
        (min < 0 || max < 0 ||
         token_copy(json, &tokens[min], node->min, sizeof(node->min)) != 0 ||
         token_copy(json, &tokens[max], node->max, sizeof(node->max)) != 0)) return -1;
    if (node->type == CONDITION_MEMORY_BYTES && (node->op == OP_MASK || node->op == OP_RANGE)) return -1;
    return index;
}

static int parse_views(const char *json, const json_token *tokens, int count, int array) {
    if (array < 0 || tokens[array].type != JSON_ARRAY) return -1;
    int cursor = array + 1;
    while (cursor < count && tokens[cursor].start < tokens[array].end) {
        static const char *const allowed[] = {"type", "address", "size"};
        if (tokens[cursor].parent != array || tokens[cursor].type != JSON_OBJECT ||
            cfg.view_count >= MAX_VIEWS ||
            !object_has_only(json, tokens, count, cursor, allowed, 3)) return -1;
        int type = object_value(json, tokens, count, cursor, "type");
        int address = object_value(json, tokens, count, cursor, "address");
        int size = object_value(json, tokens, count, cursor, "size");
        memory_view *view = &cfg.views[cfg.view_count++];
        if (type < 0 || address < 0 || size < 0 ||
            token_copy(json, &tokens[type], view->type, sizeof(view->type)) != 0 ||
            token_copy(json, &tokens[address], view->address, sizeof(view->address)) != 0 ||
            primitive_uint(json, &tokens[size], &view->size) != 0 || view->size == 0 ||
            view->size > MAX_HEX_BYTES ||
            (strcmp(view->type, "stack") != 0 && strcmp(view->type, "memory") != 0)) return -1;
        cursor = token_next(tokens, count, cursor);
    }
    return cfg.view_count > 0 ? 0 : -1;
}

static char *read_text_file(const char *path, size_t limit) {
    FILE *fp = fopen(path, "rb");
    if (fp == NULL) return NULL;
    char *buffer = calloc(limit + 1, 1);
    if (buffer == NULL) fatal("内存不足");
    size_t length = fread(buffer, 1, limit, fp);
    if (fgetc(fp) != EOF) {
        fclose(fp);
        free(buffer);
        errno = EFBIG;
        return NULL;
    }
    fclose(fp);
    buffer[length] = '\0';
    return buffer;
}

static int load_config(const char *path) {
    char *json = read_text_file(path, 16384);
    if (json == NULL) return -1;
    json_token tokens[MAX_JSON_TOKENS];
    int count = tokenize_json(json, tokens);
    static const char *const allowed[] = {
        "schemaVersion", "target", "disassembly", "symbols", "views", "success"
    };
    int schema = count > 0 ? object_value(json, tokens, count, 0, "schemaVersion") : -1;
    int target = count > 0 ? object_value(json, tokens, count, 0, "target") : -1;
    int disasm = count > 0 ? object_value(json, tokens, count, 0, "disassembly") : -1;
    int symbol_file = count > 0 ? object_value(json, tokens, count, 0, "symbols") : -1;
    int views = count > 0 ? object_value(json, tokens, count, 0, "views") : -1;
    int success = count > 0 ? object_value(json, tokens, count, 0, "success") : -1;
    unsigned version = 0;
    int ok = count > 0 && tokens[0].type == JSON_OBJECT &&
             object_has_only(json, tokens, count, 0, allowed, 6) &&
             schema >= 0 && primitive_uint(json, &tokens[schema], &version) == 0 && version == 1 &&
             target >= 0 && token_copy(json, &tokens[target], cfg.target, sizeof(cfg.target)) == 0 &&
             disasm >= 0 && token_copy(json, &tokens[disasm], cfg.disasm, sizeof(cfg.disasm)) == 0 &&
             symbol_file >= 0 && token_copy(json, &tokens[symbol_file], cfg.symbols, sizeof(cfg.symbols)) == 0 &&
             parse_views(json, tokens, count, views) == 0 && success >= 0 &&
             parse_condition(json, tokens, count, success) >= 0;
    if (ok) cfg.success_root = 0;
    free(json);
    return ok ? 0 : -1;
}

static int resolve_current_config(char path[320]) {
    char raw[128] = {0};
    FILE *fp = fopen("/home/guest/.hashteam/lab", "rb");
    if (fp == NULL) return -1;
    size_t length = fread(raw, 1, sizeof(raw) - 1, fp);
    fclose(fp);
    while (length > 0 && (raw[length - 1] == '\n' || raw[length - 1] == '\r' || raw[length - 1] == ' ')) {
        raw[--length] = '\0';
    }
    if (length == 0 || length > 96 || raw[0] < 'a' || raw[length - 1] == '-') return -1;
    for (size_t index = 0; index < length; index++) {
        if (!((raw[index] >= 'a' && raw[index] <= 'z') ||
              (raw[index] >= '0' && raw[index] <= '9') || raw[index] == '-')) return -1;
    }
    if (snprintf(path, 320, "/opt/pwnhub/labs/%s/debugger.json", raw) >= 320) return -1;
    return 0;
}

static int load_symbols(void) {
    FILE *fp = fopen(cfg.symbols, "r");
    if (fp == NULL) return -1;
    char line[MAX_LINE];
    while (fgets(line, sizeof(line), fp) != NULL) {
        if (symbol_count >= MAX_SYMBOLS) break;
        char name[64];
        unsigned address;
        if (sscanf(line, "%x|%63[A-Za-z0-9_.$@]", &address, name) == 2) {
            symbols[symbol_count].address = address;
            strcpy(symbols[symbol_count].name, name);
            symbol_count++;
        }
    }
    fclose(fp);
    return 0;
}

static int load_disassembly(void) {
    FILE *fp = fopen(cfg.disasm, "r");
    if (fp == NULL) return -1;
    char line[MAX_LINE];
    while (fgets(line, sizeof(line), fp) != NULL) {
        if (instruction_count >= MAX_INSTRUCTIONS) break;
        char *first = strchr(line, '|');
        char *second = first != NULL ? strchr(first + 1, '|') : NULL;
        char *third = second != NULL ? strchr(second + 1, '|') : NULL;
        if (first == NULL || second == NULL || third == NULL) continue;
        *first = *second = *third = '\0';
        char *end = NULL;
        unsigned long address = strtoul(line, &end, 16);
        unsigned long length = strtoul(first + 1, &end, 10);
        trim(second + 1);
        trim(third + 1);
        if (address > UINT32_MAX || length == 0 || length > 15 || strlen(second + 1) > 32) continue;
        instructions[instruction_count].address = (uint32_t)address;
        instructions[instruction_count].length = (unsigned)length;
        strcpy(instructions[instruction_count].bytes, second + 1);
        strncpy(instructions[instruction_count].text, third + 1,
                sizeof(instructions[instruction_count].text) - 1);
        instruction_count++;
    }
    fclose(fp);
    return instruction_count > 0 ? 0 : -1;
}

static instruction *find_instruction(uint32_t address) {
    for (size_t i = 0; i < instruction_count; i++) {
        if (instructions[i].address == address) return &instructions[i];
    }
    return NULL;
}

static const char *symbol_at(uint32_t address) {
    for (size_t i = 0; i < symbol_count; i++) {
        if (symbols[i].address == address) return symbols[i].name;
    }
    return NULL;
}

static int parse_address(const char *text, const struct user_regs_struct *regs, uint32_t *value) {
    if (text == NULL || *text == '\0') return -1;
    if (text[0] == '$') {
        if (regs == NULL) return -1;
        const char *name = text + 1;
        if (strcasecmp(name, "eax") == 0) *value = regs->eax;
        else if (strcasecmp(name, "ebx") == 0) *value = regs->ebx;
        else if (strcasecmp(name, "ecx") == 0) *value = regs->ecx;
        else if (strcasecmp(name, "edx") == 0) *value = regs->edx;
        else if (strcasecmp(name, "esi") == 0) *value = regs->esi;
        else if (strcasecmp(name, "edi") == 0) *value = regs->edi;
        else if (strcasecmp(name, "ebp") == 0) *value = regs->ebp;
        else if (strcasecmp(name, "esp") == 0) *value = regs->esp;
        else if (strcasecmp(name, "eip") == 0) *value = regs->eip;
        else return -1;
        return 0;
    }
    for (size_t i = 0; i < symbol_count; i++) {
        if (strcmp(text, symbols[i].name) == 0) {
            *value = symbols[i].address;
            return 0;
        }
    }
    char *end = NULL;
    errno = 0;
    unsigned long parsed = strtoul(text, &end, 0);
    if (errno != 0 || end == text || *end != '\0' || parsed > UINT32_MAX) return -1;
    *value = (uint32_t)parsed;
    return 0;
}

static int get_regs(struct user_regs_struct *regs) {
    return child > 0 && !child_exited && ptrace(PTRACE_GETREGS, child, NULL, regs) == 0 ? 0 : -1;
}

static int parse_u32_text(const char *text, uint32_t *value) {
    char *end = NULL;
    errno = 0;
    unsigned long parsed = strtoul(text, &end, 0);
    if (errno != 0 || end == text || *end != '\0' || parsed > UINT32_MAX) return -1;
    *value = (uint32_t)parsed;
    return 0;
}

static int parse_byte_text(const char *text, uint8_t *bytes, size_t capacity, size_t *length) {
    size_t text_length = strlen(text);
    if (text_length == 0 || (text_length & 1U) != 0 || text_length / 2 > capacity) return -1;
    for (size_t index = 0; index < text_length; index += 2) {
        char pair[3] = {text[index], text[index + 1], '\0'};
        char *end = NULL;
        unsigned long parsed = strtoul(pair, &end, 16);
        if (*end != '\0' || parsed > 0xff) return -1;
        bytes[index / 2] = (uint8_t)parsed;
    }
    *length = text_length / 2;
    return 0;
}

static long peek_word(uint32_t address, int *ok) {
    errno = 0;
    long word = ptrace(PTRACE_PEEKDATA, child, (void *)(uintptr_t)address, NULL);
    *ok = errno == 0;
    return word;
}

static int read_bytes(uint32_t address, uint8_t *bytes, size_t length) {
    for (size_t index = 0; index < length; index++) {
        int ok;
        long word = peek_word(address + (uint32_t)index, &ok);
        if (!ok) return -1;
        bytes[index] = (uint8_t)word;
    }
    return 0;
}

static int poke_byte(uint32_t address, uint8_t value) {
    uint32_t aligned = address & ~(uint32_t)(sizeof(long) - 1);
    int ok;
    long word = peek_word(aligned, &ok);
    if (!ok) return -1;
    unsigned shift = (address - aligned) * 8;
    unsigned long mask = 0xffUL << shift;
    unsigned long changed = ((unsigned long)word & ~mask) | ((unsigned long)value << shift);
    return ptrace(PTRACE_POKEDATA, child, (void *)(uintptr_t)aligned, (void *)changed) == 0 ? 0 : -1;
}

static breakpoint *breakpoint_at(uint32_t address) {
    for (size_t i = 0; i < MAX_BREAKPOINTS; i++) {
        if (breakpoints[i].active && breakpoints[i].address == address) return &breakpoints[i];
    }
    return NULL;
}

static int install_breakpoint(uint32_t address, unsigned *id) {
    breakpoint *existing = breakpoint_at(address);
    if (existing != NULL) {
        *id = existing->id;
        return 0;
    }
    size_t slot;
    for (slot = 0; slot < MAX_BREAKPOINTS && breakpoints[slot].active; slot++) {}
    if (slot == MAX_BREAKPOINTS) return -1;
    int ok;
    long word = peek_word(address, &ok);
    if (!ok) return -1;
    breakpoints[slot].active = 1;
    breakpoints[slot].id = next_breakpoint_id++;
    breakpoints[slot].address = address;
    breakpoints[slot].original = (uint8_t)word;
    if (poke_byte(address, 0xcc) != 0) {
        breakpoints[slot].active = 0;
        return -1;
    }
    *id = breakpoints[slot].id;
    return 0;
}

static int remove_breakpoint(breakpoint *bp) {
    if (!bp->active) return -1;
    if (!child_exited && poke_byte(bp->address, bp->original) != 0) return -1;
    bp->active = 0;
    return 0;
}

static void print_protocol(const char *state, uint32_t eip) {
    if (eip != 0) {
        printf("@@HASHTEAM:{\"type\":\"debugger-state\",\"state\":\"%s\",\"eip\":\"0x%08x\"}\n",
               state, eip);
    } else {
        printf("@@HASHTEAM:{\"type\":\"debugger-state\",\"state\":\"%s\"}\n", state);
    }
}

static void print_memory(uint32_t address, unsigned length) {
    if (length > MAX_HEX_BYTES) length = MAX_HEX_BYTES;
    for (unsigned i = 0; i < length; i += 16) {
        printf("%08x: ", address + i);
        for (unsigned j = 0; j < 16 && i + j < length; j++) {
            int ok;
            long word = peek_word(address + i + j, &ok);
            if (!ok) {
                printf("?? ");
            } else {
                printf("%02x ", (unsigned)((uint8_t)word));
            }
        }
        putchar('\n');
    }
}

static int value_for_condition(const condition *node, uint32_t *value) {
    struct user_regs_struct regs;
    if (node->type == CONDITION_EXIT_CODE) {
        if (!child_exited) return -1;
        *value = (uint32_t)child_exit_code;
        return 0;
    }
    if (child_exited || get_regs(&regs) != 0) return -1;
    if (node->type == CONDITION_REGISTER) return register_value(&regs, node->name, value);
    if (node->type == CONDITION_INSTRUCTION_POINTER) {
        *value = (uint32_t)regs.eip;
        return 0;
    }
    uint32_t address;
    if (parse_address(node->address, &regs, &address) != 0) return -1;
    int ok;
    long word = peek_word(address, &ok);
    if (!ok) return -1;
    *value = (uint32_t)word;
    return 0;
}

static int compare_value(uint32_t actual, const condition *node) {
    uint32_t expected = 0;
    uint32_t mask = 0;
    uint32_t minimum = 0;
    uint32_t maximum = 0;
    if ((node->op == OP_EQ || node->op == OP_NE || node->op == OP_MASK) &&
        parse_u32_text(node->value, &expected) != 0) return 0;
    if (node->op == OP_MASK && parse_u32_text(node->mask, &mask) != 0) return 0;
    if (node->op == OP_RANGE &&
        (parse_u32_text(node->min, &minimum) != 0 || parse_u32_text(node->max, &maximum) != 0)) return 0;
    if (node->op == OP_EQ) return actual == expected;
    if (node->op == OP_NE) return actual != expected;
    if (node->op == OP_MASK) return (actual & mask) == expected;
    if (node->op == OP_RANGE) return actual >= minimum && actual <= maximum;
    return 0;
}

static int condition_satisfied(int index) {
    if (index < 0 || (unsigned)index >= cfg.condition_count) return 0;
    const condition *node = &cfg.conditions[index];
    if (node->type == CONDITION_ALL || node->type == CONDITION_ANY) {
        int result = node->type == CONDITION_ALL;
        for (unsigned child_index = 0; child_index < node->child_count; child_index++) {
            int child_result = condition_satisfied(node->children[child_index]);
            if (node->type == CONDITION_ALL) result = result && child_result;
            else result = result || child_result;
        }
        return result;
    }
    if (node->type == CONDITION_NOT) return !condition_satisfied(node->children[0]);
    if (node->type == CONDITION_REACHED_ADDRESS) {
        struct user_regs_struct regs;
        uint32_t expected;
        if (get_regs(&regs) != 0 || parse_address(node->address, &regs, &expected) != 0) return 0;
        for (size_t reached = 0; reached < reached_count; reached++) {
            if (reached_addresses[reached] == expected) return node->op == OP_EQ;
        }
        return node->op == OP_NE;
    }
    if (node->type == CONDITION_MEMORY_BYTES) {
        struct user_regs_struct regs;
        uint32_t address;
        uint8_t expected[MAX_HEX_BYTES];
        uint8_t actual[MAX_HEX_BYTES];
        size_t expected_length;
        if (child_exited || get_regs(&regs) != 0 || parse_address(node->address, &regs, &address) != 0 ||
            parse_byte_text(node->value, expected, sizeof(expected), &expected_length) != 0 ||
            read_bytes(address, actual, expected_length) != 0) return 0;
        int equal = memcmp(actual, expected, expected_length) == 0;
        return node->op == OP_EQ ? equal : !equal;
    }
    uint32_t actual;
    if (value_for_condition(node, &actual) != 0) return 0;
    return compare_value(actual, node);
}

static void show_state(void) {
    if (child_exited) {
        printf("\033[2J\033[H\033[1;96mPwnHub debugger\033[0m  EXITED (%d)\n", child_exit_code);
        print_protocol("exited", 0);
        return;
    }
    struct user_regs_struct regs;
    if (get_regs(&regs) != 0) return;
    printf("\033[2J\033[H\033[1;96mPwnHub debugger\033[0m  pid=%d  STOPPED\n", child);
    printf("\033[1;37mREGISTERS\033[0m\n");
    printf("EAX %08lx  EBX %08lx  ECX %08lx  EDX %08lx\n", regs.eax, regs.ebx, regs.ecx, regs.edx);
    printf("ESI %08lx  EDI %08lx  EBP %08lx  ESP %08lx\n", regs.esi, regs.edi, regs.ebp, regs.esp);
    printf("EIP %08lx  EFLAGS %08lx\n", regs.eip, regs.eflags);
    printf("\033[1;37mCODE\033[0m\n");
    instruction *current = find_instruction((uint32_t)regs.eip);
    const char *name = symbol_at((uint32_t)regs.eip);
    if (name != NULL) printf("%s:\n", name);
    if (current != NULL) printf("> %08x  %-20s %s\n", current->address, current->bytes, current->text);
    else printf("> %08lx  <索引中没有这条指令>\n", regs.eip);
    printf("\033[1;37mSTACK\033[0m\n");
    print_memory((uint32_t)regs.esp, 32);
    if (cfg.view_count > 0) {
        printf("\033[1;37mMEMORY VIEWS\033[0m\n");
        for (unsigned view = 0; view < cfg.view_count; view++) {
            uint32_t address;
            if (parse_address(cfg.views[view].address, &regs, &address) == 0) {
                printf("%s @ 0x%08x (%u bytes)\n", cfg.views[view].type, address,
                       cfg.views[view].size);
                print_memory(address, cfg.views[view].size);
            }
        }
    }
    if (program_output_length > 0) {
        printf("\033[1;37mPROGRAM OUTPUT\033[0m\n%.*s", (int)program_output_length,
               program_output);
        if (program_output[program_output_length - 1] != '\n') putchar('\n');
    }
    print_protocol("stopped", (uint32_t)regs.eip);
}

static int register_value(const struct user_regs_struct *regs, const char *name, uint32_t *value) {
    if (strcasecmp(name, "eax") == 0) *value = regs->eax;
    else if (strcasecmp(name, "ebx") == 0) *value = regs->ebx;
    else if (strcasecmp(name, "ecx") == 0) *value = regs->ecx;
    else if (strcasecmp(name, "edx") == 0) *value = regs->edx;
    else if (strcasecmp(name, "esi") == 0) *value = regs->esi;
    else if (strcasecmp(name, "edi") == 0) *value = regs->edi;
    else if (strcasecmp(name, "ebp") == 0) *value = regs->ebp;
    else if (strcasecmp(name, "esp") == 0) *value = regs->esp;
    else if (strcasecmp(name, "eip") == 0) *value = regs->eip;
    else return -1;
    return 0;
}

static int set_register(struct user_regs_struct *regs, const char *name, uint32_t value) {
    if (strcasecmp(name, "eax") == 0) regs->eax = value;
    else if (strcasecmp(name, "ebx") == 0) regs->ebx = value;
    else if (strcasecmp(name, "ecx") == 0) regs->ecx = value;
    else if (strcasecmp(name, "edx") == 0) regs->edx = value;
    else if (strcasecmp(name, "esi") == 0) regs->esi = value;
    else if (strcasecmp(name, "edi") == 0) regs->edi = value;
    else if (strcasecmp(name, "ebp") == 0) regs->ebp = value;
    else if (strcasecmp(name, "esp") == 0) regs->esp = value;
    else if (strcasecmp(name, "eip") == 0) regs->eip = value;
    else return -1;
    return ptrace(PTRACE_SETREGS, child, NULL, regs) == 0 ? 0 : -1;
}

static int success_satisfied(void) {
    return condition_satisfied(cfg.success_root);
}

static int wait_for_child(void) {
    int status;
    while (waitpid(child, &status, 0) < 0) {
        if (errno != EINTR) return -1;
    }
    if (WIFEXITED(status) || WIFSIGNALED(status)) {
        child_exited = 1;
        child_stopped = 0;
        child_exit_code = WIFEXITED(status) ? WEXITSTATUS(status) : 128 + WTERMSIG(status);
        goto record_output;
    }
    child_stopped = WIFSTOPPED(status);
    if (child_stopped && WSTOPSIG(status) == SIGTRAP) {
        struct user_regs_struct regs;
        if (get_regs(&regs) == 0 && regs.eip > 0) {
            breakpoint *bp = breakpoint_at((uint32_t)regs.eip - 1);
            if (bp != NULL) {
                regs.eip--;
                ptrace(PTRACE_SETREGS, child, NULL, &regs);
                poke_byte(bp->address, bp->original);
            }
        }
    }
    if (child_stopped) {
        struct user_regs_struct regs;
        if (get_regs(&regs) == 0 && reached_count < MAX_REACHED) {
            reached_addresses[reached_count++] = (uint32_t)regs.eip;
        }
    }

record_output:
    if (output_pipe >= 0 && program_output_length < MAX_PROGRAM_OUTPUT) {
        for (;;) {
            ssize_t count = read(output_pipe, program_output + program_output_length,
                                 MAX_PROGRAM_OUTPUT - program_output_length);
            if (count > 0) {
                program_output_length += (size_t)count;
                program_output[program_output_length] = '\0';
                continue;
            }
            if (count < 0 && errno == EINTR) continue;
            break;
        }
    }
    return 0;
}

static int start_child(void) {
    child_exited = 0;
    child_stopped = 0;
    child_exit_code = 0;
    memset(breakpoints, 0, sizeof(breakpoints));
    next_breakpoint_id = 1;
    reached_count = 0;
    program_output_length = 0;
    program_output[0] = '\0';
    if (output_pipe >= 0) close(output_pipe);
    int pipefd[2];
    if (pipe(pipefd) != 0) return -1;
    child = fork();
    if (child < 0) {
        close(pipefd[0]);
        close(pipefd[1]);
        return -1;
    }
    if (child == 0) {
        close(pipefd[0]);
        if (dup2(pipefd[1], STDOUT_FILENO) < 0 || dup2(pipefd[1], STDERR_FILENO) < 0) _exit(125);
        close(pipefd[1]);
        if (ptrace(PTRACE_TRACEME, 0, NULL, NULL) != 0) _exit(126);
        execl(cfg.target, cfg.target, (char *)NULL);
        _exit(127);
    }
    close(pipefd[1]);
    output_pipe = pipefd[0];
    int flags = fcntl(output_pipe, F_GETFL, 0);
    if (flags >= 0) fcntl(output_pipe, F_SETFL, flags | O_NONBLOCK);
    if (wait_for_child() != 0 || child_exited) return -1;
    ptrace(PTRACE_SETOPTIONS, child, NULL, (void *)(uintptr_t)PTRACE_O_EXITKILL);
    return 0;
}

static int resume_child(int request) {
    if (!child_stopped || child_exited) return -1;
    struct user_regs_struct regs;
    breakpoint *bp = NULL;
    if (get_regs(&regs) == 0) bp = breakpoint_at((uint32_t)regs.eip);
    if (bp != NULL) {
        poke_byte(bp->address, bp->original);
        if (ptrace(PTRACE_SINGLESTEP, child, NULL, NULL) != 0 || wait_for_child() != 0) return -1;
        if (!child_exited) poke_byte(bp->address, 0xcc);
        if (request == PTRACE_SINGLESTEP) return 0;
    }
    print_protocol("running", 0);
    if (ptrace(request, child, NULL, NULL) != 0) return -1;
    return wait_for_child();
}

static void complete_lab(void) {
    if (completion_started) return;
    completion_started = 1;
    printf("\033[1;92m状态满足，正在使用一次性动态 key 验证实验。\033[0m\n");
    fflush(stdout);
    if (!child_exited && child > 0) {
        kill(child, SIGKILL);
        waitpid(child, NULL, 0);
    }
    pid_t checker = fork();
    if (checker < 0) fatal("无法创建动态检查进程");
    if (checker == 0) {
        execl("/usr/local/bin/htcheck", "htcheck", "debugger-complete", (char *)NULL);
        _exit(127);
    }
    int status = 0;
    while (waitpid(checker, &status, 0) < 0 && errno == EINTR) {}
    print_protocol("exited", 0);
    exit(WIFEXITED(status) ? WEXITSTATUS(status) : 3);
}

static void check_success(void) {
    if (success_satisfied()) complete_lab();
}

static int prepare_dynamic_key(void) {
    pid_t checker = fork();
    if (checker < 0) return -1;
    if (checker == 0) {
        execl("/usr/local/bin/htcheck", "htcheck", "debugger-reset", (char *)NULL);
        _exit(127);
    }
    int status = 0;
    while (waitpid(checker, &status, 0) < 0) {
        if (errno != EINTR) return -1;
    }
    return WIFEXITED(status) && WEXITSTATUS(status) == 0 ? 0 : -1;
}

static void show_help(void) {
    puts("step [n] | continue | until <地址|符号> | jump <地址|符号>");
    puts("break <地址|符号> | delete <id> | breaks | regs | reg <名称>");
    puts("setreg <名称> <值> | x <地址|$寄存器> <长度> | setmem <地址> <hex>");
    puts("maps | restart | check | help | quit");
}

static void command_loop(void) {
    char line[MAX_LINE];
    show_state();
    check_success();
    for (;;) {
        printf("\033[1;96mdbg>\033[0m ");
        fflush(stdout);
        if (fgets(line, sizeof(line), stdin) == NULL) break;
        trim(line);
        if (*line == '\0') continue;
        char *save = NULL;
        char *command = strtok_r(line, " \t", &save);
        char *arg1 = strtok_r(NULL, " \t", &save);
        char *arg2 = strtok_r(NULL, " \t", &save);
        struct user_regs_struct regs;
        if (strcmp(command, "quit") == 0) break;
        if (strcmp(command, "help") == 0) {
            show_help();
        } else if (strcmp(command, "regs") == 0) {
            show_state();
        } else if (strcmp(command, "reg") == 0) {
            uint32_t value;
            if (arg1 == NULL || get_regs(&regs) != 0 || register_value(&regs, arg1, &value) != 0)
                puts("用法：reg <eax|ebx|ecx|edx|esi|edi|ebp|esp|eip>");
            else printf("%s = 0x%08x\n", arg1, value);
        } else if (strcmp(command, "setreg") == 0) {
            uint32_t value;
            if (arg1 == NULL || arg2 == NULL || get_regs(&regs) != 0 ||
                parse_address(arg2, &regs, &value) != 0 || set_register(&regs, arg1, value) != 0)
                puts("用法：setreg <寄存器> <值>");
            else show_state();
        } else if (strcmp(command, "jump") == 0) {
            uint32_t address;
            if (arg1 == NULL || get_regs(&regs) != 0 || parse_address(arg1, &regs, &address) != 0 ||
                set_register(&regs, "eip", address) != 0)
                puts("用法：jump <地址|符号>");
            else show_state();
        } else if (strcmp(command, "step") == 0) {
            unsigned count = 1;
            if (arg1 != NULL) count = (unsigned)strtoul(arg1, NULL, 10);
            if (count == 0 || count > 1000) puts("step 次数必须在 1 到 1000 之间。");
            else {
                for (unsigned i = 0; i < count && !child_exited; i++) {
                    if (resume_child(PTRACE_SINGLESTEP) != 0) break;
                }
                show_state();
            }
        } else if (strcmp(command, "continue") == 0) {
            if (resume_child(PTRACE_CONT) != 0) puts("目标当前无法继续运行。");
            show_state();
        } else if (strcmp(command, "break") == 0 || strcmp(command, "until") == 0) {
            uint32_t address;
            unsigned id;
            if (arg1 == NULL || get_regs(&regs) != 0 || parse_address(arg1, &regs, &address) != 0 ||
                install_breakpoint(address, &id) != 0) {
                puts("地址无效或断点数量已满。");
            } else if (strcmp(command, "until") == 0) {
                resume_child(PTRACE_CONT);
                show_state();
            } else {
                printf("断点 %u：0x%08x\n", id, address);
            }
        } else if (strcmp(command, "delete") == 0) {
            unsigned id = arg1 != NULL ? (unsigned)strtoul(arg1, NULL, 10) : 0;
            int removed = 0;
            for (size_t i = 0; i < MAX_BREAKPOINTS; i++) {
                if (breakpoints[i].active && breakpoints[i].id == id) {
                    removed = remove_breakpoint(&breakpoints[i]) == 0;
                    break;
                }
            }
            puts(removed ? "断点已删除。" : "没有这个断点。");
        } else if (strcmp(command, "breaks") == 0) {
            for (size_t i = 0; i < MAX_BREAKPOINTS; i++) {
                if (breakpoints[i].active)
                    printf("%u  0x%08x\n", breakpoints[i].id, breakpoints[i].address);
            }
        } else if (strcmp(command, "x") == 0) {
            uint32_t address;
            unsigned length = arg2 != NULL ? (unsigned)strtoul(arg2, NULL, 0) : 0;
            if (arg1 == NULL || get_regs(&regs) != 0 || parse_address(arg1, &regs, &address) != 0 ||
                length == 0 || length > MAX_HEX_BYTES)
                puts("用法：x <地址|$寄存器> <1..256>");
            else print_memory(address, length);
        } else if (strcmp(command, "setmem") == 0) {
            uint32_t address;
            if (arg1 == NULL || arg2 == NULL || get_regs(&regs) != 0 ||
                parse_address(arg1, &regs, &address) != 0 || strlen(arg2) == 0 ||
                strlen(arg2) % 2 != 0 || strlen(arg2) > MAX_HEX_BYTES * 2) {
                puts("用法：setmem <地址|$寄存器> <偶数个十六进制字符>");
            } else {
                int ok = 1;
                for (size_t i = 0; i < strlen(arg2); i += 2) {
                    char byte_text[3] = {arg2[i], arg2[i + 1], 0};
                    char *end;
                    unsigned long byte = strtoul(byte_text, &end, 16);
                    if (*end != '\0' || poke_byte(address + (uint32_t)(i / 2), (uint8_t)byte) != 0) {
                        ok = 0;
                        break;
                    }
                }
                puts(ok ? "内存已修改。" : "内存写入失败。");
            }
        } else if (strcmp(command, "maps") == 0) {
            char path[64];
            snprintf(path, sizeof(path), "/proc/%d/maps", child);
            char *maps = read_text_file(path, 65536);
            if (maps == NULL) puts("无法读取目标进程映射。");
            else { fputs(maps, stdout); free(maps); }
        } else if (strcmp(command, "restart") == 0) {
            if (!child_exited && child > 0) { kill(child, SIGKILL); waitpid(child, NULL, 0); }
            if (start_child() != 0) puts("目标重启失败。");
            else show_state();
        } else if (strcmp(command, "check") == 0) {
            if (success_satisfied()) complete_lab();
            else puts("当前 CPU/内存状态还没有满足本关条件。");
        } else {
            puts("未知命令；输入 help 查看命令。");
        }
        check_success();
    }
}

int main(int argc, char **argv) {
    (void)argc;
    (void)argv;
    char config_path[320];
    if (resolve_current_config(config_path) != 0) {
        fprintf(stderr, "debugger: 当前实验没有受信任的 debugger 配置。\n");
        return 2;
    }
    if (load_config(config_path) != 0 || load_symbols() != 0 || load_disassembly() != 0) {
        fprintf(stderr, "debugger: 配置、符号或反汇编索引无效。\n");
        return 2;
    }
    if (prepare_dynamic_key() != 0) {
        fprintf(stderr, "debugger: 无法为本次会话生成动态验证 key。\n");
        return 2;
    }
    if (start_child() != 0) fatal("无法启动目标程序");
    print_protocol("ready", 0);
    command_loop();
    if (!child_exited && child > 0) {
        kill(child, SIGKILL);
        waitpid(child, NULL, 0);
    }
    print_protocol("exited", 0);
    return 0;
}
