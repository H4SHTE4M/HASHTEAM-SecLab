#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/asm-registers-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"

cat <<'TEXT'
寄存器职责与地址计算样本已复制到 HOME，并会自动运行一次。
输出先列出常见寄存器约定，再展示真实 mov 和 lea 指令的前后值。
TEXT
"$HOME/asm-registers"
printf '\n样本已退出；输入 ./asm-registers 可重新运行。\n'
