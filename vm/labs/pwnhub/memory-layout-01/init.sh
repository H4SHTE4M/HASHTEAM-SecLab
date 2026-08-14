#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/memory-layout-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"

cat <<'TEXT'
进程内存布局样本已复制到 HOME，并会自动运行一次。
输入 debugger 可在真实 i386 进程上观察代码、数据、堆和栈；inspect-memory-layout.sh 仍可读取当前 Shell 的 /proc 映射作为对照。
TEXT
"$HOME/memory-layout"
"$HOME/inspect-memory-layout.sh"
printf '\n观察已结束；输入 debugger 可单步到 layout_checkpoint，或运行 ./inspect-memory-layout.sh 重新查看 Shell 映射。\n'
