#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/greeter"
ANSWER_HASH="$LAB_DIR/answer.sha256"
EXPECTED_SHA256='6d844f137c037eaa56736e7640048c04b21e69805abc645abb4ecf2d801da71e'
LAB_ID='vuln-format-string-01'

if [ "$#" -ne 1 ]; then
    echo '需要提交一个 8 位十六进制秘密值。' >&2
    exit 1
fi

secret="$(printf '%s' "$1" | tr 'A-F' 'a-f')"
secret="${secret#0x}"
printf '%s\n' "$secret" | grep -Eq '^[0-9a-f]{8}$' || {
    echo '秘密值应写成 8 位小写十六进制（例如 0badf00d）。' >&2
    exit 1
}

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo '样本缺失。' >&2; exit 2; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo '样本哈希校验失败。' >&2
    exit 2
}

output="$(mktemp)"
trap 'rm -f -- "$output"' EXIT
if ! printf '%s' '%x%x%x%x%x%x%x%x%x%x%x' | LC_ALL=C timeout 2 "$PROGRAM" > "$output" 2>&1; then
    echo '样本运行异常，无法重放格式串泄漏。' >&2
    exit 1
fi

actual="$(LC_ALL=C grep -oE '[0-9a-f]{8}' "$output" | sed -n '11p')"
printf '%s\n' "$actual" | grep -Eq '^[0-9a-f]{8}$' || {
    echo '无法从真实样本输出中读取第 11 个十六进制值。' >&2
    exit 1
}
[ "$actual" = '0badf00d' ] || {
    echo '真实重放的第 11 个值不是 0badf00d，样本与课程事实不一致。' >&2
    exit 1
}

actual_digest="$(printf 'hashteam-lab answer v1 %s:%s' "$LAB_ID" "$actual" | sha256sum | cut -d ' ' -f 1)"
expected_digest="$(tr -d '\r\n ' < "$ANSWER_HASH")"
[ "$actual_digest" = "$expected_digest" ] || {
    echo '真实重放结果与锁定的课程事实不一致。' >&2
    exit 1
}

submitted_digest="$(printf 'hashteam-lab answer v1 %s:%s' "$LAB_ID" "$secret" | sha256sum | cut -d ' ' -f 1)"
[ "$submitted_digest" = "$expected_digest" ] || {
    echo '提交的秘密值与真实泄漏不一致，请核对第 11 个 %x 读到的格子。' >&2
    exit 1
}

echo 'vuln-format-string replay passed'