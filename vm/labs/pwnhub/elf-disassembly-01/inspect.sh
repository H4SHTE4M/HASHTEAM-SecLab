#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/elf-disassembly"
OBJDUMP="${PWNHUB_OBJDUMP:-/usr/local/bin/objdump}"
EXPECTED_PROGRAM_SHA256='63deb66624d45292e645b51804c6f9802fa2dd86a2a86cb6dcba75e390fe2cea'
EXPECTED_OBJDUMP_SHA256='dd8bcd1a98c0136042cf1246d1e36153183485647b6f7e5cd676b3b915aace1b'

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo 'ELF 样本缺失。' >&2; exit 1; }
[ -f "$OBJDUMP" ] && [ ! -L "$OBJDUMP" ] || { echo 'objdump 工具缺失。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_PROGRAM_SHA256" ] || {
    echo 'ELF 样本校验失败。' >&2
    exit 1
}
[ "$(sha256sum "$OBJDUMP" | cut -d ' ' -f 1)" = "$EXPECTED_OBJDUMP_SHA256" ] || {
    echo 'objdump 工具校验失败。' >&2
    exit 1
}

printf '\nchoose_path 反汇编（objdump -d -M intel --disassemble=choose_path ./elf-disassembly）\n'
LC_ALL=C "$OBJDUMP" -d -M intel --disassemble=choose_path "$PROGRAM"

printf '\ncompute_result 调用轨迹（objdump -d -M intel --disassemble=compute_result ./elf-disassembly）\n'
LC_ALL=C "$OBJDUMP" -d -M intel --disassemble=compute_result "$PROGRAM"

cat <<'TEXT'

阅读提示：
- 每行依次是指令地址、机器字节、助记符和操作数；地址仍然来自符号表的虚拟地址。
- cmp 会设置 flags，jne 根据 flags 决定是否跳到另一条指令；call 把控制流交给另一个函数。
- 反汇编展示静态控制流，不代表这一次运行一定走过每一条分支。
TEXT
