#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/pwn-ret2win-args-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"

cat <<'TEXT'
带参 ret2win 样本已复制到 HOME。目标函数只在两个固定 cdecl 参数都正确时输出无害完成标记。
请把 padding、win 地址、占位返回地址和两个参数按栈顺序拼成 payload.bin，再运行 check。
TEXT
printf '%s\n' '输入 ./ret2win-args 可重新运行样本。'
