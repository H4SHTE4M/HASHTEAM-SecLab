#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/vuln-race-condition-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
printf '%s\n' 1000 > "$STATE_DIR/balance.txt"
: > "$STATE_DIR/ledger"

cat <<'TEXT'
并发银行样本已复制到 HOME。它从 $HOME/vuln-race-condition-01/ 读取并写入余额与账本，不联网。
先用单次取款观察 3 秒窗口，再想办法让两次取款同时处在这个窗口里。
每次尝试后运行 reset 把余额恢复成 1000 并清空账本。
判题只读取账本文件里的真实记录，不检查输入历史。
TEXT
printf '%s\n' '输入 ./bank 800 可重新运行样本。'