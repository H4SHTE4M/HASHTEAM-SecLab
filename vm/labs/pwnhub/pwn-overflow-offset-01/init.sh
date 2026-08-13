#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/pwn-overflow-offset-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"

cat <<'TEXT'
偏移观察样本已复制到 HOME。它只读入一次 stdin，不会启动 shell、联网或修改文件。
请先用 cyclic 生成受控输入，再用原生 GDB 的 run < payload.bin 观察保存返回地址被覆盖成什么。
把用于证明偏移的 payload.bin 保存到 $HOME/pwn-overflow-offset-01/，最后运行 check。
TEXT
printf '%s\n' '输入 ./overflow-offset 可重新运行样本。'
