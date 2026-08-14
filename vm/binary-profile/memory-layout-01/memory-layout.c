#include <stdint.h>

#define SYS_EXIT 1
#define SYS_WRITE 4
#define SYS_BRK 45

static long syscall1(long number, long arg1) {
    long result;
    __asm__ volatile("int $0x80" : "=a"(result) : "0"(number), "b"(arg1) : "memory");
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

/* Fixed data gives the debugger a stable, inspectable read-only teaching fact. */
static volatile uint32_t layout_data = 0x4d415053U;
static volatile uint32_t heap_base;
static volatile uint32_t heap_limit;

static char *append_text(char *cursor, const char *text) {
    while (*text != '\0') *cursor++ = *text++;
    return cursor;
}

static char *append_hex32(char *cursor, uint32_t value) {
    static const char digits[] = "0123456789abcdef";
    cursor = append_text(cursor, "0x");
    for (int shift = 28; shift >= 0; shift -= 4) *cursor++ = digits[(value >> shift) & 0xfU];
    return cursor;
}

__attribute__((noreturn, noinline, used)) void _start(void) {
    char output[256];
    char *cursor = output;
    long current_break = syscall1(SYS_BRK, 0);
    heap_base = (uint32_t)current_break;
    heap_limit = (uint32_t)syscall1(SYS_BRK, current_break + 4096);
    __asm__ volatile("movl $0x00000007, %%eax\n\t"
                     "layout_checkpoint:\n\t"
                     "movl %%eax, %%ecx\n\t"
                     :
                     :
                     : "eax", "ecx", "memory");
    cursor = append_text(cursor, "memory-layout-01 (debugger map target)\n");
    cursor = append_text(cursor, "data=");
    cursor = append_hex32(cursor, layout_data);
    cursor = append_text(cursor, " heap=");
    cursor = append_hex32(cursor, heap_base);
    cursor = append_text(cursor, "-");
    cursor = append_hex32(cursor, heap_limit);
    cursor = append_text(cursor, "\n");
    syscall3(SYS_WRITE, 1, (long)output, (long)(cursor - output));
    syscall1(SYS_EXIT, 0);
    __builtin_unreachable();
}
