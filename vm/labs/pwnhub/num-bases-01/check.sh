#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/bases"
ANSWER_HASH="$LAB_DIR/answer.sha256"
EXPECTED_SHA256='8969acc17560423409d35e5a2443d26cb7ed71c0c7e50aca45167de948b8b3ef'

if [ "$#" -ne 2 ]; then
    echo '用法：check <十六进制写法> <十进制值>，两个都来自样本输出。' >&2
    exit 2
fi

hex_value="$(printf '%s' "$1" | tr 'A-F' 'a-f')"
case "$hex_value" in
    0x[0-9a-f][0-9a-f]) ;;
    *) echo '十六进制写法应是 0x 加两位十六进制数字（例如 0xca）。' >&2; exit 2 ;;
esac
case "$2" in
    *[!0-9]* | '') echo '十进制值应是非负十进制整数。' >&2; exit 2 ;;
esac
[ "${#2}" -le 3 ] || { echo '一个字节的十进制值最多三位。' >&2; exit 2; }

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo '进制样本缺失或不是普通文件。' >&2; exit 2; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo '进制样本校验失败，请确认使用的是审计锁定的版本。' >&2
    exit 2
}
[ -f "$ANSWER_HASH" ] && [ ! -L "$ANSWER_HASH" ] || { echo '答案哈希文件缺失或不是普通文件。' >&2; exit 2; }

expected_digest="$(tr -d '\r\n ' < "$ANSWER_HASH")"
[ -n "$expected_digest" ] || { echo '答案哈希文件为空或损坏。' >&2; exit 2; }

# 用锁定样本真实重放，输出里必须同时出现三种写法行与 0x2a 例子行。
if ! replay_output="$(timeout 2 "$PROGRAM")"; then
    echo '进制样本重放失败或超时。' >&2
    exit 2
fi
[ "$(printf '%s' "$replay_output" | wc -c)" -le 2048 ] || {
    echo '进制样本输出超过长度上限。' >&2
    exit 2
}

hex_line="$(printf '%s\n' "$replay_output" | sed -n 's/^十六进制 0x\([0-9a-f][0-9a-f]\)$/\1/p' | head -n 1)"
dec_line="$(printf '%s\n' "$replay_output" | sed -n 's/^再举一个例子：0x[0-9a-f][0-9a-f]* 写成十进制就是 \([0-9][0-9]*\)。$/\1/p' | head -n 1)"
[ -n "$hex_line" ] && [ -n "$dec_line" ] || {
    echo '无法从进制样本的真实重放中读取观察行。' >&2
    exit 2
}

calc_line="0x${hex_line},${dec_line}"
actual_digest="$(printf 'hashteam-lab answer v1 num-bases-01:%s' "$calc_line" | sha256sum | cut -d ' ' -f 1)"
[ "$actual_digest" = "$expected_digest" ] || {
    echo '真实进制样本与锁定的课程事实不一致。' >&2
    exit 2
}

submitted="$hex_value,$2"
submitted_digest="$(printf 'hashteam-lab answer v1 num-bases-01:%s' "$submitted" | sha256sum | cut -d ' ' -f 1)"
[ "$submitted_digest" = "$expected_digest" ] || {
    cat >&2 <<'TEXT'
提交的两个观察值与真实进制样本输出不一致。
请回到终端运行 ./bases，核对 十六进制 行与 0x2a 例子的十进制值。
TEXT
    exit 1
}

echo 'num-bases replay passed'
