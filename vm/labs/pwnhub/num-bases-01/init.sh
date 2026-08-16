#!/bin/sh
set -eu

cat <<'TEXT'
进制样本已复制到 HOME。它只打印同一个字节的三种进制写法，不联网，也不修改文件。
请先运行 ./bases 看十进制 202、十六进制 0xca、二进制 11001010 三行，再用 printf 亲手把 0x2a 换算成 42。
判题会把锁定样本真实重放，只接受与真实输出一致的观察值。
TEXT
printf '%s\n' '输入 ./bases 可重新运行样本；printf "%x\n" 202 与 printf "%d\n" 0x2a 可亲手换算。'
