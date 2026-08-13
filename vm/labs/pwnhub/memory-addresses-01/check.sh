#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/memory-addresses"
ANSWER_HASH="$LAB_DIR/answer.sha256"
EXPECTED_SHA256='ef9beb6b8c9ce744d867d9df12983fe74dc5847c7aff223f000a59d88ad303b8'

if [ "$#" -ne 4 ]; then
    echo '需要四个观察值：地址、内存值、指针值、有符号值' >&2
    exit 1
fi

normalize_hex() {
    printf '%s' "$1" | tr 'A-F' 'a-f'
}

address="$(normalize_hex "$1")"
value="$(normalize_hex "$2")"
pointer="$(normalize_hex "$3")"
signed="$4"

for item in "$address" "$value" "$pointer"; do
    case "$item" in
        0x????????) ;;
        *) echo '地址、内存值和指针值必须是 0x 加八位十六进制。' >&2; exit 1 ;;
    esac
    printf '%s\n' "$item" | grep -Eq '^0x[0-9a-f]{8}$' || {
        echo '地址、内存值和指针值必须是 0x 加八位十六进制。' >&2
        exit 1
    }
done
case "$signed" in
    -[0-9]*|[0-9]*) ;;
    *) echo '有符号值必须是十进制整数。' >&2; exit 1 ;;
esac

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo '观测样本缺失。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo '观测样本校验失败。' >&2
    exit 1
}

tmp="$(mktemp "${TMPDIR:-/tmp}/memory-addresses.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
if ! timeout 2 "$PROGRAM" > "$tmp" 2>/dev/null; then
    echo '真实 ELF 重放失败。' >&2
    exit 1
fi
[ "$(wc -c < "$tmp")" -le 1024 ] || { echo '样本输出超过限制。' >&2; exit 1; }

observed_address="$(awk -F '|' '{ for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($2 == "cell") { print $1; exit } }' "$tmp")"
observed_value="$(awk -F '|' '{ for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($2 == "cell") { print $3; exit } }' "$tmp")"
observed_pointer="$(awk -F '|' '{ for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($2 == "cell_pointer") { print $3; exit } }' "$tmp")"
observed_signed="$(awk -F '|' '{ for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($2 == "signed_cell") { print $3; exit } }' "$tmp")"
observed_target="$(awk -F '|' '{ for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($2 == "*cell_pointer") { print $3; exit } }' "$tmp")"
[ -n "$observed_address" ] && [ -n "$observed_value" ] && [ -n "$observed_pointer" ] && [ -n "$observed_signed" ] && [ -n "$observed_target" ] || {
    echo '样本输出缺少完整观察字段。' >&2
    exit 1
}

canonical="$address,$value,$pointer,$signed"
digest="$(printf 'hashteam-lab answer v1 memory-addresses-01:%s' "$canonical" | sha256sum | cut -d ' ' -f 1)"
[ "$digest" = "$(tr -d '\r\n ' < "$ANSWER_HASH")" ] || {
    echo '观察值与样本事实不一致。' >&2
    exit 1
}
[ "$address" = "$(normalize_hex "$observed_address")" ] || { echo '地址观察值不一致。' >&2; exit 1; }
[ "$value" = "$(normalize_hex "$observed_value")" ] || { echo '内存值观察值不一致。' >&2; exit 1; }
[ "$pointer" = "$(normalize_hex "$observed_pointer")" ] || { echo '指针观察值不一致。' >&2; exit 1; }
[ "$signed" = "$observed_signed" ] || { echo '有符号值观察值不一致。' >&2; exit 1; }
[ "$value" = "$(normalize_hex "$observed_target")" ] || { echo '指针解引用观察值不一致。' >&2; exit 1; }

echo 'memory-addresses replay passed'
