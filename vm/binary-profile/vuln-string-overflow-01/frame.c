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

/* 帧底地址放在全局数据里：栈溢出改不到它，读完后仍能观察返回地址。 */
static unsigned g_frame;

__attribute__((noinline)) static void greet(void) {
    char buf[16];
    unsigned saved_ebp;
    unsigned saved_eip;

    g_frame = (unsigned)__builtin_frame_address(0);
    saved_ebp = *(unsigned *)g_frame;
    saved_eip = *(unsigned *)(g_frame + 4);

    print("buf 缓冲区: 0x");
    print_hex((unsigned)buf);
    print(" （16 字节）\n");
    print("保存的 EBP 在 0x");
    print_hex(g_frame);
    print("，当前值 0x");
    print_hex(saved_ebp);
    print("\n");
    print("保存的返回地址在 0x");
    print_hex(g_frame + 4);
    print("，当前值 0x");
    print_hex(saved_eip);
    print("\n请输入: ");

    /* 故意的缺陷：读取 48 字节，但 buf 只有 16 字节，会一直写到返回地址。 */
    syscall3(SYS_READ, 0, (long)buf, 48);

    print("\n读完后，保存的 EBP 现在是: 0x");
    print_hex(*(unsigned *)g_frame);
    print("\n读完后，保存的返回地址现在是: 0x");
    print_hex(*(unsigned *)(g_frame + 4));
    print("\n即将返回……\n");
}

__attribute__((noreturn, noinline)) void _start(void) {
    greet();
    print("正常结束\n");
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
