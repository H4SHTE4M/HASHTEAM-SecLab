#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/vuln-overwrite-variable-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"

cat <<'TEXT'
越界写入样本 door 已复制到 HOME。它只读一次名字、打印邻接的权限标志，不联网、不改文件。
先运行 ./door 输入短名字，观察门没有开；再把能越过 16 字节缓冲区的超长名字保存到
$HOME/vuln-overwrite-variable-01/input.txt，最后运行 check。
TEXT
printf '%s\n' '输入 ./door 可重新运行样本。'