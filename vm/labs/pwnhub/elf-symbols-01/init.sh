#!/bin/sh
set -eu

cat <<'TEXT'
ELF 符号样本已准备好，程序和 nm 观察会自动运行一次。
把每一行拆成地址、类型字母和名称，再比较大写与小写类型字母。
最终验证会重新调用锁定的 nm 读取真实样本，不检查命令输入历史。
TEXT
"$HOME/elf-symbols"
"$HOME/inspect.sh"
printf '\n样本已退出；输入 ./elf-symbols 可重新运行，输入 ./inspect.sh 可再次查看关键符号。\n'
