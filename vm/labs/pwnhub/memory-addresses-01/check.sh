#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/memory-addresses"
ANSWER_HASH="$LAB_DIR/answer.sha256"
EXPECTED_SHA256='0bd88729bc6b5f3119f6024ff924b90acdcf8cb7001f139009fb924eb65a5c3b'

if [ "$#" -ne 4 ]; then
    echo '需要四个观察值：地址、内存值、指针值、有符号值' >&2
    exit 1
fi

normalize_hex32() {
    value="$(printf '%s' "$1" | tr 'A-F' 'a-f')"
    case "$value" in
        0x*) value="${value#0x}" ;;
        0X*) value="${value#0X}" ;;
        *) return 1 ;;
    esac
    case "$value" in
        ''|*[!0-9a-f]*) return 1 ;;
    esac
    value="$(printf '%s' "$value" | sed 's/^0*//')"
    [ -n "$value" ] || value=0
    [ "${#value}" -le 8 ] || return 1
    printf '0x%08s' "$value" | tr ' ' '0'
}

normalize_signed_decimal() {
    sign=''
    digits="$1"
    case "$digits" in
        -*) sign='-'; digits="${digits#-}" ;;
    esac
    case "$digits" in
        ''|*[!0-9]*) return 1 ;;
    esac
    digits="$(printf '%s' "$digits" | sed 's/^0*//')"
    [ -n "$digits" ] || { printf '0'; return; }
    printf '%s%s' "$sign" "$digits"
}

address="$(normalize_hex32 "$1")" || { echo '地址应是以 0x 开头的十六进制值。' >&2; exit 1; }
value="$(normalize_hex32 "$2")" || { echo '内存值应是以 0x 开头的十六进制值。' >&2; exit 1; }
pointer="$(normalize_hex32 "$3")" || { echo '指针值应是以 0x 开头的十六进制值。' >&2; exit 1; }
signed="$(normalize_signed_decimal "$4")" || { echo '有符号值应是十进制整数。' >&2; exit 1; }

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
[ "$address" = "$(normalize_hex32 "$observed_address")" ] || { echo '地址观察值不一致。' >&2; exit 1; }
[ "$value" = "$(normalize_hex32 "$observed_value")" ] || { echo '内存值观察值不一致。' >&2; exit 1; }
[ "$pointer" = "$(normalize_hex32 "$observed_pointer")" ] || { echo '指针观察值不一致。' >&2; exit 1; }
[ "$signed" = "$observed_signed" ] || { echo '有符号值观察值不一致。' >&2; exit 1; }
[ "$value" = "$(normalize_hex32 "$observed_target")" ] || { echo '指针解引用观察值不一致。' >&2; exit 1; }

echo 'memory-addresses replay passed'
