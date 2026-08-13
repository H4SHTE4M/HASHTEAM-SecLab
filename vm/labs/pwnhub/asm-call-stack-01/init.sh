#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/asm-call-stack-01"

rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
cat <<TEXT
函数调用约定样本已复制到 HOME，并会自动运行一次。
输出记录固定教学栈中的调用阶段、栈帧、调用轨迹和 EAX 返回值。
最后按验证区给出的格式运行 check；重置实验会恢复 HOME 中的样本副本。
TEXT
"$HOME/asm-call-stack"
printf '\n样本已退出；输入 ./asm-call-stack 可重新运行。\n'
