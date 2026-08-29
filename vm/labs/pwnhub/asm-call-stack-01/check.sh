#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/asm-call-stack"
ANSWER_HASH="$LAB_DIR/answer.sha256"
EXPECTED_SHA256='bc8371c0e3f9645844bfe71320c01e004ec7015070db8fc87697b49a78187bd0'

if [ "$#" -ne 5 ]; then
    echo '需要五个观察值：返回地址、参数值、局部值、清理字节数和 EAX 返回值。' >&2
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

# The cleanup distance is a size, not a representation exercise. Accept the
# common integer forms and reduce them to one decimal value before hashing.
normalize_integer() {
    raw="$1"
    case "$raw" in
        0x*|0X*)
            base=16
            digits="${raw#0x}"
            [ "$digits" != "$raw" ] || digits="${raw#0X}"
            digits="$(printf '%s' "$digits" | tr 'A-F' 'a-f')"
            pattern='[!0-9a-f]'
            ;;
        0b*|0B*)
            base=2
            digits="${raw#0b}"
            [ "$digits" != "$raw" ] || digits="${raw#0B}"
            pattern='[!01]'
            ;;
        0o*|0O*)
            base=8
            digits="${raw#0o}"
            [ "$digits" != "$raw" ] || digits="${raw#0O}"
            pattern='[!0-7]'
            ;;
        *)
            base=10
            digits="$raw"
            pattern='[!0-9]'
            ;;
    esac
    case "$digits" in
        ''|*${pattern}*) return 1 ;;
    esac
    awk -v digits="$digits" -v base="$base" '
        BEGIN {
            value = 0
            for (i = 1; i <= length(digits); i++) {
                digit = index("0123456789abcdef", substr(digits, i, 1)) - 1
                if (digit < 0 || digit >= base) exit 1
                value = value * base + digit
                if (value > 4294967295) exit 1
            }
            printf "%.0f\n", value
        }
    '
}

return_address="$(normalize_hex32 "$1")" || { echo '返回地址应以 0x 开头。' >&2; exit 1; }
argument_value="$(normalize_hex32 "$2")" || { echo '参数值应以 0x 开头。' >&2; exit 1; }
local_value="$(normalize_hex32 "$3")" || { echo '局部值应以 0x 开头。' >&2; exit 1; }
cleanup_bytes="$(normalize_integer "$4")" || { echo '清理字节数应是非负整数，不限定进制。' >&2; exit 1; }
return_value="$(normalize_hex32 "$5")" || { echo 'EAX 返回值应以 0x 开头。' >&2; exit 1; }

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo 'call/ret 栈样本缺失。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo 'call/ret 栈样本校验失败。' >&2
    exit 1
}

tmp="$(mktemp "${TMPDIR:-/tmp}/asm-call-stack.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
if ! timeout 2 "$PROGRAM" > "$tmp" 2>/dev/null; then
    echo '真实 ELF 重放失败。' >&2
    exit 1
fi
[ "$(wc -c < "$tmp")" -le 2048 ] || { echo '样本输出超过限制。' >&2; exit 1; }

[ "$(awk -F '|' '$1 ~ /stack/ { for (i = 1; i <= 4; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($3 ~ /返回地址/) { print $4; exit } }' "$tmp")" = '0x08049081' ] &&
[ "$(awk -F '|' '$1 ~ /stack/ { for (i = 1; i <= 4; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($3 ~ /参数/) { print $4; exit } }' "$tmp")" = '0x00000015' ] &&
[ "$(awk -F '|' '$1 ~ /stack/ { for (i = 1; i <= 4; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($3 ~ /局部变量/) { print $4; exit } }' "$tmp")" = '0x0000002b' ] &&
[ "$(awk -F '|' '$1 ~ /阶段/ { for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($2 == "返回") { print $3; exit } }' "$tmp")" = '0x0804c24c' ] &&
[ "$(awk -F '|' '$1 ~ /阶段/ { for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($2 == "清理") { print $3; exit } }' "$tmp")" = '0x0804c250' ] &&
[ "$(awk -F '|' '$1 ~ /轨迹/ { for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($2 == "调用") { print $4; exit } }' "$tmp")" = 'call teaching_callee' ] || {
    echo '样本输出与锁定的 call/ret 栈帧快照不一致。' >&2
    exit 1
}

observed_return_value="$(awk -F '|' '$1 ~ /结果/ { gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2; exit }' "$tmp")"
[ "$observed_return_value" = '0x0000002b' ] || {
    echo '样本输出中的 EAX 返回值与锁定快照不一致。' >&2
    exit 1
}

canonical="$return_address,$argument_value,$local_value,$cleanup_bytes,$return_value"
digest="$(printf 'hashteam-lab answer v1 asm-call-stack-01:%s' "$canonical" | sha256sum | cut -d ' ' -f 1)"
[ "$digest" = "$(tr -d '\r\n ' < "$ANSWER_HASH")" ] || {
    echo '观察值与样本事实不一致。' >&2
    exit 1
}
[ "$return_address" = '0x08049081' ] &&
[ "$argument_value" = '0x00000015' ] &&
[ "$local_value" = '0x0000002b' ] &&
[ "$cleanup_bytes" = '4' ] &&
[ "$return_value" = "$observed_return_value" ] || {
    echo '观察值与本次真实重放不一致，请核对栈表、ESP 差值和 EAX 结果。' >&2
    exit 1
}

echo 'asm-call-stack replay passed'
