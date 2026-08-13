#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/rop-gadget-stack-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"

cat <<'TEXT'
第一个 ROP 样本已复制到 HOME。它只有一个 pop eax; ret gadget 和一个无害检查函数。
请按 padding、gadget、寄存器值、目标地址的顺序构造 payload.bin，再运行 check。
TEXT
printf '%s\n' '输入 ./rop-gadget-stack 可重新运行样本。'
