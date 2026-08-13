#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/gdb-runtime"
GDB="${PWNHUB_GDB:-/usr/local/bin/gdb}"
INPUT="$LAB_DIR/crash.txt"
EXPECTED_PROGRAM_SHA256='b5560fdf2ab16ffa5b3004ceeb3eaec0363b7c99bb3142927a9feb3df33b66e4'
EXPECTED_GDB_SHA256='5bed8004d18a154d4358b82c4068c33e7649c02d9cdd9801e8db55dd100ae216'

[ "$#" -eq 3 ] || { echo '需要三个崩溃观察值：信号名、当前函数和非法目标地址。' >&2; exit 1; }
signal_name="$(printf '%s' "$1" | tr 'a-z' 'A-Z')"
function_name="$2"
invalid_address="$(printf '%s' "$3" | tr 'A-F' 'a-f')"
invalid_address="${invalid_address#0x}"
printf '%s\n' "$signal_name" | grep -Eq '^SIG[A-Z0-9]+$' || { echo '信号名应使用 GDB 显示的 SIG 开头名称。' >&2; exit 1; }
printf '%s\n' "$function_name" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*$' || { echo '函数名格式不正确。' >&2; exit 1; }
printf '%s\n' "$invalid_address" | grep -Eq '^[0-9a-f]{1,8}$' || { echo '非法目标地址应填写十六进制值，可带 0x。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_PROGRAM_SHA256" ] || { echo 'GDB 样本校验失败。' >&2; exit 1; }
[ "$(sha256sum "$GDB" | cut -d ' ' -f 1)" = "$EXPECTED_GDB_SHA256" ] || { echo 'GDB 工具校验失败。' >&2; exit 1; }

output="$(cd "$LAB_DIR" && LC_ALL=C "$GDB" --nx --batch -q "$PROGRAM" -ex 'run crash < crash.txt' -ex backtrace -ex 'frame 0' -ex 'printf "PWNHUB_ADDRESS=%x\n", invalid_address')"
actual_signal="$(printf '%s\n' "$output" | sed -n 's/^Program received signal \([^,]*\),.*$/\1/p')"
actual_function="$(printf '%s\n' "$output" | sed -n 's/^#0  .* in \([A-Za-z_][A-Za-z0-9_]*\) (.*/\1/p; s/^#0  *\([A-Za-z_][A-Za-z0-9_]*\) (.*/\1/p' | head -n 1)"
actual_address="$(printf '%s\n' "$output" | sed -n 's/^PWNHUB_ADDRESS=\([0-9a-f][0-9a-f]*\)$/\1/p')"
[ -n "$actual_signal" ] && [ -n "$actual_function" ] && [ -n "$actual_address" ] || { echo '真实 GDB 会话没有产生完整崩溃证据。' >&2; exit 1; }
[ "$signal_name" = "$actual_signal" ] && [ "$function_name" = "$actual_function" ] && [ "$invalid_address" = "$actual_address" ] || {
    echo '观察值与真实崩溃不一致，请核对信号、#0 函数和当前帧中的非法地址。' >&2
    exit 1
}
echo 'gdb input crash replay passed'
