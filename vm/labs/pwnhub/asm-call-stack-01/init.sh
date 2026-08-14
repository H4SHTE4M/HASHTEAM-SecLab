#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/asm-call-stack-01"

rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
cat <<TEXT
函数调用约定样本已复制到 HOME，并会自动运行一次。
输入 debugger 可跟踪真实 call/ret、栈帧和 EAX 返回值。
TEXT
"$HOME/asm-call-stack"
printf '\n样本已退出；输入 ./asm-call-stack 可重新运行。\n'
