#define SYS_EXIT 1
#define SYS_READ 3

static long syscall3(long number, long arg1, long arg2, long arg3) {
    long result;
    __asm__ volatile("int $0x80"
                     : "=a"(result)
                     : "0"(number), "b"(arg1), "c"(arg2), "d"(arg3)
                     : "memory");
    return result;
}

__attribute__((naked, used)) void pop_eax_ret(void) { __asm__ volatile("pop %eax; ret"); }
__attribute__((naked, used)) void pop_edx_ret(void) { __asm__ volatile("pop %edx; ret"); }

__attribute__((naked, used)) void check_registers(void) {
    __asm__ volatile(
        "cmpl $0x11112222, %eax\n"
        "jne 1f\n"
        "cmpl $0x33334444, %edx\n"
        "jne 1f\n"
        "movl $4, %eax\n"
        "movl $1, %ebx\n"
        "movl $marker, %ecx\n"
        "movl $30, %edx\n"
        "int $0x80\n"
        "xorl %ebx, %ebx\n"
        "movl $1, %eax\n"
        "int $0x80\n"
        "1:\n"
        "movl $1, %ebx\n"
        "movl $1, %eax\n"
        "int $0x80\n"
        ".pushsection .rodata\n"
        "marker: .ascii \"PwnHub ROP registers complete\\n\"\n"
        ".popsection\n");
}

__attribute__((noinline)) static void vulnerable(void) {
    char buffer[64];
    syscall3(SYS_READ, 0, (long)buffer, 256);
}

__attribute__((noreturn, noinline)) void _start(void) {
    vulnerable();
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
