#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/reverse-companion"
NM="${PWNHUB_NM:-/usr/local/bin/nm}"
OBJDUMP="${PWNHUB_OBJDUMP:-/usr/local/bin/objdump}"
EXPECTED_PROGRAM_SHA256='a1d48129804d6eee16ddf44e8697b780dc47a9b2b088503bc5a41fe7543d66cb'
EXPECTED_NM_SHA256='608bb8aa47218aa818e08e32d85fd4baf294cb05afcf9950d4169367c408a625'
EXPECTED_OBJDUMP_SHA256='dd8bcd1a98c0136042cf1246d1e36153183485647b6f7e5cd676b3b915aace1b'

[ "$#" -eq 2 ] || { echo '需要两个静态观察值：目标字符串地址和引用它的函数名。' >&2; exit 1; }
submitted_address="$(printf '%s' "$1" | tr 'A-F' 'a-f')"
submitted_address="${submitted_address#0x}"
submitted_address="$(printf '%s' "$submitted_address" | sed 's/^0*//')"
[ -n "$submitted_address" ] || submitted_address=0
submitted_function="$2"
printf '%s\n' "$submitted_address" | grep -Eq '^[0-9a-f]{1,8}$' || {
    echo '字符串地址应填写最多八位十六进制值，可带 0x。' >&2
    exit 1
}
printf '%s\n' "$submitted_function" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*$' || {
    echo '函数名格式不正确。' >&2
    exit 1
}

for locked in \
    "$PROGRAM:$EXPECTED_PROGRAM_SHA256:ELF 样本" \
    "$NM:$EXPECTED_NM_SHA256:nm 工具" \
    "$OBJDUMP:$EXPECTED_OBJDUMP_SHA256:objdump 工具"; do
    file_path="${locked%%:*}"
    remainder="${locked#*:}"
    expected_hash="${remainder%%:*}"
    label="${remainder#*:}"
    [ -f "$file_path" ] && [ ! -L "$file_path" ] || { echo "$label 缺失。" >&2; exit 1; }
    [ "$(sha256sum "$file_path" | cut -d ' ' -f 1)" = "$expected_hash" ] || {
        echo "$label 校验失败。" >&2
        exit 1
    }
done

actual_address="$(LC_ALL=C "$NM" -n "$PROGRAM" | awk '$3 == "success_marker" { print $1; exit }')"
actual_address="$(printf '%s' "$actual_address" | sed 's/^0*//')"
dump="$(LC_ALL=C "$OBJDUMP" -d -M intel "$PROGRAM")"
actual_function="$(printf '%s\n' "$dump" | awk -v needle="0x$actual_address" '
    /^[0-9a-f]+ <[^>]+>:/ { name=$2; gsub(/[<>:]/, "", name) }
    index(tolower($0), needle) { print name; exit }
')"
[ -n "$actual_address" ] && [ -n "$actual_function" ] || {
    echo '无法从真实 ELF 建立字符串与代码引用关系。' >&2
    exit 1
}

[ "$submitted_address" = "$actual_address" ] && [ "$submitted_function" = "$actual_function" ] || {
    echo '观察值与真实 ELF 不一致，请复核字符串虚拟地址和引用所在函数。' >&2
    exit 1
}
echo 'reverse strings and xrefs replay passed'
