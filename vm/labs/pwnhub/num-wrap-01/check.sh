#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/counter"
ANSWER_HASH="$LAB_DIR/answer.sha256"
EXPECTED_SHA256='7d134b12682e6e3b770229de048c3c07091b5e3b6552cd374bd2de69be0e53a2'

if [ "$#" -ne 2 ]; then
    echo '用法：check <255+1 的结果> <200+100 的结果>，两个都是十进制数。' >&2
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

# 用锁定样本真实重放两组合计，输出里必须都出现 8 位结果行。
replay_one() {
    timeout 2 "$PROGRAM" "$1" "$2"
}

if ! first_output="$(replay_one 255 1)"; then
    echo '计数器样本重放 255+1 失败或超时。' >&2
    exit 2
fi
[ "$(printf '%s' "$first_output" | wc -c)" -le 2048 ] || {
    echo '计数器样本输出超过长度上限。' >&2
    exit 2
}
if ! second_output="$(replay_one 200 100)"; then
    echo '计数器样本重放 200+100 失败或超时。' >&2
    exit 2
fi
[ "$(printf '%s' "$second_output" | wc -c)" -le 2048 ] || {
    echo '计数器样本输出超过长度上限。' >&2
    exit 2
}

first_result="$(printf '%s\n' "$first_output" | sed -n 's/^8 位结果: \([0-9][0-9]*\)$/\1/p' | head -n 1)"
second_result="$(printf '%s\n' "$second_output" | sed -n 's/^8 位结果: \([0-9][0-9]*\)$/\1/p' | head -n 1)"
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
提交的两个观察值与真实计数器样本输出不一致。
请回到终端运行 ./counter 255 1 与 ./counter 200 100，核对两行的 8 位结果。
TEXT
    exit 1
}

echo 'num-wrap replay passed'
