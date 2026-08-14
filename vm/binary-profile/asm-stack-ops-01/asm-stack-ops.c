#include <stdint.h>

#define SYS_EXIT 1
#define SYS_WRITE 4
#define TEACHING_STACK_SIZE 4096

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
static volatile uint32_t start_esp;
static volatile uint32_t first_push_esp;
static volatile uint32_t second_push_esp;
static volatile uint32_t first_pop_esp;
static volatile uint32_t second_pop_esp;
static volatile uint32_t first_pop_value;
static volatile uint32_t second_pop_value;

__attribute__((naked, noinline, used)) static void capture_stack_ops(void) {
    __asm__ volatile(
        "movl %esp, original_esp\n\t"
        "movl %ebp, original_ebp\n\t"
        "leal teaching_stack+4096, %esp\n\t"
        "xorl %ebp, %ebp\n\t"
        "movl %esp, start_esp\n\t"
        "pushl $0x11111111\n\t"
        "movl %esp, first_push_esp\n\t"
        "pushl $0x22222222\n\t"
        "movl %esp, second_push_esp\n\t"
        "popl %eax\n\t"
        "movl %eax, first_pop_value\n\t"
        "movl %esp, first_pop_esp\n\t"
        "popl %ebx\n\t"
        "movl %ebx, second_pop_value\n\t"
        "movl %esp, second_pop_esp\n\t"
        "movl original_ebp, %ebp\n\t"
        "movl original_esp, %esp\n\t"
        "ret\n\t");
}

__attribute__((naked, noinline, used)) static void stack_ops_checkpoint(void) {
    __asm__ volatile("ret\n\t");
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

static char *append_padded(char *cursor, const char *text, unsigned width) {
    unsigned used = display_width(text);
    cursor = append_text(cursor, text);
    while (used++ < width) *cursor++ = ' ';
    return cursor;
}

static char *append_hex32(char *cursor, uint32_t value) {
    static const char digits[] = "0123456789abcdef";
    for (int shift = 28; shift >= 0; shift -= 4) {
        *cursor++ = digits[(value >> shift) & 0xfU];
    }
    return cursor;
}

static char *append_optional_hex32(char *cursor, uint32_t value, int present) {
    if (!present) return append_text(cursor, "----------");
    cursor = append_text(cursor, "0x");
    return append_hex32(cursor, value);
}

static char *append_row(char *cursor, const char *instruction, uint32_t esp,
                        uint32_t top_value, int has_top,
                        const char *target, uint32_t register_value, int has_register) {
    cursor = append_padded(cursor, instruction, 18);
    cursor = append_text(cursor, " | 0x");
    cursor = append_hex32(cursor, esp);
    cursor = append_text(cursor, " | ");
    cursor = append_optional_hex32(cursor, top_value, has_top);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, target, 4);
    cursor = append_text(cursor, " | ");
    cursor = append_optional_hex32(cursor, register_value, has_register);
    return append_text(cursor, "\n");
}

__attribute__((noreturn, noinline, used)) void _start(void) {
    char output[1536];
    char *cursor = output;
    capture_stack_ops();
    __asm__ volatile("movl %[first], %%eax\n\t"
                     "movl %[second], %%ebx\n\t"
                     "call stack_ops_checkpoint\n\t"
                     :
                     : [first] "m"(first_pop_value), [second] "m"(second_pop_value)
                     : "eax", "ebx", "memory");

    cursor = append_text(cursor, "asm-stack-ops-01（i386 固定快照）\n");
    cursor = append_padded(cursor, "执行后", 18);
    cursor = append_text(cursor, " | ESP        | 栈顶值     | 目标 | 取出的值\n");
    cursor = append_row(cursor, "开始", start_esp, 0, 0, "-", 0, 0);
    cursor = append_row(cursor, "push 0x11111111", first_push_esp,
                        0x11111111U, 1, "-", 0, 0);
    cursor = append_row(cursor, "push 0x22222222", second_push_esp,
                        0x22222222U, 1, "-", 0, 0);
    cursor = append_row(cursor, "pop eax", first_pop_esp,
                        0x11111111U, 1, "EAX", first_pop_value, 1);
    cursor = append_row(cursor, "pop ebx", second_pop_esp,
                        0, 0, "EBX", second_pop_value, 1);

    syscall3(SYS_WRITE, 1, (long)output, (long)(cursor - output));
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
