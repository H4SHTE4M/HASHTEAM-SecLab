#!/bin/sh
set -eu

cat <<'TEXT'
计数器样本已复制到 HOME。它演示 8 位计数器的回绕，并留下两组没有答案的加法挑战。
请先运行 ./counter 看 255 之后如何回到 0 并读出两组挑战，再亲手算出它们的低 8 位。
判题会把锁定样本真实重放并逐组复算，只接受与真实挑战一致的结果。
TEXT
printf '%s\n' '输入 ./counter 可重新运行演示；./counter A B 打印 (A+B) 的低 8 位，也可以用 python 的 (A+B) & 0xff 验证。'
