#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/asm-arithmetic-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"

cat <<'TEXT'
算术与位运算样本已复制到 HOME，并会自动运行一次。
输入 debugger 可以单步观察真实算术和 flags 变化。
TEXT
"$HOME/asm-arithmetic"
printf '\n样本已退出；输入 ./asm-arithmetic 可重新运行。\n'
