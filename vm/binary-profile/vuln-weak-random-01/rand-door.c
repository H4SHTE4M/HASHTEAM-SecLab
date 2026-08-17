#define SYS_EXIT 1
#define SYS_READ 3
#define SYS_WRITE 4
#define SYS_TIME 13

static long syscall1(long number, long arg1) {
    long result;
    __asm__ volatile("int $0x80"
                     : "=a"(result)
                     : "0"(number), "b"(arg1)
                     : "memory");
    return result;
}

static long syscall3(long number, long arg1, long arg2, long arg3) {
    long result;
    __asm__ volatile("int $0x80"
                     : "=a"(result)
                     : "0"(number), "b"(arg1), "c"(arg2), "d"(arg3)
                     : "memory");
    return result;
}

static unsigned strlen_(const char *s) {
    unsigned n = 0;
    while (s[n] != '\0') n++;
    return n;
}

static void print(const char *s) {
    syscall3(SYS_WRITE, 1, (long)s, strlen_(s));
}

static void print_dec(unsigned value) {
    char buf[10];
    unsigned i = 0;
    if (value == 0) {
        print("0");
        return;
    }
    while (value != 0) {
        buf[i++] = (char)('0' + value % 10);
        value /= 10;
    }
    while (i != 0) {
        char c = buf[--i];
        syscall3(SYS_WRITE, 1, (long)&c, 1);
    }
}

static unsigned parse_dec(const char *s) {
    unsigned value = 0;
    while (*s >= '0' && *s <= '9') {
        value = value * 10 + (unsigned)(*s - '0');
        s++;
    }
    return value;
}

/* 与许多真实程序同款的线性同余伪随机生成器：同一种子永远得到同一序列。 */
static unsigned lcg_next(unsigned state) {
    return state * 1103515245u + 12345u;
}

static unsigned password_for_seed(unsigned seed) {
    return 100000u + lcg_next(seed) % 900000u;
}

static void print_password(unsigned seed) {
    print_dec(password_for_seed(seed));
    print("\n");
}

__attribute__((noreturn, noinline)) void _start(void) {
    long *stack = (long *)__builtin_frame_address(0) + 1;
    long argc = stack[0];
    char **argv = (char **)&stack[1];

    if (argc >= 3 && argv[1][0] == '-' && argv[1][1] == '-' &&
        argv[1][2] == 's' && argv[1][3] == 'e' && argv[1][4] == 'e' &&
        argv[1][5] == 'd' && argv[1][6] == '\0') {
        unsigned seed = parse_dec(argv[2]);
        print("种子 ");
        print_dec(seed);
        print(" 的口令: ");
        print_password(seed);
        syscall1(SYS_EXIT, 0);
        __builtin_unreachable();
    }

    unsigned now = (unsigned)syscall1(SYS_TIME, 0);
    unsigned today = now / 86400u;
    print("门内时钟: ");
    print_dec(now);
    print(" 秒（从 1970-01-01 起算）\n");
    print("今日口令: ");
    print_password(today);
    syscall1(SYS_EXIT, 0);
    __builtin_unreachable();
}
