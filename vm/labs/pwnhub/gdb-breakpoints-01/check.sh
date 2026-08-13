#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/gdb-runtime"
GDB="${PWNHUB_GDB:-/usr/local/bin/gdb}"
EXPECTED_PROGRAM_SHA256='b5560fdf2ab16ffa5b3004ceeb3eaec0363b7c99bb3142927a9feb3df33b66e4'
EXPECTED_GDB_SHA256='5bed8004d18a154d4358b82c4068c33e7649c02d9cdd9801e8db55dd100ae216'

[ "$#" -eq 2 ] || { echo '需要两个运行时观察值：命中的函数名和该函数收到的十进制参数。' >&2; exit 1; }
function_name="$1"
input_value="$2"
printf '%s\n' "$function_name" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*$' || {
    echo '函数名格式不正确，请填写 GDB 断点命中行中的名称。' >&2
    exit 1
}
printf '%s\n' "$input_value" | grep -Eq '^[0-9]+$' || {
    echo '参数应填写十进制整数。' >&2
    exit 1
}
[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo 'GDB 样本缺失。' >&2; exit 1; }
[ -f "$GDB" ] && [ ! -L "$GDB" ] || { echo 'GDB 工具缺失。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_PROGRAM_SHA256" ] || { echo 'GDB 样本校验失败。' >&2; exit 1; }
[ "$(sha256sum "$GDB" | cut -d ' ' -f 1)" = "$EXPECTED_GDB_SHA256" ] || { echo 'GDB 工具校验失败。' >&2; exit 1; }

output="$(LC_ALL=C "$GDB" --nx --batch -q "$PROGRAM" -ex 'break update_cell' -ex run -ex 'printf "PWNHUB_INPUT=%u\n", input')"
actual_function="$(printf '%s\n' "$output" | sed -n 's/^Breakpoint [0-9][0-9]*, \([A-Za-z_][A-Za-z0-9_]*\) (.*/\1/p' | head -n 1)"
actual_input="$(printf '%s\n' "$output" | sed -n 's/^PWNHUB_INPUT=\([0-9][0-9]*\)$/\1/p')"
[ -n "$actual_function" ] && [ -n "$actual_input" ] || { echo '真实 GDB 会话没有命中预期断点。' >&2; exit 1; }
[ "$function_name" = "$actual_function" ] && [ "$input_value" = "$actual_input" ] || {
    echo '观察值与真实断点会话不一致，请核对命中行和参数列表。' >&2
    exit 1
}
echo 'gdb breakpoints replay passed'
