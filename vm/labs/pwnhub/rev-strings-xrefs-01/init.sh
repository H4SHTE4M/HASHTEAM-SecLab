#!/bin/sh
set -eu

cat <<'TEXT'
外部逆向样本已复制到 HOME，并自动运行一次。
网页伴侣窗口可下载同一份文件；IDA、Ghidra 和课程 objdump 路线提交的是同一组静态事实。
最终验证会重新读取锁定 ELF 的符号和反汇编，不检测你在外部工具里点过哪些菜单。
TEXT
"$HOME/reverse-companion"
"$HOME/inspect.sh"
printf '\n样本已退出；输入 ./reverse-companion 可重新运行，输入 ./inspect.sh 可重看终端等价路线。\n'
