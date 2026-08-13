#!/bin/sh
set -eu

cat <<'TEXT'
ELF 反汇编样本已准备好，程序和 objdump 观察会自动运行一次。
先从符号地址进入 choose_path，再观察 cmp、条件跳转和 compute_result 的 call。
最终验证会重新调用锁定的 objdump 读取真实指令，不检查命令输入历史。
TEXT
"$HOME/elf-disassembly"
"$HOME/inspect.sh"
printf '\n样本已退出；输入 ./elf-disassembly 可重新运行，输入 ./inspect.sh 可再次查看反汇编。\n'
