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
static const char section_message[] =
    "elf-sections-01 样本已运行：代码、只读常量、已初始化数据和未初始化数据彼此分区。\n";

__attribute__((used, section(".data")))
volatile unsigned int initialized_counter = 0x11223344U;

__attribute__((used, section(".bss")))
volatile unsigned int pending_counter;

__attribute__((noinline, used)) static void prepare_sections(void) {
    pending_counter = initialized_counter + 1U;
}

__attribute__((noreturn, noinline, used)) void _start(void) {
    prepare_sections();
    syscall3(SYS_WRITE, 1, (long)section_message, sizeof(section_message) - 1);
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
