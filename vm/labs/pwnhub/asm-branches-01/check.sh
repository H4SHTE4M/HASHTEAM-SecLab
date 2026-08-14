#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/asm-branches"
ANSWER_HASH="$LAB_DIR/answer.sha256"
EXPECTED_SHA256='e54508261abc8dbc007e42fc06be8236e6d44966a6a327945e5ba28e5e177959'

if [ "$#" -ne 5 ]; then
    echo '需要五个观察值：三个分支结果、je 依据和 jg 的符号条件。' >&2
    exit 1
fi

normalize_taken() {
    case "$(printf '%s' "$1" | tr 'A-Z' 'a-z')" in
        1|yes|是) printf 'yes' ;;
        0|no|否) printf 'no' ;;
        *) return 1 ;;
    esac
}

test_taken="$(normalize_taken "$1")" || { echo '跳转结果请填写 1（是）或 0（否）。' >&2; exit 1; }
equal_taken="$(normalize_taken "$2")" || { echo '跳转结果请填写 1（是）或 0（否）。' >&2; exit 1; }
greater_taken="$(normalize_taken "$3")" || { echo '跳转结果请填写 1（是）或 0（否）。' >&2; exit 1; }
je_flag="$(printf '%s' "$4" | tr 'a-z' 'A-Z')"
jg_relation="$(printf '%s' "$5" | tr 'a-z' 'A-Z')"

printf '%s\n' "$je_flag" | grep -Eq '^(ZF|CF|SF|OF)$' || {
    echo 'je 依据请使用一个界面中的 flag 缩写。' >&2
    exit 1
}
printf '%s\n' "$jg_relation" | grep -Eq '^(ZF|CF|SF|OF)=(ZF|CF|SF|OF)$' || {
    echo 'jg 的符号条件请写成 FLAG=FLAG。' >&2
    exit 1
}

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo '条件分支样本缺失。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo '条件分支样本校验失败。' >&2
    exit 1
}

tmp="$(mktemp "${TMPDIR:-/tmp}/asm-branches.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
if ! timeout 2 "$PROGRAM" > "$tmp" 2>/dev/null; then
    echo '真实 ELF 重放失败。' >&2
    exit 1
fi
[ "$(wc -c < "$tmp")" -le 2048 ] || { echo '样本输出超过限制。' >&2; exit 1; }

case_row() {
    awk -F '|' -v name="$1" '
        {
            for (i = 1; i <= 8; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i)
            if ($1 == name) { print $2 "," $3 "," $4 "," $5 "," $6 "," $7 "," $8; exit }
        }
    ' "$tmp"
}

[ "$(case_row '零值检测')" = 'test eax,eax; je,0x00000000,0x00000000,1,0,0,是' ] &&
[ "$(case_row '相等比较')" = 'cmp eax,ebx; je,0x00000007,0x00000007,1,0,0,是' ] &&
[ "$(case_row '有符号大于')" = 'cmp eax,ebx; jg,0x00000009,0x00000003,0,0,0,是' ] || {
    echo '样本输出与锁定的条件分支快照不一致。' >&2
    exit 1
}

canonical="$test_taken,$equal_taken,$greater_taken,$je_flag,$jg_relation"
digest="$(printf 'hashteam-lab answer v1 asm-branches-01:%s' "$canonical" | sha256sum | cut -d ' ' -f 1)"
[ "$digest" = "$(tr -d '\r\n ' < "$ANSWER_HASH")" ] || {
    echo '观察值与样本事实不一致，请核对每个跳转读取的标志条件。' >&2
    exit 1
}

echo 'asm-branches replay passed'
