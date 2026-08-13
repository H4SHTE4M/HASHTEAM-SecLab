#!/bin/sh
set -eu

cat <<'TEXT'
ELF 节与入口点样本已准备好，程序和 readelf 观察会自动运行一次。
先从 ELF 头找到入口点，再在节表中比较 .text、.rodata、.data 和 .bss。
最终验证会重新调用锁定的 readelf 读取真实样本，不检查命令输入历史。
TEXT
"$HOME/elf-sections"
"$HOME/inspect.sh"
printf '\n样本已退出；输入 ./elf-sections 可重新运行，输入 ./inspect.sh 可再次查看入口点和节表。\n'
