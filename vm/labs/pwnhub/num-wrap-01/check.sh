#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/counter"
ANSWER_HASH="$LAB_DIR/answer.sha256"
EXPECTED_SHA256='8cd1a3fe4198c65c49a9f1b631ca68a73ac93fc1b9d6e64b91d2b769e8fc9095'

if [ "$#" -ne 2 ]; then
    echo '用法：check <挑战一的 8 位结果> <挑战二的 8 位结果>，两个都要自己算。' >&2
    exit 2
fi

case "$1" in
    *[!0-9]* | '') echo '第一个观察值应是非负十进制整数。' >&2; exit 2 ;;
esac
case "$2" in
    *[!0-9]* | '') echo '第二个观察值应是非负十进制整数。' >&2; exit 2 ;;
esac
[ "${#1}" -le 3 ] && [ "${#2}" -le 3 ] || {
    echo '8 位结果只会落在 0 到 255 之间。' >&2
    exit 2
}

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo '计数器样本缺失或不是普通文件。' >&2; exit 2; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo '计数器样本校验失败，请确认使用的是审计锁定的版本。' >&2
    exit 2
}
[ -f "$ANSWER_HASH" ] && [ ! -L "$ANSWER_HASH" ] || { echo '答案哈希文件缺失或不是普通文件。' >&2; exit 2; }

expected_digest="$(tr -d '\r\n ' < "$ANSWER_HASH")"
[ -n "$expected_digest" ] || { echo '答案哈希文件为空或损坏。' >&2; exit 2; }

# 用锁定样本真实重放无参数演示，从输出里读出两组挑战的操作数；
# 再逐组带参重放，取真实 8 位结果。样本从不打印挑战的答案。
if ! demo_output="$(timeout 2 "$PROGRAM")"; then
    echo '计数器样本重放失败或超时。' >&2
    exit 2
fi
[ "$(printf '%s' "$demo_output" | wc -c)" -le 2048 ] || {
    echo '计数器样本输出超过长度上限。' >&2
    exit 2
}

pair1="$(printf '%s\n' "$demo_output" | sed -n 's/^挑战一：\([0-9][0-9]*\) + \([0-9][0-9]*\) 的 8 位结果.*$/\1 \2/p' | head -n 1)"
pair2="$(printf '%s\n' "$demo_output" | sed -n 's/^挑战二：0x\([0-9a-f][0-9a-f]*\) + 0x\([0-9a-f][0-9a-f]*\) 的 8 位结果.*$/\1 \2/p' | head -n 1)"
[ -n "$pair1" ] && [ -n "$pair2" ] || {
    echo '无法从计数器样本的真实重放中读取挑战行。' >&2
    exit 2
}

a1="${pair1% *}"
b1="${pair1#* }"
h1="${pair2% *}"
h2="${pair2#* }"
a2=$((0x${h1}))
b2=$((0x${h2}))

replay_result() {
    timeout 2 "$PROGRAM" "$1" "$2" \
        | sed -n 's/^8 位结果: \([0-9][0-9]*\)$/\1/p' | head -n 1
}

first_result="$(replay_result "$a1" "$b1")"
second_result="$(replay_result "$a2" "$b2")"
[ -n "$first_result" ] && [ -n "$second_result" ] || {
    echo '无法从计数器样本的真实重放中读取 8 位结果行。' >&2
    exit 2
}

calc_line="$first_result,$second_result"
actual_digest="$(printf 'hashteam-lab answer v1 num-wrap-01:%s' "$calc_line" | sha256sum | cut -d ' ' -f 1)"
[ "$actual_digest" = "$expected_digest" ] || {
    echo '真实计数器样本与锁定的课程事实不一致。' >&2
    exit 2
}

submitted="$1,$2"
submitted_digest="$(printf 'hashteam-lab answer v1 num-wrap-01:%s' "$submitted" | sha256sum | cut -d ' ' -f 1)"
[ "$submitted_digest" = "$expected_digest" ] || {
    cat >&2 <<'TEXT'
提交的两个值与真实计数器样本的挑战不一致。
请回到终端运行 ./counter 看清两组挑战，
再用 ./counter A B 或 python 的 (A+B) & 0xff 亲手算出它们的低 8 位；
挑战二的两个数是十六进制写法，先换算成十进制再算。
TEXT
    exit 1
}

echo 'num-wrap replay passed'
