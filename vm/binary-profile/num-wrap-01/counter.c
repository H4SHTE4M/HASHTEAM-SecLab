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

__attribute__((noreturn, noinline)) void _start(void) {
    long *stack = (long *)__builtin_frame_address(0) + 1;
    long argc = stack[0];
    char **argv = (char **)&stack[1];

    if (argc >= 3) {
        unsigned a = parse_dec(argv[1]);
        unsigned b = parse_dec(argv[2]);
        unsigned sum = a + b;
        unsigned wrapped = sum % 256u; /* 只保留最低 8 位 */
        print("A = ");
        print_dec(a);
        print("\nB = ");
        print_dec(b);
        print("\nA + B = ");
        print_dec(sum);
        print("\n8 位结果: ");
        print_dec(wrapped);
        print("\n解释: 一个 8 位计数器只能放 0..255；超出就把高位丢掉，只留下低 8 位。\n");
        if (sum != wrapped) {
            print("本例 A + B 超过了 255，所以发生了回绕。\n");
        } else {
            print("本例 A + B 没超过 255，正好放得下。\n");
        }

        syscall3(SYS_EXIT, 0, 0, 0);
        __builtin_unreachable();
    }

    print("8 位计数器从 252 开始数 8 下：\n");
    print("252 253 254 255 0 1 2 3\n");
    print("数到 255 再加 1，不是 256，而是回到 0。\n");
    print("8 位计数器装不下 256：256 = 100000000b 需要第 9 位，低 8 位全是 0。\n");
    print("所以 8 位里 255 + 1 = 0，这叫回绕（wraparound）。\n");
    print("带参数运行可试别的组合: ./counter A B 会打印 (A+B) 的低 8 位。\n");
    print("自己试试下面两组，check 会问它们的结果：\n");
    print("挑战一：173 + 100 的 8 位结果是多少？\n");
    print("挑战二：0xca + 0x80 的 8 位结果是多少？（先换算成十进制再算）\n");

    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
