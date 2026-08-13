#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/asm-stack-ops-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"

cat <<'TEXT'
push 与 pop 样本已复制到 HOME，并会自动运行一次。
逐行比较 ESP、栈顶值和目标寄存器，确认每条指令只移动四字节。
TEXT
"$HOME/asm-stack-ops"
printf '\n样本已退出；输入 ./asm-stack-ops 可重新运行。\n'
