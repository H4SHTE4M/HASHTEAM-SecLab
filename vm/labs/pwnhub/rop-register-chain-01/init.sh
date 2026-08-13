#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/rop-register-chain-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"

cat <<'TEXT'
双寄存器 ROP 样本已复制到 HOME。链条需要两个 pop; ret gadget 和一个统一检查函数。
请按 padding、pop_eax_ret、EAX 值、pop_edx_ret、EDX 值、check_registers 的顺序构造 payload.bin，再运行 check。
TEXT
printf '%s\n' '输入 ./rop-register-chain 可重新运行样本。'
