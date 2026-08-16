#!/bin/sh
set -eu

cat <<'TEXT'
计数器样本已复制到 HOME。它只打印 8 位计数器的回绕演示，不联网，也不修改文件。
请先运行 ./counter 看从 252 数 8 下如何回到 0，再用 ./counter 255 1 与 ./counter 200 100 亲手算两个 8 位结果。
判题会把锁定样本真实重放，只接受与真实输出一致的观察值。
TEXT
printf '%s\n' '输入 ./counter 可重新运行演示；./counter A B 会打印 (A+B) 的低 8 位。'
