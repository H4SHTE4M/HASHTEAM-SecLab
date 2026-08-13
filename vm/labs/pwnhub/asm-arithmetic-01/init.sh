#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/asm-arithmetic-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"

cat <<'TEXT'
算术与位运算样本已复制到 HOME，并会自动运行一次。
每一行都是锁定 i386 ELF 中相应指令真实执行后的寄存器值。
TEXT
"$HOME/asm-arithmetic"
printf '\n样本已退出；输入 ./asm-arithmetic 可重新运行。\n'
