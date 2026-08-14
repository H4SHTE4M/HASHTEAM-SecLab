#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/asm-arithmetic"
ANSWER_HASH="$LAB_DIR/answer.sha256"
EXPECTED_SHA256='c7d1958a0c25812b7ffe1f4a90348fcced1bd3f65f3a0fba98e4132aede92dd0'

if [ "$#" -ne 5 ]; then
    echo '需要五个观察值：加减结果、乘积、除法商、除法余数和位运算结果。' >&2
    exit 1
fi

values=''
for argument in "$@"; do
    value="$(printf '%s' "$argument" | tr 'A-F' 'a-f')"
    printf '%s\n' "$value" | grep -Eq '^0x[0-9a-f]{8}$' || {
        echo '所有结果都必须是 0x 加八位十六进制。' >&2
        exit 1
    }
    [ -z "$values" ] || values="$values,"
    values="$values$value"
done

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo '算术样本缺失。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo '算术样本校验失败。' >&2
    exit 1
}

tmp="$(mktemp "${TMPDIR:-/tmp}/asm-arithmetic.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
if ! timeout 2 "$PROGRAM" > "$tmp" 2>/dev/null; then
    echo '真实 ELF 重放失败。' >&2
    exit 1
fi
[ "$(wc -c < "$tmp")" -le 2048 ] || { echo '样本输出超过限制。' >&2; exit 1; }

row_value() {
    awk -F '|' -v instruction="$1" '
        {
            for (i = 1; i <= 4; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i)
            if ($2 == instruction) { print $4; exit }
        }
    ' "$tmp"
}

observed_sub="$(row_value 'sub eax, 4')"
observed_mul="$(row_value 'imul eax, ebx')"
observed_quotient="$(row_value 'idiv ebx')"
observed_remainder="$(row_value 'idiv 后的 EDX')"
observed_xor="$(row_value 'xor eax, 0x11')"

[ "$(row_value 'add eax, 7')" = '0x00000011' ] &&
[ "$observed_sub" = '0x0000000d' ] &&
[ "$observed_mul" = '0x0000002a' ] &&
[ "$observed_quotient" = '0x00000008' ] &&
[ "$observed_remainder" = '0x00000003' ] &&
[ "$(row_value 'and eax, 0x3c')" = '0x00000030' ] &&
[ "$(row_value 'or eax, 0x03')" = '0x00000033' ] &&
[ "$observed_xor" = '0x00000022' ] || {
    echo '样本输出与锁定的算术快照不一致。' >&2
    exit 1
}

digest="$(printf 'hashteam-lab answer v1 asm-arithmetic-01:%s' "$values" | sha256sum | cut -d ' ' -f 1)"
[ "$digest" = "$(tr -d '\r\n ' < "$ANSWER_HASH")" ] || {
    echo '观察值与样本事实不一致，请分别核对商、余数和最终位模式。' >&2
    exit 1
}
[ "$values" = "$observed_sub,$observed_mul,$observed_quotient,$observed_remainder,$observed_xor" ] || {
    echo '观察值与本次真实重放不一致。' >&2
    exit 1
}

echo 'asm-arithmetic replay passed'
