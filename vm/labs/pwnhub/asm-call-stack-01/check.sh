#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/asm-call-stack"
ANSWER_HASH="$LAB_DIR/answer.sha256"
EXPECTED_SHA256='1fd5e07c8b83e5d681164dde7ab590c50a1b8028c26b9405d9304279913de5c0'

if [ "$#" -ne 5 ]; then
    echo '需要五个观察值：返回地址、参数值、局部值、清理字节数和 EAX 返回值。' >&2
    exit 1
fi

return_address="$(printf '%s' "$1" | tr 'A-F' 'a-f')"
argument_value="$(printf '%s' "$2" | tr 'A-F' 'a-f')"
local_value="$(printf '%s' "$3" | tr 'A-F' 'a-f')"
cleanup_bytes="$4"
return_value="$(printf '%s' "$5" | tr 'A-F' 'a-f')"

for item in "$return_address" "$argument_value" "$local_value" "$return_value"; do
    printf '%s\n' "$item" | grep -Eq '^0x[0-9a-f]{8}$' || {
        echo '地址和值必须是 0x 加八位十六进制。' >&2
        exit 1
    }
done
case "$cleanup_bytes" in
    ''|*[!0-9]*) echo '清理字节数必须是非负十进制整数。' >&2; exit 1 ;;
esac

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
