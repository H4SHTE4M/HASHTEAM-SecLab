#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/vuln-string-overflow-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"

cat <<'TEXT'
栈溢出样本 frame 已复制到 HOME。它只读一次输入、打印栈上的 buf、保存的 EBP 与返回地址，不联网、不改文件。
先运行 ./frame 输入短内容，观察三个值不变、正常结束；再把能盖到保存返回地址的超长输入保存到
$HOME/vuln-string-overflow-01/payload.bin，最后运行 check。
TEXT
printf '%s\n' '输入 ./frame 可重新运行样本。'