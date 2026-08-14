#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/asm-branches-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"

cat <<'TEXT'
比较与跳转样本已复制到 HOME，并会自动运行一次。
输入 debugger 可单步观察 test、cmp、je 和 jg 的真实执行。
TEXT
"$HOME/asm-branches"
printf '\n样本已退出；输入 ./asm-branches 可重新运行。\n'
