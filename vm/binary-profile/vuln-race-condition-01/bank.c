#define SYS_EXIT 1
#define SYS_READ 3
#define SYS_WRITE 4
#define SYS_OPEN 5
#define SYS_CLOSE 6
#define SYS_NANOSLEEP 162

#define O_WRONLY 01
#define O_CREAT 0100
#define O_TRUNC 01000
#define O_APPEND 02000

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

static unsigned parse_dec(const char *s, unsigned *out) {
    unsigned value = 0;
    if (!(*s >= '0' && *s <= '9')) return 0;
    while (*s >= '0' && *s <= '9') {
        value = value * 10 + (unsigned)(*s - '0');
        s++;
    }
    *out = value;
    return 1;
}

static int read_file(const char *path, char *buf, unsigned max) {
    long fd = syscall3(SYS_OPEN, (long)path, 0, 0);
    if (fd < 0) return -1;
    long n = syscall3(SYS_READ, fd, (long)buf, max - 1);
    syscall1(SYS_CLOSE, fd);
    if (n <= 0) return -1;
    buf[n] = '\0';
    return 0;
}

static int write_file(const char *path, const char *buf, unsigned len, int append) {
    long fd = syscall3(SYS_OPEN, (long)path,
                       O_WRONLY | O_CREAT | (append ? O_APPEND : O_TRUNC), 0644);
    if (fd < 0) return -1;
    syscall3(SYS_WRITE, fd, (long)buf, len);
    syscall1(SYS_CLOSE, fd);
    return 0;
}

static void sleep3(void) {
    long ts[2] = { 3, 0 };
    syscall3(SYS_NANOSLEEP, (long)ts, 0, 0);
}

__attribute__((noreturn, noinline)) void _start(void) {
    long *stack = (long *)__builtin_frame_address(0) + 1;
    long argc = stack[0];
    char **argv = (char **)&stack[1];
    char **envp = (char **)&stack[2 + argc];

    const char *home = "";
    for (char **e = envp; *e != 0; e++) {
        char *v = *e;
        if (v[0] == 'H' && v[1] == 'O' && v[2] == 'M' && v[3] == 'E' && v[4] == '=') {
            home = v + 5;
            break;
        }
    }

    unsigned amount = 0;
    if (argc < 2 || !parse_dec(argv[1], &amount) || amount == 0) {
        print("用法: bank <取款金额>\n");
        syscall1(SYS_EXIT, 2);
        __builtin_unreachable();
    }

    char balance_path[256];
    char ledger_path[256];
    {
        unsigned h = strlen_(home);
        const char *mid = "/vuln-race-condition-01/";
        unsigned m = strlen_(mid);
        const char *bf = "balance.txt";
        const char *lf = "ledger";
        unsigned i = 0;
        for (unsigned j = 0; j < h; j++) balance_path[i++] = home[j];
        for (unsigned j = 0; j < m; j++) balance_path[i++] = mid[j];
        for (unsigned j = 0; bf[j] != '\0'; j++) balance_path[i++] = bf[j];
        balance_path[i] = '\0';
        i = 0;
        for (unsigned j = 0; j < h; j++) ledger_path[i++] = home[j];
        for (unsigned j = 0; j < m; j++) ledger_path[i++] = mid[j];
        for (unsigned j = 0; lf[j] != '\0'; j++) ledger_path[i++] = lf[j];
        ledger_path[i] = '\0';
    }

    char content[16];
    if (read_file(balance_path, content, sizeof(content)) != 0) {
        print("账户不存在，请先确认实验环境。\n");
        syscall1(SYS_EXIT, 1);
        __builtin_unreachable();
    }
    unsigned balance = 0;
    parse_dec(content, &balance);

    print("当前余额: ");
    print_dec(balance);
    print("\n");

    if (amount > balance) {
        print("余额不足，取款失败\n");
        syscall1(SYS_EXIT, 1);
        __builtin_unreachable();
    }

    /* 故意的缺陷：检查与扣款之间隔了 3 秒，期间余额可能被别的进程改动。 */
    print("余额检查通过，3 秒后扣款...\n");
    sleep3();

    balance -= amount;
    char out[16];
    unsigned oi = 0;
    if (balance == 0) {
        out[oi++] = '0';
    } else {
        char tmp[10];
        unsigned ti = 0;
        unsigned v = balance;
        while (v != 0) {
            tmp[ti++] = (char)('0' + v % 10);
            v /= 10;
        }
        while (ti != 0) out[oi++] = tmp[--ti];
    }
    out[oi++] = '\n';
    write_file(balance_path, out, oi, 0);

    char line[64];
    unsigned li = 0;
    const char *prefix = "取出 ";
    for (unsigned j = 0; prefix[j] != '\0'; j++) line[li++] = prefix[j];
    {
        char tmp[10];
        unsigned ti = 0;
        unsigned v = amount;
        while (v != 0) {
            tmp[ti++] = (char)('0' + v % 10);
            v /= 10;
        }
        while (ti != 0) line[li++] = tmp[--ti];
    }
    const char *suffix = " 成功\n";
    for (unsigned j = 0; suffix[j] != '\0'; j++) line[li++] = suffix[j];
    write_file(ledger_path, line, li, 1);

    print("取款成功: ");
    print_dec(amount);
    print("，余额剩余 ");
    print_dec(balance);
    print("\n");
    syscall1(SYS_EXIT, 0);
    __builtin_unreachable();
}
