break update_cell
run
display/i $eip
info registers eip eax
echo \n现在停在 update_cell。输入 nexti 前进一条指令，输入 stepi 进入调用，输入 context 汇总当前状态。\n
