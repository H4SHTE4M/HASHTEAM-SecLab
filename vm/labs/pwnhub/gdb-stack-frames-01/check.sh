#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/gdb-runtime"
GDB="${PWNHUB_GDB:-/usr/local/bin/gdb}"
EXPECTED_PROGRAM_SHA256='b5560fdf2ab16ffa5b3004ceeb3eaec0363b7c99bb3142927a9feb3df33b66e4'
EXPECTED_GDB_SHA256='5bed8004d18a154d4358b82c4068c33e7649c02d9cdd9801e8db55dd100ae216'

[ "$#" -eq 5 ] || { echo '需要五个调用栈观察值：从当前帧开始的四个函数名，以及 frame_middle 的十进制参数。' >&2; exit 1; }
for name in "$1" "$2" "$3" "$4"; do
    printf '%s\n' "$name" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*$' || { echo '函数名格式不正确。' >&2; exit 1; }
done
printf '%s\n' "$5" | grep -Eq '^[0-9]+$' || { echo '参数应填写十进制整数。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_PROGRAM_SHA256" ] || { echo 'GDB 样本校验失败。' >&2; exit 1; }
[ "$(sha256sum "$GDB" | cut -d ' ' -f 1)" = "$EXPECTED_GDB_SHA256" ] || { echo 'GDB 工具校验失败。' >&2; exit 1; }

output="$(LC_ALL=C "$GDB" --nx --batch -q "$PROGRAM" -ex 'break gdb_after_update' -ex run -ex backtrace -ex 'frame 2' -ex 'printf "PWNHUB_ARGUMENT=%u\n", input')"
frame_name() {
    printf '%s\n' "$output" | awk -v frame="#$1" '
        $1 == frame {
            for (i = 2; i <= NF; i++) {
                if ($i == "in" && i < NF) { print $(i + 1); exit }
            }
            print $2; exit
        }
    '
}
actual_0="$(frame_name 0)"
actual_1="$(frame_name 1)"
actual_2="$(frame_name 2)"
actual_3="$(frame_name 3)"
actual_argument="$(printf '%s\n' "$output" | sed -n 's/^PWNHUB_ARGUMENT=\([0-9][0-9]*\)$/\1/p')"
[ -n "$actual_0" ] && [ -n "$actual_1" ] && [ -n "$actual_2" ] && [ -n "$actual_3" ] && [ -n "$actual_argument" ] || {
    echo '真实 GDB 会话没有生成完整调用栈。' >&2
    exit 1
}
[ "$1" = "$actual_0" ] && [ "$2" = "$actual_1" ] && [ "$3" = "$actual_2" ] && [ "$4" = "$actual_3" ] && [ "$5" = "$actual_argument" ] || {
    echo '观察值与真实调用栈不一致，请按帧号重新核对函数和当前帧参数。' >&2
    exit 1
}
echo 'gdb stack frames replay passed'
