#include <stddef.h>
#include <stdint.h>

#define SYS_EXIT 1
#define SYS_WRITE 4

static long syscall3(long number, long arg1, long arg2, long arg3) {
    long result;
    __asm__ volatile("int $0x80"
                     : "=a"(result)
                     : "0"(number), "b"(arg1), "c"(arg2), "d"(arg3)
                     : "memory");
    return result;
}

/* These values are deliberately ordinary data: students observe their address,
 * the bytes stored there, and the pointer that refers to the cell. */
static volatile uint32_t cell = 0xdec0de42U;
static volatile int32_t signed_cell = -42;
static volatile uint32_t *cell_pointer = (uint32_t *)&cell;

static char *append_text(char *cursor, const char *text) {
    while (*text != '\0') *cursor++ = *text++;
    return cursor;
}

static unsigned display_width(const char *text) {
    unsigned width = 0;
    while (*text != '\0') {
        unsigned char byte = (unsigned char)*text++;
        width += byte < 0x80U ? 1U : 2U;
        while (byte >= 0x80U && (*text & 0xc0) == 0x80) text++;
    }
    return width;
}

static char *append_padded(char *cursor, const char *text, unsigned width) {
    unsigned used = display_width(text);
    cursor = append_text(cursor, text);
    while (used < width) {
        *cursor++ = ' ';
        used++;
    }
    return cursor;
}

static char *append_hex32(char *cursor, uint32_t value) {
    static const char digits[] = "0123456789abcdef";
    for (int shift = 28; shift >= 0; shift -= 4) {
        *cursor++ = digits[(value >> shift) & 0xfU];
    }
    return cursor;
}

static void format_hex32(char output[11], uint32_t value) {
    char *cursor = output;
    *cursor++ = '0';
    *cursor++ = 'x';
    cursor = append_hex32(cursor, value);
    *cursor = '\0';
}

static char *append_signed32(char *cursor, int32_t value) {
    uint32_t magnitude;
    if (value < 0) {
        *cursor++ = '-';
        magnitude = (uint32_t)(-(int64_t)value);
    } else {
        magnitude = (uint32_t)value;
    }

    char digits[10];
    unsigned count = 0;
    do {
        digits[count++] = (char)('0' + (magnitude % 10U));
        magnitude /= 10U;
    } while (magnitude != 0U);
    while (count > 0U) *cursor++ = digits[--count];
    return cursor;
}

static char *append_memory_row(char *cursor, uint32_t address, const char *name,
                               const char *value, uint32_t raw, const char *meaning) {
    cursor = append_text(cursor, "0x");
    cursor = append_hex32(cursor, address);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, name, 16);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, value, 12);
    cursor = append_text(cursor, " | 0x");
    cursor = append_hex32(cursor, raw);
    cursor = append_text(cursor, " | ");
    return append_text(cursor, meaning);
}

__attribute__((noreturn, noinline, used)) void _start(void) {
    char output[1024];
    char *cursor = output;
    char cell_value[11];
    char pointer_value[11];
    char pointed_text[11];
    char signed_value[16];
    char *signed_cursor = signed_value;
    uint32_t address = (uint32_t)(uintptr_t)&cell;
    uint32_t pointer = (uint32_t)(uintptr_t)cell_pointer;
    uint32_t pointed_value = *cell_pointer;

    signed_cursor = append_signed32(signed_cursor, signed_cell);
    *signed_cursor = '\0';
    format_hex32(cell_value, cell);
    format_hex32(pointer_value, pointer);
    format_hex32(pointed_text, pointed_value);

    cursor = append_text(cursor, "memory-addresses-01（i386 小端快照）\n");
    cursor = append_text(cursor, "地址       | 变量名           | 变量值       | 原始位模式   | 含义\n");
    cursor = append_memory_row(cursor, address, "cell", cell_value, cell,
                               "无符号四字节值");
    cursor = append_text(cursor, "\n");
    cursor = append_memory_row(cursor, (uint32_t)(uintptr_t)&signed_cell, "signed_cell",
                               signed_value, (uint32_t)signed_cell,
                               "独立变量的有符号解释");
    cursor = append_text(cursor, "\n");
    cursor = append_memory_row(cursor, (uint32_t)(uintptr_t)&cell_pointer, "cell_pointer",
                               pointer_value, pointer, "保存 cell 的地址");
    cursor = append_text(cursor, "\n");
    cursor = append_memory_row(cursor, address, "*cell_pointer", pointed_text, pointed_value,
                               "解引用后读取的 cell 值");
    cursor = append_text(cursor, "\n");

    syscall3(SYS_WRITE, 1, (long)output, (long)(cursor - output));
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
