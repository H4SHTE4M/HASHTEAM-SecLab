#!/bin/sh
set -eu

cat <<'TEXT'
函数与控制流样本已复制到 HOME，并自动运行、反汇编一次。
在外部工具中识别比较候选值的函数，按语义重命名，再记录函数边界、比较常量和条件跳转。
最终验证只检查锁定 ELF 的静态事实，不要求上传 IDA 或 Ghidra 工程文件。
TEXT
"$HOME/reverse-companion"
"$HOME/inspect.sh"
printf '\n样本已退出；输入 ./reverse-companion 可重新运行，输入 ./inspect.sh 可重看终端等价路线。\n'
