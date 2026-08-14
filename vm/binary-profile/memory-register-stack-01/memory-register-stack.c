#include <stdint.h>

#define SYS_EXIT 1
#define SYS_WRITE 4
#define TEACHING_STACK_SIZE 4096
#define FIRST_VALUE 0x11111111U
#define SECOND_VALUE 0x22222222U

static long syscall3(long number, long arg1, long arg2, long arg3) {
    long result;
    __asm__ volatile("int $0x80"
                     : "=a"(result)
                     : "0"(number), "b"(arg1), "c"(arg2), "d"(arg3)
                     : "memory");
    return result;
}

static uint8_t teaching_stack[TEACHING_STACK_SIZE] __attribute__((aligned(16), used));
static volatile uint32_t original_esp;
static volatile uint32_t original_ebp;
static volatile uint32_t stack_start;
static volatile uint32_t first_top;
static volatile uint32_t first_top_value;
static volatile uint32_t second_top;
static volatile uint32_t second_top_value;
static volatile uint32_t after_first_remove;
static volatile uint32_t after_first_top_value;
static volatile uint32_t first_removed_value;
static volatile uint32_t stack_end;
static volatile uint32_t second_removed_value;

/* Use an ELF-owned stack so every observed address remains deterministic. */
__attribute__((naked, noinline, used)) static void capture_stack_sequence(void) {
    __asm__ volatile(
        "movl %esp, original_esp\n\t"
        "movl %ebp, original_ebp\n\t"
        "leal teaching_stack+4096, %esp\n\t"
        "xorl %ebp, %ebp\n\t"
        "movl %esp, stack_start\n\t"
        "pushl $0x11111111\n\t"
        "movl %esp, first_top\n\t"
        "movl (%esp), %eax\n\t"
        "movl %eax, first_top_value\n\t"
        "pushl $0x22222222\n\t"
        "movl %esp, second_top\n\t"
        "movl (%esp), %edx\n\t"
        "movl %edx, second_top_value\n\t"
        "popl %eax\n\t"
        "movl %eax, first_removed_value\n\t"
        "movl %esp, after_first_remove\n\t"
        "movl (%esp), %edx\n\t"
        "movl %edx, after_first_top_value\n\t"
        "popl %eax\n\t"
        "movl %eax, second_removed_value\n\t"
        "movl %esp, stack_end\n\t"
        "movl original_ebp, %ebp\n\t"
        "movl original_esp, %esp\n\t"
        "ret\n\t");
}

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

static char *append_hex32(char *cursor, uint32_t value) {
    static const char digits[] = "0123456789abcdef";
    for (int shift = 28; shift >= 0; shift -= 4) {
        *cursor++ = digits[(value >> shift) & 0xfU];
    }
    return cursor;
}

static char *append_padded(char *cursor, const char *text, unsigned width) {
    unsigned written = display_width(text);
    cursor = append_text(cursor, text);
    while (written++ < width) *cursor++ = ' ';
    return cursor;
}

static char *append_optional_hex32(char *cursor, uint32_t value, int present) {
    if (!present) return append_text(cursor, "----------");
    cursor = append_text(cursor, "0x");
    return append_hex32(cursor, value);
}

static char *append_header(char *cursor) {
    cursor = append_padded(cursor, "阶段", 16);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, "栈顶地址", 10);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, "栈顶值", 10);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, "本次取出", 10);
    return append_text(cursor, " | 含义\n");
}

static char *append_row(char *cursor, const char *stage, uint32_t top_address,
                        uint32_t top_value, int has_top_value,
                        uint32_t removed_value, int has_removed_value,
                        const char *meaning) {
    cursor = append_padded(cursor, stage, 16);
    cursor = append_text(cursor, " | ");
    cursor = append_text(cursor, "0x");
    cursor = append_hex32(cursor, top_address);
    cursor = append_text(cursor, " | ");
    cursor = append_optional_hex32(cursor, top_value, has_top_value);
    cursor = append_text(cursor, " | ");
    cursor = append_optional_hex32(cursor, removed_value, has_removed_value);
    cursor = append_text(cursor, " | ");
    cursor = append_text(cursor, meaning);
    return append_text(cursor, "\n");
}

__attribute__((noreturn, noinline, used)) void _start(void) {
    char output[1024];
    char *cursor = output;
    capture_stack_sequence();
    __asm__ volatile("stack_checkpoint:\n\t nop\n\t" ::: "memory");

    cursor = append_text(cursor, "memory-register-stack-01（i386 栈快照）\n");
    cursor = append_header(cursor);
    cursor = append_row(cursor, "开始", stack_start, 0, 0, 0, 0, "空栈");
    cursor = append_row(cursor, "第一个值入栈后", first_top, first_top_value, 1,
                        0, 0, "先进入的值在栈顶");
    cursor = append_row(cursor, "第二个值入栈后", second_top, second_top_value, 1,
                        0, 0, "后进入的值成为栈顶");
    cursor = append_row(cursor, "第一次出栈后", after_first_remove,
                        after_first_top_value, 1, first_removed_value, 1,
                        "先取出后进入的值");
    cursor = append_row(cursor, "第二次出栈后", stack_end, 0, 0,
                        second_removed_value, 1, "再取出先进入的值");

    if (first_top_value != FIRST_VALUE || second_top_value != SECOND_VALUE ||
        first_removed_value != SECOND_VALUE || second_removed_value != FIRST_VALUE) {
        syscall3(SYS_EXIT, 1, 0, 0);
    }

    syscall3(SYS_WRITE, 1, (long)output, (long)(cursor - output));
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
