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

/* name 与 is_admin 紧挨着存放：name 只有 16 字节，is_admin 就在它后面。 */
char name[16];
int is_admin;

__attribute__((noreturn, noinline)) void _start(void) {
    print("name 缓冲区: 0x");
    print_hex((unsigned)name);
    print(" （只有 16 字节）\n");
    print("is_admin 标志: 0x");
    print_hex((unsigned)&is_admin);
    print(" （当前为 0）\n");
    print("请输入名字: ");

    /* 故意的缺陷：读取 64 字节，但 name 只有 16 字节。 */
    syscall3(SYS_READ, 0, (long)name, 64);

    print("\nis_admin 现在的值: ");
    print_dec((unsigned)is_admin);
    print("\n");

    if (is_admin != 0) {
        print("PwnHub_admin_door_open: 门开了\n");
        syscall3(SYS_EXIT, 0, 0, 0);
        __builtin_unreachable();
    }
    print("权限不足，门没有开\n");
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
