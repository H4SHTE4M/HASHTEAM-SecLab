#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/rop-call-chain-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"

cat <<'TEXT'
三函数调用链样本已复制到 HOME。链条用 ret 依次链接 step_one、step_two、finish。
请按 padding、step_one、step_two、finish 的顺序构造 payload.bin，再运行 check。
TEXT
printf '%s\n' '输入 ./rop-call-chain 可重新运行样本。'
