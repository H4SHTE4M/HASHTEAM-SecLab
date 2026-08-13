#define SYS_EXIT 1
#define SYS_READ 3
#define SYS_WRITE 4

static volatile unsigned stage;

static long syscall3(long number, long arg1, long arg2, long arg3) {
    long result;
    __asm__ volatile("int $0x80"
                     : "=a"(result)
                     : "0"(number), "b"(arg1), "c"(arg2), "d"(arg3)
                     : "memory");
    return result;
}

__attribute__((noinline, used)) void step_one(void) { stage = 1; }
__attribute__((noinline, used)) void step_two(void) {
    if (stage == 1) stage = 2;
}
__attribute__((noreturn, noinline, used)) void finish(void) {
    static const char marker[] = "PwnHub ROP calls complete\n";
    if (stage == 2) {
        syscall3(SYS_WRITE, 1, (long)marker, sizeof(marker) - 1);
        syscall3(SYS_EXIT, 0, 0, 0);
    }
    syscall3(SYS_EXIT, 1, 0, 0);
    __builtin_unreachable();
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
