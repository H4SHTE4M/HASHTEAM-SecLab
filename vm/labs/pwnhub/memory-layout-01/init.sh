#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/memory-layout-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"

cat <<'TEXT'
进程内存布局观察脚本已复制到 HOME，并会自动运行一次。
表格中的地址范围与 rwx 来自当前 BusyBox Shell 的真实 /proc 映射；“常见增长”列说明堆和栈在 i386 上的典型方向。
TEXT
"$HOME/inspect-memory-layout.sh"
printf '\n观察已结束；输入 ./inspect-memory-layout.sh 可重新查看当前进程的映射。\n'

