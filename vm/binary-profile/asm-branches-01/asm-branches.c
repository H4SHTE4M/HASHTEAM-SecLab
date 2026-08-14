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

static volatile uint32_t test_eax;
static volatile uint32_t test_flags;
static volatile uint32_t test_taken;
static volatile uint32_t equal_eax;
static volatile uint32_t equal_ebx;
static volatile uint32_t equal_flags;
static volatile uint32_t equal_taken;
static volatile uint32_t greater_eax;
static volatile uint32_t greater_ebx;
static volatile uint32_t greater_flags;
static volatile uint32_t greater_taken;

__attribute__((noinline, used)) static void capture_branches(void) {
    __asm__ volatile(
        "movl $0, %[test_taken]\n\t"
        "xorl %%eax, %%eax\n\t"
        "movl %%eax, %[test_eax]\n\t"
        "testl %%eax, %%eax\n\t"
        "pushfl\n\t"
        "popl %[test_flags]\n\t"
        "je 1f\n\t"
        "jmp 2f\n"
        "1:\n\t"
        "movl $1, %[test_taken]\n"
        "2:\n\t"
        "movl $0, %[equal_taken]\n\t"
        "movl $7, %%eax\n\t"
        "movl $7, %%ebx\n\t"
        "movl %%eax, %[equal_eax]\n\t"
        "movl %%ebx, %[equal_ebx]\n\t"
        "cmpl %%ebx, %%eax\n\t"
        "pushfl\n\t"
        "popl %[equal_flags]\n\t"
        "je 3f\n\t"
        "jmp 4f\n"
        "3:\n\t"
        "movl $1, %[equal_taken]\n"
        "4:\n\t"
        "movl $0, %[greater_taken]\n\t"
        "movl $9, %%eax\n\t"
        "movl $3, %%ebx\n\t"
        "movl %%eax, %[greater_eax]\n\t"
        "movl %%ebx, %[greater_ebx]\n\t"
        "cmpl %%ebx, %%eax\n\t"
        "pushfl\n\t"
        "popl %[greater_flags]\n\t"
        "jg 5f\n\t"
        "jmp 6f\n"
        "5:\n\t"
        "movl $1, %[greater_taken]\n"
        "6:\n"
        : [test_eax] "=m"(test_eax),
          [test_flags] "=m"(test_flags),
          [test_taken] "=m"(test_taken),
          [equal_eax] "=m"(equal_eax),
          [equal_ebx] "=m"(equal_ebx),
          [equal_flags] "=m"(equal_flags),
          [equal_taken] "=m"(equal_taken),
          [greater_eax] "=m"(greater_eax),
          [greater_ebx] "=m"(greater_ebx),
          [greater_flags] "=m"(greater_flags),
          [greater_taken] "=m"(greater_taken)
        :
        : "eax", "ebx", "cc", "memory");
}

__attribute__((naked, noinline, used)) static void branches_checkpoint(void) {
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

static char *append_bit(char *cursor, uint32_t flags, uint32_t mask) {
    *cursor++ = (flags & mask) != 0U ? '1' : '0';
    return cursor;
}

static char *append_case(char *cursor, const char *name, const char *instruction,
                         uint32_t eax, uint32_t ebx, uint32_t flags, uint32_t taken) {
    cursor = append_padded(cursor, name, 12);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, instruction, 22);
    cursor = append_text(cursor, " | 0x");
    cursor = append_hex32(cursor, eax);
    cursor = append_text(cursor, " | 0x");
    cursor = append_hex32(cursor, ebx);
    cursor = append_text(cursor, " | ");
    cursor = append_bit(cursor, flags, 1U << 6);
    cursor = append_text(cursor, "  | ");
    cursor = append_bit(cursor, flags, 1U << 7);
    cursor = append_text(cursor, "  | ");
    cursor = append_bit(cursor, flags, 1U << 11);
    cursor = append_text(cursor, "  | ");
    cursor = append_text(cursor, taken != 0U ? "是" : "否");
    return append_text(cursor, "\n");
}

__attribute__((noreturn, noinline, used)) void _start(void) {
    char output[2048];
    char *cursor = output;
    capture_branches();
    branches_checkpoint();

    cursor = append_text(cursor, "asm-branches-01（i386 固定快照）\n");
    cursor = append_padded(cursor, "情形", 12);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, "指令", 22);
    cursor = append_text(cursor, " | EAX        | EBX        | ZF | SF | OF | 跳转\n");
    cursor = append_case(cursor, "零值检测", "test eax,eax; je", test_eax, 0,
                         test_flags, test_taken);
    cursor = append_case(cursor, "相等比较", "cmp eax,ebx; je", equal_eax, equal_ebx,
                         equal_flags, equal_taken);
    cursor = append_case(cursor, "有符号大于", "cmp eax,ebx; jg", greater_eax, greater_ebx,
                         greater_flags, greater_taken);

    syscall3(SYS_WRITE, 1, (long)output, (long)(cursor - output));
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
