#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/bank"
STATE_DIR="${HOME:?}/vuln-race-condition-01"
LEDGER="$STATE_DIR/ledger"
EXPECTED_SHA256='a310eb2f9f8272aba2ef720ed8c259565325a2062cf156a3ec69b544ee1cbc10'

if [ "$#" -ne 0 ]; then
    echo '用法：直接运行 check（无需参数），判题只读取账本文件。' >&2
    exit 2
fi

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo '并发银行样本缺失或不是普通文件。' >&2; exit 2; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo '并发银行样本校验失败，请确认使用的是审计锁定的版本。' >&2
    exit 2
}

[ -f "$LEDGER" ] || { echo '账本文件不存在，请先按引导步骤运行银行程序产生真实记录。' >&2; exit 1; }

# 统计账本里 "取出 N 成功" 的行数与金额之和。
match_count=$(grep -c '^取出 [0-9][0-9]* 成功$' "$LEDGER" || true)
amounts="$(sed -n 's/^取出 \([0-9][0-9]*\) 成功$/\1/p' "$LEDGER")"
total=0
for amount in $amounts; do
    total=$(( total + amount ))
done

if [ "$match_count" -le 1 ]; then
    cat >&2 <<'TEXT'
只成功取出一次：请用 & 让两次取款同时处在 3 秒窗口里，重新运行第 3 步的并发命令
TEXT
    exit 1
fi

if [ "$total" -le 1000 ]; then
    echo "两次取款都成功但总额 $total 未超过初始余额 1000，请用更大的金额重新并发取款。" >&2
    exit 1
fi

echo 'vuln-race-condition replay passed'