#define SYS_EXIT 1
#define SYS_READ 3
#define SYS_WRITE 4

static long syscall3(long number, long arg1, long arg2, long arg3) {
    long result;
    __asm__ volatile("int $0x80"
                     : "=a"(result)
                     : "0"(number), "b"(arg1), "c"(arg2), "d"(arg3)
                     : "memory");
    return result;
}

__attribute__((used, section(".data")))
volatile unsigned int observed_value = 0x01020304U;

__attribute__((used, section(".rodata")))
static const char normal_message[] =
    "gdb-runtime-01: normal execution finished; result=0x0000004b\n";

__attribute__((used, section(".rodata")))
static const char input_message[] =
    "gdb-runtime-01: redirected input did not request the controlled crash\n";

__attribute__((naked, noinline, used))
void gdb_after_update(unsigned int value) {
    __asm__ volatile(
        "movl 4(%esp), %eax\n"
        "ret\n");
}

__attribute__((noinline, used))
unsigned int update_cell(unsigned int input) {
    unsigned int local_value = input + 7U;
    observed_value = local_value ^ 0x55U;
    gdb_after_update(observed_value);
    return observed_value;
}

__attribute__((noinline, used))
unsigned int frame_middle(unsigned int input) {
    unsigned int local_value = input * 2U;
    return update_cell(local_value) + 3U;
}

__attribute__((noinline, used))
unsigned int frame_outer(unsigned int input) {
    unsigned int local_value = input + 1U;
    return frame_middle(local_value);
}

static int requests_crash(const char *buffer, long length) {
    static const char expected[] = "CRASH";
    int index;

    if (length < 5) {
        return 0;
    }
    for (index = 0; index < 5; index++) {
        if (buffer[index] != expected[index]) {
            return 0;
        }
    }
    return 1;
}

__attribute__((noinline, used))
void crash_from_input(const char *buffer, long length) {
    volatile unsigned int *invalid_address = (volatile unsigned int *)0x41414141U;

    if (requests_crash(buffer, length)) {
        *invalid_address = 0xdec0de42U;
    }
}

__attribute__((noreturn, noinline, used))
void program_entry(unsigned long *initial_stack) {
    unsigned long argc = initial_stack[0];
    char **argv = (char **)&initial_stack[1];

    if (argc > 1 && argv[1][0] == 'c') {
        char input[16];
        long length = syscall3(SYS_READ, 0, (long)input, sizeof(input));
        crash_from_input(input, length);
        syscall3(SYS_WRITE, 1, (long)input_message, sizeof(input_message) - 1);
        syscall3(SYS_EXIT, 0, 0, 0);
    }

    if (frame_outer(10U) == 0x4bU) {
        syscall3(SYS_WRITE, 1, (long)normal_message, sizeof(normal_message) - 1);
        syscall3(SYS_EXIT, 0, 0, 0);
    }
    syscall3(SYS_EXIT, 1, 0, 0);
    __builtin_unreachable();
}

__attribute__((naked, noreturn, used))
void _start(void) {
    __asm__ volatile(
        "movl %esp, %eax\n"
        "pushl %eax\n"
        "call program_entry\n"
        "ud2\n");
}
