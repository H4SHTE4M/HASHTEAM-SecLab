#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/memory-register-stack-01"

rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
cat <<TEXT
后入先出的栈观察样本已准备好，样本会自动运行一次。
输入 debugger 可在真实 i386 进程上单步观察 ESP 和栈顶；先后观察两个值入栈和两次出栈，满足动态条件后会自动完成一次性验证。
样本已复制到 HOME；重置实验会恢复这份副本并清理上一实验的残留。
TEXT
"$HOME/memory-register-stack"
printf '\n样本已退出；输入 ./memory-register-stack 可重新运行。\n'
