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

__attribute__((noinline)) static void vulnerable(void) {
    char buffer[64];
    syscall3(SYS_READ, 0, (long)buffer, 256);
}

__attribute__((noreturn, noinline)) void _start(void) {
    vulnerable();
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
