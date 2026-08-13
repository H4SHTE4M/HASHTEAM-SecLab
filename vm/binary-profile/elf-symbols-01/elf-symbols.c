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
static const char symbol_message[] =
    "elf-symbols-01 样本已运行：符号名称把函数和数据连接到具体地址。\n";

__attribute__((used, section(".data")))
volatile unsigned int initialized_seed = 7U;

__attribute__((used, section(".bss")))
volatile unsigned int pending_total;

__attribute__((noinline, used)) static unsigned int mix_value(unsigned int value) {
    return value * 3U + 1U;
}

__attribute__((noinline, used)) unsigned int compute_total(unsigned int value) {
    pending_total = mix_value(value) + initialized_seed;
    return pending_total;
}

__attribute__((noreturn, noinline, used)) void _start(void) {
    compute_total(5U);
    syscall3(SYS_WRITE, 1, (long)symbol_message, sizeof(symbol_message) - 1);
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
