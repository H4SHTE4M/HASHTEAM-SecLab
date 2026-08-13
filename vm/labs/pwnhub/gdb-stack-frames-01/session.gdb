break gdb_after_update
run
backtrace
frame 2
info args
info locals
echo \n输入 up 查看调用者，输入 down 返回被调用者；每次用 info frame、info args 和 info locals 比较当前栈帧。\n
