#!/bin/sh
set -eu

cat <<'TEXT'
格式串样本 greeter 已复制到 HOME。它只读一行名字并回显，不联网、不改文件，也没有持久状态。
先运行 ./greeter 输入普通名字观察回显；再试试名字里带 %x，看 printf 会不会把栈格里的值打印出来。
用足够多的 %x 找到以 0bad 开头的格子，最后运行 check 提交那个秘密值。
TEXT
printf '%s\n' '输入 ./greeter 可重新运行样本。'