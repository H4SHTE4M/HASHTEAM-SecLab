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

static void print_hex(unsigned value) {
    char buf[8];
    unsigned i = 0;
    do {
        unsigned digit = value & 0xf;
        buf[i++] = (char)(digit < 10 ? '0' + digit : 'a' + digit - 10);
        value >>= 4;
    } while (i < 8);
    while (i != 0) {
        char c = buf[--i];
        syscall3(SYS_WRITE, 1, (long)&c, 1);
    }
}

/*
 * 故意的缺陷：把用户的输入当成格式串来解释。
 * 每遇到一个 %x，就从调用者的栈格子里取一个四字节值打印出来。
 */
static void fmt_print(const char *f) {
    unsigned i = 0;
    unsigned slot = (unsigned)&f;
    while (*f != '\0') {
        if (f[0] == '%' && f[1] == 'x') {
            i++;
            print_hex(*(unsigned *)(slot + 4 * i));
            print(" ");
            f += 2;
            continue;
        }
        syscall3(SYS_WRITE, 1, (long)f, 1);
        f++;
    }
}

__attribute__((noinline)) static void chat(void) {
    /* 栈上先放好四个格子，秘密混在中间。 */
    unsigned cells[4];
    char name[32];
    long n;

    cells[0] = 0x11111111;
    cells[1] = 0x22222222;
    cells[2] = 0x0badf00d;
    cells[3] = 0x44444444;

    print("请输入名字: ");
    n = syscall3(SYS_READ, 0, (long)name, sizeof(name) - 1);
    if (n <= 0) {
        syscall3(SYS_EXIT, 1, 0, 0);
        __builtin_unreachable();
    }
    name[n] = '\0';
    if (n > 0 && name[n - 1] == '\n') name[n - 1] = '\0';

    print("你好， ");
    fmt_print(name);
    print("!\n");
}

__attribute__((noreturn, noinline)) void _start(void) {
    chat();
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
