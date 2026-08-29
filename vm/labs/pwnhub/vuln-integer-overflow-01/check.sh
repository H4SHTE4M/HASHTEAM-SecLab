#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/wallet"
ANSWER_HASH="$LAB_DIR/answer.sha256"
EXPECTED_SHA256='d5f8ad8aa9cc71a765431acfc59bda6890fdda90162ac002e048fa036c914564'

if [ "$#" -ne 2 ]; then
    echo '用法：check <数量> <回绕金额>，两个都按实际数值判断。' >&2
    exit 2
fi

normalize_uint32() {
    raw="$1"
    case "$raw" in
        0x*|0X*) base=16; digits="${raw#0x}"; [ "$digits" != "$raw" ] || digits="${raw#0X}" ;;
        0b*|0B*) base=2; digits="${raw#0b}"; [ "$digits" != "$raw" ] || digits="${raw#0B}" ;;
        0o*|0O*) base=8; digits="${raw#0o}"; [ "$digits" != "$raw" ] || digits="${raw#0O}" ;;
        *) base=10; digits="$raw" ;;
    esac
    digits="$(printf '%s' "$digits" | tr 'A-F' 'a-f')"
    case "$digits" in
        ''|*[!0-9a-f]*) return 1 ;;
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

quantity="$(normalize_uint32 "$1")" || { echo '购买数量应是非负整数，可使用常见进制表示。' >&2; exit 2; }
wrapped_amount="$(normalize_uint32 "$2")" || { echo '回绕金额应是非负整数，可使用常见进制表示。' >&2; exit 2; }

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo '钱包样本缺失或不是普通文件。' >&2; exit 2; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo '钱包样本校验失败，请确认使用的是审计锁定的版本。' >&2
    exit 2
}
[ -f "$ANSWER_HASH" ] && [ ! -L "$ANSWER_HASH" ] || { echo '答案哈希文件缺失或不是普通文件。' >&2; exit 2; }

expected_digest="$(tr -d '\r\n ' < "$ANSWER_HASH")"
[ -n "$expected_digest" ] || { echo '答案哈希文件为空或损坏。' >&2; exit 2; }

# 用 256 真实重放样本，输出里必须同时出现回绕标记和计算行。
if ! replay_output="$(printf '256\n' | timeout 2 "$PROGRAM")"; then
    echo '钱包样本重放失败或超时。' >&2
    exit 2
fi

printf '%s\n' "$replay_output" | grep -q 'PwnHub_integer_wrap' || {
    echo '钱包样本没有报告乘积回绕标记，请确认在购买数量处输入 256。' >&2
    exit 2
}

calc_line="$(printf '%s\n' "$replay_output" | sed -n 's/.*系统计算: \([0-9][0-9]*\) x [0-9][0-9]* = \([0-9][0-9]*\)$/\1,\2/p' | head -n 1)"
[ -n "$calc_line" ] || {
    echo '无法从钱包样本的真实重放中读取计算行。' >&2
    exit 2
}

actual_digest="$(printf 'hashteam-lab answer v1 vuln-integer-overflow-01:%s' "$calc_line" | sha256sum | cut -d ' ' -f 1)"
[ "$actual_digest" = "$expected_digest" ] || {
    echo '真实钱包样本与锁定的课程事实不一致。' >&2
    exit 2
}

submitted="$quantity,$wrapped_amount"
submitted_digest="$(printf 'hashteam-lab answer v1 vuln-integer-overflow-01:%s' "$submitted" | sha256sum | cut -d ' ' -f 1)"
[ "$submitted_digest" = "$expected_digest" ] || {
    cat >&2 <<'TEXT'
提交的两个观察值与真实钱包样本输出不一致。
请回到终端运行样本并输入 256，核对 系统计算 行等号两侧的值与 PwnHub_integer_wrap 标记。
TEXT
    exit 1
}

echo 'vuln-integer-overflow replay passed'
