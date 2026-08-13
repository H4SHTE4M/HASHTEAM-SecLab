#!/bin/sh
set -eu

cat <<'TEXT'
GDB 实验 3：栈帧与调用栈
下面自动停在最深层函数，并打印调用栈，再切到 frame_middle 展示它自己的参数和局部变量。
TEXT
cd "$HOME"
sh ./observe.sh
cat <<'TEXT'

交互实操：gdb -q ./gdb-runtime -x session.gdb
使用 frame <编号>、up、down 在调用链中移动；移动只改变 GDB 当前查看的栈帧，不会执行程序。
退出输入 quit；退出后可再次运行上面的命令重新进入。
TEXT
