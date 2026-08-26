#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/bases"
ANSWER_HASH="$LAB_DIR/answer.sha256"
EXPECTED_SHA256='a8456936b1664b75051c8d55fc32f5f5cd140367a1514f47734442f6b2ca4056'

if [ "$#" -ne 2 ]; then
    echo '用法：check <挑战一的十六进制写法> <挑战二的十进制值>，两个都要自己换算。' >&2
    exit 2
fi

normalize_hex_byte() {
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
    [ "${#value}" -le 2 ] || return 1
    printf '0x%02s' "$value" | tr ' ' '0'
}

normalize_decimal_byte() {
    case "$1" in
        ''|*[!0-9]*) return 1 ;;
    esac
    value="$(printf '%s' "$1" | sed 's/^0*//')"
    [ -n "$value" ] || value=0
    [ "${#value}" -le 3 ] && [ "$value" -le 255 ] || return 1
    printf '%s' "$value"
}

hex_value="$(normalize_hex_byte "$1")" || { echo '第一项应是以 0x 开头的一字节十六进制值。' >&2; exit 2; }
decimal_value="$(normalize_decimal_byte "$2")" || { echo '第二项应是 0 到 255 的十进制值。' >&2; exit 2; }

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo '进制样本缺失或不是普通文件。' >&2; exit 2; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo '进制样本校验失败，请确认使用的是审计锁定的版本。' >&2
    exit 2
}
[ -f "$ANSWER_HASH" ] && [ ! -L "$ANSWER_HASH" ] || { echo '答案哈希文件缺失或不是普通文件。' >&2; exit 2; }

expected_digest="$(tr -d '\r\n ' < "$ANSWER_HASH")"
[ -n "$expected_digest" ] || { echo '答案哈希文件为空或损坏。' >&2; exit 2; }

# 用锁定样本真实重放，输出里必须同时出现两条挑战行；答案由挑战值换算得出，
# 样本自身从不打印答案。
if ! replay_output="$(timeout 2 "$PROGRAM")"; then
    echo '进制样本重放失败或超时。' >&2
    exit 2
fi
[ "$(printf '%s' "$replay_output" | wc -c)" -le 2048 ] || {
    echo '进制样本输出超过长度上限。' >&2
    exit 2
}

chal1_dec="$(printf '%s\n' "$replay_output" | sed -n 's/^挑战一：这个字节的十进制写法是 \([0-9][0-9]*\)，.*$/\1/p' | head -n 1)"
chal2_hex="$(printf '%s\n' "$replay_output" | sed -n 's/^挑战二：这个字节的十六进制写法是 0x\([0-9a-f][0-9a-f]*\)，.*$/\1/p' | head -n 1)"
[ -n "$chal1_dec" ] && [ -n "$chal2_hex" ] || {
    echo '无法从进制样本的真实重放中读取挑战行。' >&2
    exit 2
}

expected_hex="$(printf '0x%02x' "$chal1_dec")"
expected_dec="$((0x${chal2_hex}))"

calc_line="${expected_hex},${expected_dec}"
actual_digest="$(printf 'hashteam-lab answer v1 num-bases-01:%s' "$calc_line" | sha256sum | cut -d ' ' -f 1)"
[ "$actual_digest" = "$expected_digest" ] || {
    echo '真实进制样本与锁定的课程事实不一致。' >&2
    exit 2
}

submitted="$hex_value,$decimal_value"
submitted_digest="$(printf 'hashteam-lab answer v1 num-bases-01:%s' "$submitted" | sha256sum | cut -d ' ' -f 1)"
[ "$submitted_digest" = "$expected_digest" ] || {
    cat >&2 <<'TEXT'
提交的两个值与真实进制样本的挑战不一致。
样本只给出挑战的一种写法，另一种要你自己换算：
用 python 的 hex() 把挑战一的十进制值换成十六进制写法，
再在 python 里直接输入挑战二那个 0x 开头的数读出它的十进制值。
TEXT
    exit 1
}

echo 'num-bases replay passed'
