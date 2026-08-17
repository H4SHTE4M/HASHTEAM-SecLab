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

__attribute__((noreturn, noinline)) void _start(void) {
    unsigned balance = 1000;
    const unsigned price = 16777216; /* 2 的 24 次方 */
    char input[32];
    long n;

    print("欢迎来到 PwnHub 商店。\n");
    print("余额: 1000 金币\n");
    print("商品单价: 16777216 金币\n");
    print("输入购买数量: ");

    n = syscall3(SYS_READ, 0, (long)input, sizeof(input));
    if (n <= 0) {
        syscall3(SYS_EXIT, 1, 0, 0);
        __builtin_unreachable();
    }
    input[n - 1] = '\0';

    unsigned count = 0;
    for (long i = 0; input[i] >= '0' && input[i] <= '9'; i++) {
        count = count * 10 + (unsigned)(input[i] - '0');
    }

    unsigned cost = count * price; /* 32 位无符号乘法：乘积放不下就回绕 */
    print("系统计算: ");
    print_dec(count);
    print(" x 16777216 = ");
    print_dec(cost);
    print("\n");

    if (cost <= balance) {
        balance -= cost;
        print("购买成功! 扣款 ");
        print_dec(cost);
        print("，剩余 ");
        print_dec(balance);
        print("\n");
        if (count != 0 && cost == 0) {
            print("PwnHub_integer_wrap: 乘积回绕为 0，余额检查失效\n");
        }
    } else {
        print("余额不足，需要 ");
        print_dec(cost);
        print("\n");
    }

    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
