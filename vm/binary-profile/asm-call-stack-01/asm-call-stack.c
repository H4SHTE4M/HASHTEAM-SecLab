#include <stdint.h>

#define SYS_EXIT 1
#define SYS_WRITE 4
#define TEACHING_STACK_SIZE 4096

static long syscall3(long number, long arg1, long arg2, long arg3) {
    long result;
    __asm__ volatile("int $0x80"
                     : "=a"(result)
                     : "0"(number), "b"(arg1), "c"(arg2), "d"(arg3)
                     : "memory");
    return result;
}

static uint8_t teaching_stack[TEACHING_STACK_SIZE] __attribute__((aligned(16), used));
static volatile uint32_t original_esp;
static volatile uint32_t original_ebp;
static volatile uint32_t caller_before_esp;
static volatile uint32_t argument_esp;
static volatile uint32_t callee_entry_esp;
static volatile uint32_t callee_frame_esp;
static volatile uint32_t callee_ebp;
static volatile uint32_t return_address;
static volatile uint32_t argument_value;
static volatile uint32_t local_value;
static volatile uint32_t after_return_esp;
static volatile uint32_t after_cleanup_esp;
static volatile uint32_t result_value;

/* A hand-written frame keeps the teaching snapshot independent of compiler prologues. */
__attribute__((naked, noinline, used)) static uint32_t teaching_callee(uint32_t argument) {
    __asm__ volatile(
        "movl %esp, callee_entry_esp\n\t"
        "pushl %ebp\n\t"
        "movl %esp, %ebp\n\t"
        "subl $4, %esp\n\t"
        "movl %esp, callee_frame_esp\n\t"
        "movl %ebp, callee_ebp\n\t"
        "movl 4(%ebp), %edx\n\t"
        "movl %edx, return_address\n\t"
        "movl 8(%ebp), %eax\n\t"
        "movl %eax, argument_value\n\t"
        "leal 1(%eax,%eax), %eax\n\t"
        "movl %eax, -4(%ebp)\n\t"
        "movl %eax, local_value\n\t"
        "leave\n\t"
        "ret\n\t");
}

/* Switch to a fixed in-ELF stack so every address shown by the course is reproducible. */
__attribute__((naked, noinline, used)) static uint32_t capture_call(void) {
    __asm__ volatile(
        "movl %esp, original_esp\n\t"
        "movl %ebp, original_ebp\n\t"
        "leal teaching_stack+4096, %esp\n\t"
        "xorl %ebp, %ebp\n\t"
        "movl %esp, caller_before_esp\n\t"
        "pushl $21\n\t"
        "movl %esp, argument_esp\n\t"
        "call teaching_callee\n\t"
        "movl %eax, result_value\n\t"
        "movl %esp, after_return_esp\n\t"
        "addl $4, %esp\n\t"
        "movl %esp, after_cleanup_esp\n\t"
        "movl original_ebp, %ebp\n\t"
        "movl original_esp, %esp\n\t"
        "movl result_value, %eax\n\t"
        "ret\n\t");
}

static char *append_text(char *cursor, const char *text) {
    while (*text != '\0') *cursor++ = *text++;
    return cursor;
}

static unsigned display_width(const char *text) {
    unsigned width = 0;
    while (*text != '\0') {
        unsigned char byte = (unsigned char)*text++;
        width += byte < 0x80U ? 1U : 2U;
        while (byte >= 0x80U && (*text & 0xc0) == 0x80) text++;
    }
    return width;
}

static char *append_padded(char *cursor, const char *text, unsigned width) {
    unsigned used = display_width(text);
    cursor = append_text(cursor, text);
    while (used < width) {
        *cursor++ = ' ';
        used++;
    }
    return cursor;
}

static char *append_hex32(char *cursor, uint32_t value) {
    static const char digits[] = "0123456789abcdef";
    for (int shift = 28; shift >= 0; shift -= 4) {
        *cursor++ = digits[(value >> shift) & 0xfU];
    }
    return cursor;
}

static char *append_phase(char *cursor, const char *name, uint32_t esp, uint32_t ebp,
                          const char *detail) {
    cursor = append_padded(cursor, "阶段", 4);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, name, 6);
    cursor = append_text(cursor, " | 0x");
    cursor = append_hex32(cursor, esp);
    cursor = append_text(cursor, " | 0x");
    cursor = append_hex32(cursor, ebp);
    cursor = append_text(cursor, " | ");
    cursor = append_text(cursor, detail);
    return append_text(cursor, "\n");
}

static char *append_stack(char *cursor, const char *name, uint32_t address, uint32_t value) {
    cursor = append_padded(cursor, "stack", 5);
    cursor = append_text(cursor, " | 0x");
    cursor = append_hex32(cursor, address);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, name, 28);
    cursor = append_text(cursor, " | 0x");
    cursor = append_hex32(cursor, value);
    return append_text(cursor, "\n");
}

static char *append_trace(char *cursor, const char *kind, const char *function_name,
                          const char *instruction, uint32_t esp) {
    cursor = append_padded(cursor, "轨迹", 4);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, kind, 4);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, function_name, 18);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, instruction, 24);
    cursor = append_text(cursor, " | 0x");
    cursor = append_hex32(cursor, esp);
    return append_text(cursor, "\n");
}

__attribute__((noreturn, noinline, used)) void _start(void) {
    char output[4096];
    char *cursor = output;
    capture_call();

    cursor = append_text(cursor, "asm-call-stack-01（i386 固定快照）\n");
    cursor = append_padded(cursor, "阶段", 4);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, "名称", 6);
    cursor = append_text(cursor, " | ESP        | EBP        | 说明\n");
    cursor = append_phase(cursor, "调用方", caller_before_esp, 0, "压入参数前");
    cursor = append_phase(cursor, "参数", argument_esp, 0, "push 参数");
    cursor = append_phase(cursor, "入口", callee_entry_esp, 0, "call 已压入返回地址");
    cursor = append_phase(cursor, "栈帧", callee_frame_esp, callee_ebp, "序言分配局部变量");
    cursor = append_phase(cursor, "返回", after_return_esp, 0, "ret 弹出返回地址");
    cursor = append_phase(cursor, "清理", after_cleanup_esp, 0, "调用方 add esp, 4");
    cursor = append_padded(cursor, "stack", 5);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, "地址", 10);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, "变量名 / 位置", 28);
    cursor = append_text(cursor, " | 变量值\n");
    cursor = append_stack(cursor, "局部变量(local_value)", callee_ebp - 4U, local_value);
    cursor = append_stack(cursor, "保存的EBP(saved_ebp)", callee_ebp, 0);
    cursor = append_stack(cursor, "返回地址(return_address)", callee_ebp + 4U, return_address);
    cursor = append_stack(cursor, "参数(argument_value)", callee_ebp + 8U, argument_value);
    cursor = append_padded(cursor, "轨迹", 4);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, "类型", 4);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, "函数", 18);
    cursor = append_text(cursor, " | ");
    cursor = append_padded(cursor, "指令", 24);
    cursor = append_text(cursor, " | ESP\n");
    cursor = append_trace(cursor, "调用", "capture_call", "call teaching_callee", argument_esp);
    cursor = append_trace(cursor, "当前", "teaching_callee", "push ebp; mov ebp, esp", callee_frame_esp);
    cursor = append_trace(cursor, "返回", "teaching_callee", "leave; ret", after_return_esp);
    cursor = append_text(cursor, "结果 | 0x");
    cursor = append_hex32(cursor, result_value);
    cursor = append_text(cursor, "\n");

    syscall3(SYS_WRITE, 1, (long)output, (long)(cursor - output));
    syscall3(SYS_EXIT, 0, 0, 0);
    __builtin_unreachable();
}
