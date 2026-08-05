#!/bin/sh
# 第 5 关验证：失败登录的总次数
set -u
# 答案以加盐 SHA-256 存储，判定行为与明文时代一致（tr 去空白后比对哈希）
expected_hash=$(cat "${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-5"/answer.sha256)
LOG="$HOME/auth.log"
given=$(printf '%s' "${1:-}" | tr -d '[:space:]')
given_hash=$(printf '%s' "hashteam-lab answer v1 level-5:$given" | sha256sum | cut -d ' ' -f 1)
if [ ! -f "$LOG" ]; then
    echo "✗ 找不到 auth.log，试试 reset-level 重置本关。"
    exit 1
fi
if [ -z "$given" ]; then
    echo "用法：check <失败次数>"
    exit 2
fi
if [ "$given_hash" = "$expected_hash" ]; then
    echo "✓ 正确！失败登录一共 $given 次。"
    echo "  你已经会先筛选、再计数了——下一关将继续分析这些记录来自哪里。"
    exit 0
fi
echo "✗ 次数不对。分别检查搜索短语、筛选出的行和最终计数对象。"
echo "  仍失败时检查输入法是否带入了全角字符。"
echo "  需要帮助时逐层展开右侧提示，不要跳过中间输出。"
exit 1
