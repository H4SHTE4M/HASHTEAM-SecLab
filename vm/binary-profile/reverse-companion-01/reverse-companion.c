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
static const char sample_banner[] = "PwnHub reverse companion: observed result follows.\n";

__attribute__((used, section(".rodata")))
static const char success_marker[] = "ACCESS-GRANTED";

__attribute__((used, section(".rodata")))
static const char failure_marker[] = "ACCESS-DENIED";

__attribute__((used, section(".bss")))
volatile unsigned int last_decision;

__attribute__((noinline, used))
static void emit_message(const char *message, unsigned int length) {
    syscall3(SYS_WRITE, 1, (long)message, length);
    syscall3(SYS_WRITE, 1, (long)"\n", 1);
}

__attribute__((noinline, used))
unsigned int stage_gate(unsigned int candidate) {
    if (candidate == 0x2dU) {
        return 1U;
    }
    return 0U;
}

__attribute__((noinline, used))
void stage_report(unsigned int accepted) {
    if (accepted != 0U) {
        emit_message(success_marker, sizeof(success_marker) - 1U);
        return;
    }
    emit_message(failure_marker, sizeof(failure_marker) - 1U);
}

__attribute__((noreturn, noinline, used))
void _start(void) {
    syscall3(SYS_WRITE, 1, (long)sample_banner, sizeof(sample_banner) - 1U);
    last_decision = stage_gate(0x2dU);
    stage_report(last_decision);
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
