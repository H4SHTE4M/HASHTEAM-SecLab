#!/bin/sh
set -eu

cat <<'TEXT'
ELF 文件识别与字节观察样本已准备好，程序和观察工具会自动运行一次。
先看 file 给出的文件类型，再用 hexdump 和偏移表核对前 16 字节。
最后在引导步骤中用 strings 找到未打印的分析标记。
最终验证会重新读取锁定 ELF，而不是检查命令输入历史。
TEXT
"$HOME/elf-bytes"
"$HOME/inspect.sh"
printf '\n样本已退出；输入 ./elf-bytes 可重新运行，输入 ./inspect.sh 可再次运行整套静态观察。\n'
