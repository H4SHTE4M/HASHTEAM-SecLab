#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/memory-addresses-01"

rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
cat <<TEXT
地址观察样本已准备好，样本会自动运行一次。
记录输出中的变量地址、内存值、指针值和有符号值；也可以输入 debugger 观察真实寄存器与内存。
debugger 满足本关状态后会自动调用一次性动态验证。
TEXT
"$HOME/memory-addresses"
printf '\n样本已退出；输入 ./memory-addresses 可重新运行。\n'
