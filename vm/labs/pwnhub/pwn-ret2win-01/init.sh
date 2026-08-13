#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/pwn-ret2win-01"

"$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/reset.sh"
cat <<'TEXT'
离线 i386 样例已准备好。目标程序只会输出一个无害完成标记。
目标程序已复制到 HOME。输入 ./ret2win 后，程序会等待一行输入；按回车后静默退出并返回提示符，这是正常路径。
需要再次运行时重新输入 ./ret2win，不必进入 /opt/pwnhub 查找样本。
请把一次性 stdin 保存到 $HOME/pwn-ret2win-01/payload.bin，再运行 check。
环境会在 reset.sh 后恢复，判题只重放真实 ELF 的最终输出。
TEXT
