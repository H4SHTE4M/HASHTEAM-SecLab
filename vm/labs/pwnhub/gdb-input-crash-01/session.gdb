run crash < crash.txt
info registers eip
x/i $eip
backtrace
frame 0
print/x invalid_address
echo \n崩溃已稳定复现。可修改 crash.txt 后重新输入 run crash < crash.txt，比对是否仍收到 SIGSEGV。\n
