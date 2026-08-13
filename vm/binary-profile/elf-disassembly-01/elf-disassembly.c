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
static const char disassembly_message[] =
    "elf-disassembly-01 样本已运行：从符号地址进入真实指令和静态控制流。\n";

__attribute__((used, section(".bss")))
volatile unsigned int pending_result;

__attribute__((noinline, used)) static unsigned int choose_path(unsigned int value) {
    if (value == 7U) {
        return value + 5U;
    }
    return value - 1U;
}

__attribute__((noinline, used)) unsigned int compute_result(unsigned int value) {
    pending_result = choose_path(value);
    return pending_result;
}

__attribute__((noreturn, noinline, used)) void _start(void) {
    compute_result(7U);
    syscall3(SYS_WRITE, 1, (long)disassembly_message, sizeof(disassembly_message) - 1);
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
