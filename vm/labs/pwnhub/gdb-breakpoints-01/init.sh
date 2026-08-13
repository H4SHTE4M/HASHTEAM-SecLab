#!/bin/sh
set -eu

cat <<'TEXT'
GDB 实验 1：断点、继续运行与单步
样本与会话脚本已复制到当前目录。
下面先自动重放一次断点观察。
TEXT
cd "$HOME"
sh ./observe.sh
cat <<'TEXT'

交互实操：gdb -q ./gdb-runtime -x session.gdb
会话会自动在 update_cell 停下；随后请亲自使用 nexti、stepi、continue 和 context。
退出 GDB 输入 quit；退出后可再次运行上面的命令重新进入。
TEXT
