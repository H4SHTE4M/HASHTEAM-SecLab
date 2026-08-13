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

__attribute__((used, section(".rodata")))
static const char analysis_marker[] = "PwnHub_ELF_marker: ORBIT-386";

__attribute__((noinline, used)) static void show_runtime_message(void) {
    static const char message[] = "elf-bytes-01 只读样本已运行。\n";
    syscall3(SYS_WRITE, 1, (long)message, sizeof(message) - 1);
}

__attribute__((noreturn, noinline, used)) void _start(void) {
    show_runtime_message();
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
