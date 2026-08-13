#!/bin/sh
set -eu

cat <<'TEXT'
GDB 实验 2：寄存器与内存
下面自动停在全局变量更新完成之后，展示 EAX、变量地址和该地址中的四字节值。
TEXT
cd "$HOME"
sh ./observe.sh
cat <<'TEXT'

交互实操：gdb -q ./gdb-runtime -x session.gdb
在 GDB 中用 x/4bx 看四个小端字节，用 x/wx 看组合后的四字节值。
退出输入 quit；退出后可再次运行上面的命令重新进入。
TEXT
