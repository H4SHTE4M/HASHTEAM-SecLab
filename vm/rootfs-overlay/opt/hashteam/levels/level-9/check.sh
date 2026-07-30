#!/bin/sh
# 第 9 关验证：泄露的调试令牌
set -u
expected=$(cat "${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-9"/answer)
PORT="${HASHTEAM_HTTP_PORT:-8080}"
given=$(printf '%s' "${1:-}" | tr -d '[:space:]')
if ! wget -q -O /dev/null "http://127.0.0.1:$PORT/robots.txt" 2>/dev/null; then
    echo "✗ 本地服务没有响应，试试 reset-level 重新启动它。"
    exit 1
fi
if [ -z "$given" ]; then
    echo "用法：check <令牌>"
    exit 2
fi
if [ "$given" = "$expected" ]; then
    echo "✓ 正确！robots.txt、调试接口、备份文件——信息泄露往往就是这样发生的。"
    exit 0
fi
echo "✗ 令牌不对。回到公开入口，按每次响应给出的线索逐步检查。"
echo "  确认只提交了等号后的值，没有带标签、等号或空格；仍失败时检查输入法是否带入了全角字符。"
exit 1
