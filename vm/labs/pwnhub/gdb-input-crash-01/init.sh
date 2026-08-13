#!/bin/sh
set -eu

cat <<'TEXT'
GDB 实验 4：输入重定向与崩溃定位
下面用固定 crash.txt 作为标准输入自动重放样本。程序只会在课程样本内执行一次受控非法写入。
TEXT
cd "$HOME"
sh ./observe.sh
cat <<'TEXT'

交互实操：gdb -q ./gdb-runtime -x session.gdb
先记录信号、当前函数、EIP 指令和 invalid_address，再修改 crash.txt 重跑以比较输入与崩溃的关系。
程序因 SIGSEGV 停下时仍在 GDB 内；输入 quit 返回 Shell。退出后可再次运行上面的命令重新进入。
TEXT
