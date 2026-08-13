#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/memory-register-stack-01"

rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
cat <<TEXT
后入先出的栈观察样本已准备好，样本会自动运行一次。
先后观察两个值入栈和两次出栈，最后按验证区格式运行 check。
样本已复制到 HOME；重置实验会恢复这份副本并清理上一实验的残留。
TEXT
"$HOME/memory-register-stack"
printf '\n样本已退出；输入 ./memory-register-stack 可重新运行。\n'
