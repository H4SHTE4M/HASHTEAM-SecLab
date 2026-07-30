#!/bin/sh
# 第 2 关验证：隐藏文件中的验证信息
set -u
expected=$(cat "${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-2"/answer)
given=$(printf '%s' "${1:-}" | tr -d '[:space:]')
if [ ! -f "$HOME/.message" ]; then
    echo "✗ 隐藏文件还没找到（或者被你删了？）。换一种能看到全部条目的查看方式再找找，或用 reset-level 重置本关。"
    exit 1
fi
if [ -z "$given" ]; then
    echo "用法：check <验证信息>"
    exit 2
fi
if [ "$given" = "$expected" ]; then
    echo "✓ 正确！隐藏不等于安全，默认看不见的东西依然存在。"
    exit 0
fi
echo "✗ 验证信息不对。回到隐藏消息，检查冒号后的内容和复制范围。"
exit 1
