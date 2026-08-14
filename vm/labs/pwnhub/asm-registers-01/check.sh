#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/asm-registers"
ANSWER_HASH="$LAB_DIR/answer.sha256"
EXPECTED_SHA256='ab2122285db34dbe4e3c6b96879113b4dba2246396965dad3bc8ba262e503115'

if [ "$#" -ne 3 ]; then
    echo '需要三个观察值：mov 后 EAX、lea 后 ECX、指向栈顶的寄存器。' >&2
    exit 1
fi

mov_after="$(printf '%s' "$1" | tr 'A-F' 'a-f')"
lea_after="$(printf '%s' "$2" | tr 'A-F' 'a-f')"
stack_register="$(printf '%s' "$3" | tr 'a-z' 'A-Z')"

for item in "$mov_after" "$lea_after"; do
    printf '%s\n' "$item" | grep -Eq '^0x[0-9a-f]{8}$' || {
        echo '寄存器值必须是 0x 加八位十六进制。' >&2
        exit 1
    }
done
printf '%s\n' "$stack_register" | grep -Eq '^E[A-Z]{2}$' || {
    echo '寄存器请使用输出中的三个大写字母。' >&2
    exit 1
}

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo '寄存器样本缺失。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo '寄存器样本校验失败。' >&2
    exit 1
}

tmp="$(mktemp "${TMPDIR:-/tmp}/asm-registers.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
if ! timeout 2 "$PROGRAM" > "$tmp" 2>/dev/null; then
    echo '真实 ELF 重放失败。' >&2
    exit 1
fi
[ "$(wc -c < "$tmp")" -le 2048 ] || { echo '样本输出超过限制。' >&2; exit 1; }

operation_value() {
    awk -F '|' -v operation="$1" '
        $1 ~ /操作/ {
            for (i = 1; i <= 6; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i)
            if ($2 == operation) { print $6; exit }
        }
    ' "$tmp"
}

observed_mov="$(operation_value mov)"
observed_lea="$(operation_value lea)"
observed_stack_register="$(awk -F '|' '
    $1 ~ /职责/ {
        for (i = 1; i <= 3; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i)
        if ($3 ~ /栈顶/) { print $2; exit }
    }
' "$tmp")"
observed_base="$(awk -F '|' '$1 ~ /基址/ { for (i = 1; i <= 3; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); print $3; exit }' "$tmp")"

[ "$observed_mov" = '0x11223344' ] &&
[ "$observed_lea" = '0x0000100c' ] &&
[ "$observed_base" = '0x00001000' ] &&
[ "$observed_stack_register" = 'ESP' ] || {
    echo '样本输出与锁定的寄存器快照不一致。' >&2
    exit 1
}

canonical="$mov_after,$lea_after,$stack_register"
digest="$(printf 'hashteam-lab answer v1 asm-registers-01:%s' "$canonical" | sha256sum | cut -d ' ' -f 1)"
[ "$digest" = "$(tr -d '\r\n ' < "$ANSWER_HASH")" ] || {
    echo '观察值与样本事实不一致，请重新核对目标寄存器和地址计算。' >&2
    exit 1
}
[ "$mov_after" = "$observed_mov" ] &&
[ "$lea_after" = "$observed_lea" ] &&
[ "$stack_register" = "$observed_stack_register" ] || {
    echo '观察值与本次真实重放不一致。' >&2
    exit 1
}

echo 'asm-registers replay passed'
