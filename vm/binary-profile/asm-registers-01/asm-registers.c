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

static volatile uint32_t mov_eax_before;
static volatile uint32_t mov_eax_after;
static volatile uint32_t lea_ebx;
static volatile uint32_t lea_ecx_before;
static volatile uint32_t lea_ecx_after;

__attribute__((noinline, used)) static void capture_registers(void) {
    __asm__ volatile(
        "xorl %%eax, %%eax\n\t"
        "movl %%eax, %[mov_before]\n\t"
        "movl $0x11223344, %%eax\n\t"
        "movl %%eax, %[mov_after]\n\t"
        "movl $0x00001000, %%ebx\n\t"
        "xorl %%ecx, %%ecx\n\t"
        "movl %%ebx, %[lea_base]\n\t"
        "movl %%ecx, %[lea_before]\n\t"
        "leal 12(%%ebx), %%ecx\n\t"
        "movl %%ecx, %[lea_after]\n\t"
        : [mov_before] "=m"(mov_eax_before),
          [mov_after] "=m"(mov_eax_after),
          [lea_base] "=m"(lea_ebx),
          [lea_before] "=m"(lea_ecx_before),
          [lea_after] "=m"(lea_ecx_after)
        :
        : "eax", "ebx", "ecx", "cc", "memory");
}

__attribute__((naked, noinline, used)) static void registers_checkpoint(void) {
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

static char *append_role(char *cursor, const char *name, const char *role) {
    cursor = append_padded(cursor, "职责", 4);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, name, 7);
    cursor = append_text(cursor, " | ");
    cursor = append_text(cursor, role);
    return append_text(cursor, "\n");
}

static char *append_operation(char *cursor, const char *name, const char *instruction,
                              const char *target, uint32_t before, uint32_t after) {
    cursor = append_padded(cursor, "操作", 4);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, name, 4);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, instruction, 26);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, target, 4);
    cursor = append_text(cursor, " | 0x");
    cursor = append_hex32(cursor, before);
    cursor = append_text(cursor, " | 0x");
    cursor = append_hex32(cursor, after);
    return append_text(cursor, "\n");
}

__attribute__((noreturn, noinline, used)) void _start(void) {
    char output[2048];
    char *cursor = output;
    capture_registers();
    __asm__ volatile("movl %[eax_value], %%eax\n\t"
                     "movl %[ecx_value], %%ecx\n\t"
                     "call registers_checkpoint\n\t"
                     :
                     : [eax_value] "m"(mov_eax_after), [ecx_value] "m"(lea_ecx_after)
                     : "eax", "ecx", "memory");

    cursor = append_text(cursor, "asm-registers-01（i386 固定快照）\n");
    cursor = append_padded(cursor, "职责", 4);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, "寄存器", 7);
    cursor = append_text(cursor, " | 常见约定\n");
    cursor = append_role(cursor, "EIP", "指向当前要执行的指令");
    cursor = append_role(cursor, "ESP", "指向当前栈顶");
    cursor = append_role(cursor, "EBP", "作为当前栈帧的稳定基准");
    cursor = append_role(cursor, "EAX", "保存常见算术结果和函数返回值");
    cursor = append_role(cursor, "EBX", "本样本保存地址表达式的基址");
    cursor = append_role(cursor, "ECX/EDX", "常作计数、临时值或除法配合寄存器");
    cursor = append_padded(cursor, "操作", 4);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, "名称", 4);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, "指令", 26);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, "目标", 4);
    cursor = append_text(cursor, " | 前值       | 后值\n");
    cursor = append_operation(cursor, "mov", "mov eax, 0x11223344", "EAX",
                              mov_eax_before, mov_eax_after);
    cursor = append_operation(cursor, "lea", "lea ecx, [ebx+0x0c]", "ECX",
                              lea_ecx_before, lea_ecx_after);
    cursor = append_text(cursor, "基址 | EBX | 0x");
    cursor = append_hex32(cursor, lea_ebx);
    cursor = append_text(cursor, "\n");

    syscall3(SYS_WRITE, 1, (long)output, (long)(cursor - output));
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
