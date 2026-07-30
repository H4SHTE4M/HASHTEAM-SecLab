#!/bin/sh
# 第 6 关验证：失败登录次数最多的 IP
set -u
expected=$(cat "${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-6"/answer)
LOG="$HOME/auth.log"
given=$(printf '%s' "${1:-}" | tr -d '[:space:]')
if [ "$#" -gt 1 ]; then
    echo "✗ 只提交地址本身，不要带前面的计数。"
    exit 2
fi
if [ ! -f "$LOG" ]; then
    echo "✗ 找不到 auth.log，试试 reset-level 重置本关。"
    exit 1
fi
if [ -z "$given" ]; then
    echo "用法：check <IP地址>"
    exit 2
fi
if ! grep -q "$given" "$LOG"; then
    echo "✗ $given 并没有出现在日志里。"
    exit 1
fi
if [ "$given" = "$expected" ]; then
    echo "✓ 正确！$given 是失败登录次数最多的来源 IP。"
    echo "  你已经从日志中定位了失败登录最频繁的来源。"
    exit 0
fi
echo "✗ $given 不是失败次数最多的 IP。"
echo "  回到单列地址、分组计数和数字降序三个中间结果定位问题。"
exit 1
