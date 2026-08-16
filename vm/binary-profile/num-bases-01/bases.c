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

__attribute__((noreturn, noinline)) void _start(void) {
    print("三种写法，同一个数\n");
    print("同一个字节 202，可以写成三种进制：\n");
    print("十进制 202\n");
    print("十六进制 0xca\n");
    print("二进制 11001010\n");
    print("它们是完全相同的值，只是写法不同。\n");
    print("再举一个例子：0x2a 写成十进制就是 42。\n");

    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
