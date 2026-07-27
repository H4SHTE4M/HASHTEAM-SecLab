#!/bin/sh
# 第 3 关验证：失败登录次数最多的 IP
set -u
expected=$(cat "${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-3"/answer)
LOG="$HOME/auth.log"
given=$(printf '%s' "${1:-}" | tr -d '[:space:]')
if [ ! -f "$LOG" ]; then
    echo "✗ 找不到 auth.log，试试 reset-level 重置本关。"
    exit 1
fi
if [ -z "$given" ]; then
    echo "用法: check <IP地址>"
    exit 2
fi
if ! grep -q "$given" "$LOG"; then
    echo "✗ $given 并没有出现在日志里。"
    exit 1
fi
if [ "$given" = "$expected" ]; then
    echo "✓ 正确！$given 是失败登录次数最多的来源 IP。"
    echo "  你刚才做的就是安全运维的日常：从日志中定位攻击者。"
    exit 0
fi
echo "✗ $given 不是失败次数最多的 IP。再统计一次："
echo "  grep \"Failed password\" auth.log | awk '{print \$11}' | sort | uniq -c | sort -nr | head"
exit 1
