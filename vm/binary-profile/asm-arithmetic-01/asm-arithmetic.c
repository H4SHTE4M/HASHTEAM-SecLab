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

static volatile uint32_t add_before;
static volatile uint32_t add_after;
static volatile uint32_t sub_after;
static volatile uint32_t mul_after;
static volatile uint32_t quotient;
static volatile uint32_t remainder;
static volatile uint32_t and_after;
static volatile uint32_t or_after;
static volatile uint32_t xor_after;

__attribute__((noinline, used)) static void capture_arithmetic(void) {
    __asm__ volatile(
        "movl $10, %%eax\n\t"
        "movl %%eax, %[add_before]\n\t"
        "addl $7, %%eax\n\t"
        "movl %%eax, %[add_after]\n\t"
        "subl $4, %%eax\n\t"
        "movl %%eax, %[sub_after]\n\t"
        "movl $6, %%eax\n\t"
        "movl $7, %%ebx\n\t"
        "imull %%ebx, %%eax\n\t"
        "movl %%eax, %[mul_after]\n\t"
        "movl $43, %%eax\n\t"
        "cdq\n\t"
        "movl $5, %%ebx\n\t"
        "idivl %%ebx\n\t"
        "movl %%eax, %[division_quotient]\n\t"
        "movl %%edx, %[division_remainder]\n\t"
        "movl $0x000000f0, %%eax\n\t"
        "andl $0x0000003c, %%eax\n\t"
        "movl %%eax, %[and_result]\n\t"
        "orl $0x00000003, %%eax\n\t"
        "movl %%eax, %[or_result]\n\t"
        "xorl $0x00000011, %%eax\n\t"
        "movl %%eax, %[xor_result]\n\t"
        : [add_before] "=m"(add_before),
          [add_after] "=m"(add_after),
          [sub_after] "=m"(sub_after),
          [mul_after] "=m"(mul_after),
          [division_quotient] "=m"(quotient),
          [division_remainder] "=m"(remainder),
          [and_result] "=m"(and_after),
          [or_result] "=m"(or_after),
          [xor_result] "=m"(xor_after)
        :
        : "eax", "ebx", "edx", "cc", "memory");
}

__attribute__((naked, noinline, used)) static void arithmetic_checkpoint(void) {
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

static char *append_row(char *cursor, const char *group, const char *instruction,
                        uint32_t before, uint32_t after) {
    cursor = append_padded(cursor, group, 10);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, instruction, 24);
    cursor = append_text(cursor, " | 0x");
    cursor = append_hex32(cursor, before);
    cursor = append_text(cursor, " | 0x");
    cursor = append_hex32(cursor, after);
    return append_text(cursor, "\n");
}

__attribute__((noreturn, noinline, used)) void _start(void) {
    char output[2048];
    char *cursor = output;
    capture_arithmetic();
    __asm__ volatile("movl %[result], %%eax\n\t"
                     "call arithmetic_checkpoint\n\t"
                     :
                     : [result] "m"(xor_after)
                     : "eax", "memory");

    cursor = append_text(cursor, "asm-arithmetic-01（i386 固定快照）\n");
    cursor = append_padded(cursor, "分组", 10);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, "指令", 24);
    cursor = append_text(cursor, " | 前值       | 后值\n");
    cursor = append_row(cursor, "加减", "add eax, 7", add_before, add_after);
    cursor = append_row(cursor, "加减", "sub eax, 4", add_after, sub_after);
    cursor = append_row(cursor, "乘法", "imul eax, ebx", 6, mul_after);
    cursor = append_row(cursor, "除法商", "idiv ebx", 43, quotient);
    cursor = append_row(cursor, "除法余数", "idiv 后的 EDX", 43, remainder);
    cursor = append_row(cursor, "按位与", "and eax, 0x3c", 0xf0, and_after);
    cursor = append_row(cursor, "按位或", "or eax, 0x03", and_after, or_after);
    cursor = append_row(cursor, "按位异或", "xor eax, 0x11", or_after, xor_after);

    syscall3(SYS_WRITE, 1, (long)output, (long)(cursor - output));
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
