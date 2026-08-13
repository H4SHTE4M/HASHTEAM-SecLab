break gdb_after_update
run
display/i $eip
info registers eax eip
print/x &observed_value
x/4bx &observed_value
x/wx &observed_value
echo \n比较 EAX、变量地址、四个字节与四字节整数。可输入 set var observed_value=0x11223344 后再次 x/wx 观察真实内存变化。\n
