#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/asm-stack-ops"
ANSWER_HASH="$LAB_DIR/answer.sha256"
EXPECTED_SHA256='f9cacce544588e61133416667bd6f8ccde415489d88633e71c5395ba78b717fb'

if [ "$#" -ne 4 ]; then
    echo '需要四个观察值：两次 push 后的 ESP，以及两次 pop 取出的值。' >&2
    exit 1
fi

values=''
for argument in "$@"; do
    value="$(printf '%s' "$argument" | tr 'A-F' 'a-f')"
    printf '%s\n' "$value" | grep -Eq '^0x[0-9a-f]{8}$' || {
        echo '地址和值都必须是 0x 加八位十六进制。' >&2
        exit 1
    }
    [ -z "$values" ] || values="$values,"
    values="$values$value"
done

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo '栈操作样本缺失。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo '栈操作样本校验失败。' >&2
    exit 1
}

tmp="$(mktemp "${TMPDIR:-/tmp}/asm-stack-ops.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
if ! timeout 2 "$PROGRAM" > "$tmp" 2>/dev/null; then
    echo '真实 ELF 重放失败。' >&2
    exit 1
fi
[ "$(wc -c < "$tmp")" -le 2048 ] || { echo '样本输出超过限制。' >&2; exit 1; }

field_for() {
    awk -F '|' -v instruction="$1" -v field="$2" '
        {
            for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i)
            if ($1 == instruction) { print $field; exit }
        }
    ' "$tmp"
}

first_push_esp="$(field_for 'push 0x11111111' 2)"
second_push_esp="$(field_for 'push 0x22222222' 2)"
first_pop_value="$(field_for 'pop eax' 5)"
second_pop_value="$(field_for 'pop ebx' 5)"

[ "$(field_for '开始' 2)" = '0x0804c0e0' ] &&
[ "$first_push_esp" = '0x0804c0dc' ] &&
[ "$second_push_esp" = '0x0804c0d8' ] &&
[ "$(field_for 'pop eax' 2)" = '0x0804c0dc' ] &&
[ "$(field_for 'pop ebx' 2)" = '0x0804c0e0' ] &&
[ "$first_pop_value" = '0x22222222' ] &&
[ "$second_pop_value" = '0x11111111' ] || {
    echo '样本输出与锁定的 push/pop 快照不一致。' >&2
    exit 1
}

digest="$(printf 'hashteam-lab answer v1 asm-stack-ops-01:%s' "$values" | sha256sum | cut -d ' ' -f 1)"
[ "$digest" = "$(tr -d '\r\n ' < "$ANSWER_HASH")" ] || {
    echo '观察值与样本事实不一致，请按指令顺序核对 ESP 和取出值。' >&2
    exit 1
}
[ "$values" = "$first_push_esp,$second_push_esp,$first_pop_value,$second_pop_value" ] || {
    echo '观察值与本次真实重放不一致。' >&2
    exit 1
}

echo 'asm-stack-ops replay passed'
