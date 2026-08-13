#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/memory-register-stack"
ANSWER_HASH="$LAB_DIR/answer.sha256"
EXPECTED_SHA256='39088feedfa54f33289fd875a5ccd7a8094a5e17a239f1122928243c55a1e74a'

if [ "$#" -ne 4 ]; then
    echo '需要四个观察值：第二个值入栈后的栈顶地址、两次取出值和随后栈顶值。' >&2
    exit 1
fi

normalize_hex() {
    printf '%s' "$1" | tr 'A-F' 'a-f'
}

second_top_address="$(normalize_hex "$1")"
first_removed_value="$(normalize_hex "$2")"
after_first_top_value="$(normalize_hex "$3")"
second_removed_value="$(normalize_hex "$4")"

for item in "$second_top_address" "$first_removed_value" "$after_first_top_value" "$second_removed_value"; do
    printf '%s\n' "$item" | grep -Eq '^0x[0-9a-f]{8}$' || {
        echo '四项观察值都必须是 0x 加八位十六进制。' >&2
        exit 1
    }
done

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo '栈行为样本缺失。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo '栈行为样本校验失败。' >&2
    exit 1
}

tmp="$(mktemp "${TMPDIR:-/tmp}/memory-register-stack.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
if ! timeout 2 "$PROGRAM" > "$tmp" 2>/dev/null; then
    echo '真实 ELF 重放失败。' >&2
    exit 1
fi
[ "$(wc -c < "$tmp")" -le 2048 ] || { echo '样本输出超过限制。' >&2; exit 1; }

row_field() {
    awk -F '|' -v stage="$1" -v field="$2" '
        {
            gsub(/^[ \t]+|[ \t]+$/, "", $1)
        }
        $1 == stage {
            for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i)
            print $field
            exit
        }
    ' "$tmp"
}

observed_second_top_address="$(row_field '第二个值入栈后' 2)"
observed_first_removed_value="$(row_field '第一次出栈后' 4)"
observed_after_first_top_value="$(row_field '第一次出栈后' 3)"
observed_second_removed_value="$(row_field '第二次出栈后' 4)"

[ "$(row_field '开始' 2)" = '0x0804c160' ] &&
[ "$(row_field '第一个值入栈后' 2)" = '0x0804c15c' ] &&
[ "$(row_field '第一个值入栈后' 3)" = '0x11111111' ] &&
[ "$observed_second_top_address" = '0x0804c158' ] &&
[ "$(row_field '第二个值入栈后' 3)" = '0x22222222' ] &&
[ "$observed_first_removed_value" = '0x22222222' ] &&
[ "$observed_after_first_top_value" = '0x11111111' ] &&
[ "$(row_field '第一次出栈后' 2)" = '0x0804c15c' ] &&
[ "$observed_second_removed_value" = '0x11111111' ] &&
[ "$(row_field '第二次出栈后' 2)" = '0x0804c160' ] || {
    echo '样本输出与锁定的栈顶、入栈和出栈事实不一致。' >&2
    exit 1
}

canonical="$second_top_address,$first_removed_value,$after_first_top_value,$second_removed_value"
digest="$(printf 'hashteam-lab answer v1 memory-register-stack-01:%s' "$canonical" | sha256sum | cut -d ' ' -f 1)"
[ "$digest" = "$(tr -d '\r\n ' < "$ANSWER_HASH")" ] || {
    echo '观察值与样本事实不一致。' >&2
    exit 1
}

echo 'memory-register-stack replay passed'
