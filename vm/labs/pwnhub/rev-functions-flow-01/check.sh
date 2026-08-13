#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/reverse-companion"
NM="${PWNHUB_NM:-/usr/local/bin/nm}"
OBJDUMP="${PWNHUB_OBJDUMP:-/usr/local/bin/objdump}"
EXPECTED_PROGRAM_SHA256='a1d48129804d6eee16ddf44e8697b780dc47a9b2b088503bc5a41fe7543d66cb'
EXPECTED_NM_SHA256='608bb8aa47218aa818e08e32d85fd4baf294cb05afcf9950d4169367c408a625'
EXPECTED_OBJDUMP_SHA256='dd8bcd1a98c0136042cf1246d1e36153183485647b6f7e5cd676b3b915aace1b'

[ "$#" -eq 4 ] || { echo '需要四个静态观察值：函数地址、函数名、比较常量和条件跳转。' >&2; exit 1; }
submitted_address="$(printf '%s' "$1" | tr 'A-F' 'a-f')"
submitted_address="${submitted_address#0x}"
submitted_address="$(printf '%s' "$submitted_address" | sed 's/^0*//')"
[ -n "$submitted_address" ] || submitted_address=0
submitted_function="$2"
submitted_constant="$3"
submitted_jump="$(printf '%s' "$4" | tr 'A-Z' 'a-z')"
printf '%s\n' "$submitted_address" | grep -Eq '^[0-9a-f]{1,8}$' || { echo '函数地址格式不正确。' >&2; exit 1; }
printf '%s\n' "$submitted_function" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*$' || { echo '函数名格式不正确。' >&2; exit 1; }
printf '%s\n' "$submitted_constant" | grep -Eq '^(0[xX][0-9a-fA-F]+|[0-9]+)$' || { echo '比较常量应使用十进制或 0x 开头的十六进制。' >&2; exit 1; }
printf '%s\n' "$submitted_jump" | grep -Eq '^j[a-z0-9]+$' || { echo '条件跳转应填写 j 开头的助记符。' >&2; exit 1; }
submitted_constant="$(printf '%d' "$submitted_constant" 2>/dev/null)" || { echo '比较常量超出支持范围。' >&2; exit 1; }

for locked in \
    "$PROGRAM:$EXPECTED_PROGRAM_SHA256:ELF 样本" \
    "$NM:$EXPECTED_NM_SHA256:nm 工具" \
    "$OBJDUMP:$EXPECTED_OBJDUMP_SHA256:objdump 工具"; do
    file_path="${locked%%:*}"
    remainder="${locked#*:}"
    expected_hash="${remainder%%:*}"
    label="${remainder#*:}"
    [ -f "$file_path" ] && [ ! -L "$file_path" ] || { echo "$label 缺失。" >&2; exit 1; }
    [ "$(sha256sum "$file_path" | cut -d ' ' -f 1)" = "$expected_hash" ] || { echo "$label 校验失败。" >&2; exit 1; }
done

symbols="$(LC_ALL=C "$NM" -n "$PROGRAM")"
actual_address="$(printf '%s\n' "$symbols" | awk '$3 == "stage_gate" { print $1; exit }')"
actual_function="$(printf '%s\n' "$symbols" | awk '$3 == "stage_gate" { print $3; exit }')"
actual_address="$(printf '%s' "$actual_address" | sed 's/^0*//')"
dump="$(LC_ALL=C "$OBJDUMP" -d -M intel --disassemble="$actual_function" "$PROGRAM")"
actual_constant_hex="$(printf '%s\n' "$dump" | awk '{ for (i = 1; i <= NF; i++) if ($i == "cmp") { value=$NF; sub(/^.*,/, "", value); sub(/^0x/, "", value); print value; exit } }')"
actual_jump="$(printf '%s\n' "$dump" | awk 'seen && $0 ~ /^[[:space:]]*[0-9a-f]+:/ { for (i = 1; i <= NF; i++) if ($i ~ /^j[a-z0-9]+$/) { print $i; exit } } /[[:space:]]cmp[[:space:]]/ { seen=1 }')"
[ -n "$actual_address" ] && [ -n "$actual_function" ] && [ -n "$actual_constant_hex" ] && [ -n "$actual_jump" ] || {
    echo '无法从真实 ELF 重建完整函数控制流事实。' >&2
    exit 1
}
actual_constant="$(printf '%d' "0x$actual_constant_hex")"

[ "$submitted_address" = "$actual_address" ] && \
[ "$submitted_function" = "$actual_function" ] && \
[ "$submitted_constant" = "$actual_constant" ] && \
[ "$submitted_jump" = "$actual_jump" ] || {
    echo '观察值与真实 ELF 不一致，请复核函数边界、比较操作数和紧随其后的条件跳转。' >&2
    exit 1
}
echo 'reverse functions and flow replay passed'
