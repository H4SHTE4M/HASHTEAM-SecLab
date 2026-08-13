#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/memory-addresses-01"

rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
cat <<TEXT
地址观察样本已准备好，样本会自动运行一次。
记录输出中的变量地址、内存值、指针值和有符号值，最后按验证区给出的格式运行 check。
样本已复制到 HOME；重置实验会恢复这份副本并清理上一实验的残留。
TEXT
"$HOME/memory-addresses"
printf '\n样本已退出；输入 ./memory-addresses 可重新运行。\n'
