#!/bin/sh
# 第 5 关验证：失败登录的总次数
set -u
expected=$(cat "${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-5"/answer)
LOG="$HOME/auth.log"
given=$(printf '%s' "${1:-}" | tr -d '[:space:]')
if [ ! -f "$LOG" ]; then
    echo "✗ 找不到 auth.log，试试 reset-level 重置本关。"
    exit 1
fi
if [ -z "$given" ]; then
    echo "用法: check <失败登录的次数>"
    exit 2
fi
if [ "$given" = "$expected" ]; then
    echo "✓ 正确！失败登录一共 $expected 次。"
    echo "  你已经会「先筛出来、再数个数」了——下一关就要回答「是谁干的」。"
    exit 0
fi
echo "✗ 次数不对。提示：先用 grep \"Failed password\" auth.log 把失败行筛出来，"
echo "  再在后面接 | wc -l 数一有几行。多试几次，确认你数的是「失败」而不是全部。"
exit 1
