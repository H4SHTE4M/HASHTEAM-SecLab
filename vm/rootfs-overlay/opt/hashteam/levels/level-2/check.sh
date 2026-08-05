#!/bin/sh
# 第 2 关验证：隐藏文件中的验证信息
set -u
# 答案以加盐 SHA-256 存储，判定行为与明文时代一致（tr 去空白后比对哈希）
expected_hash=$(cat "${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-2"/answer.sha256)
given=$(printf '%s' "${1:-}" | tr -d '[:space:]')
given_hash=$(printf '%s' "hashteam-lab answer v1 level-2:$given" | sha256sum | cut -d ' ' -f 1)
if [ ! -f "$HOME/.message" ]; then
    echo "✗ 隐藏文件还没找到（或者被你删了？）。换一种能看到全部条目的查看方式再找找，或用 reset-level 重置本关。"
    exit 1
fi
if [ -z "$given" ]; then
    echo "用法：check <验证信息>"
    exit 2
fi
if [ "$given_hash" = "$expected_hash" ]; then
    echo "✓ 正确！隐藏不等于安全，默认看不见的东西依然存在。"
    exit 0
fi
echo "✗ 验证信息不对。回到隐藏消息，检查冒号后的内容和复制范围。"
exit 1
