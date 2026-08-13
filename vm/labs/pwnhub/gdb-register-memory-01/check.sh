#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/gdb-runtime"
GDB="${PWNHUB_GDB:-/usr/local/bin/gdb}"
EXPECTED_PROGRAM_SHA256='b5560fdf2ab16ffa5b3004ceeb3eaec0363b7c99bb3142927a9feb3df33b66e4'
EXPECTED_GDB_SHA256='5bed8004d18a154d4358b82c4068c33e7649c02d9cdd9801e8db55dd100ae216'

[ "$#" -eq 3 ] || { echo '需要三个运行时观察值：EAX、变量地址和该地址中的四字节值。' >&2; exit 1; }
normalize_hex() {
    value="$(printf '%s' "$1" | tr 'A-F' 'a-f')"
    value="${value#0x}"
    printf '%s\n' "$value" | grep -Eq '^[0-9a-f]{1,8}$' || return 1
    value="$(printf '%s' "$value" | sed 's/^0*//')"
    [ -n "$value" ] || value=0
    printf '%s\n' "$value"
}
eax_value="$(normalize_hex "$1")" || { echo 'EAX 应填写不超过八位的十六进制值，可带 0x。' >&2; exit 1; }
address_value="$(normalize_hex "$2")" || { echo '变量地址应填写不超过八位的十六进制值，可带 0x。' >&2; exit 1; }
memory_value="$(normalize_hex "$3")" || { echo '内存值应填写不超过八位的十六进制值，可带 0x。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_PROGRAM_SHA256" ] || { echo 'GDB 样本校验失败。' >&2; exit 1; }
[ "$(sha256sum "$GDB" | cut -d ' ' -f 1)" = "$EXPECTED_GDB_SHA256" ] || { echo 'GDB 工具校验失败。' >&2; exit 1; }

output="$(LC_ALL=C "$GDB" --nx --batch -q "$PROGRAM" -ex 'break gdb_after_update' -ex run -ex 'printf "PWNHUB_EAX=%x PWNHUB_ADDRESS=%x PWNHUB_MEMORY=%x\n", $eax, &observed_value, observed_value')"
actual_eax="$(printf '%s\n' "$output" | sed -n 's/^PWNHUB_EAX=\([0-9a-f][0-9a-f]*\) .*$/\1/p')"
actual_address="$(printf '%s\n' "$output" | sed -n 's/^.*PWNHUB_ADDRESS=\([0-9a-f][0-9a-f]*\) .*$/\1/p')"
actual_memory="$(printf '%s\n' "$output" | sed -n 's/^.*PWNHUB_MEMORY=\([0-9a-f][0-9a-f]*\)$/\1/p')"
[ -n "$actual_eax" ] && [ -n "$actual_address" ] && [ -n "$actual_memory" ] || { echo '真实 GDB 会话没有生成寄存器与内存观察值。' >&2; exit 1; }
[ "$eax_value" = "$actual_eax" ] && [ "$address_value" = "$actual_address" ] && [ "$memory_value" = "$actual_memory" ] || {
    echo '观察值与真实运行不一致，请在同一停靠点重新比较寄存器、地址和内存。' >&2
    exit 1
}
echo 'gdb register memory replay passed'
