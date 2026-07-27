#!/bin/sh
# 第 10 关验证：只检查配置文件的最终状态，不限制修改方式
set -u
CONF="$HOME/server.conf"
if [ ! -f "$CONF" ]; then
    echo "✗ 找不到 server.conf，试试 reset-level 重置本关。"
    exit 1
fi
get_value() {
    sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*\([^[:space:]#]*\).*/\1/p" "$CONF" | tail -n 1
}
errors=0
check_item() {
    value=$(get_value "$1")
    if [ "$value" = "$2" ]; then
        echo "  ✓ $1 = $value"
    else
        echo "  ✗ $1 应为 $2（当前：${value:-缺失}）"
        errors=$((errors + 1))
    fi
}
echo "正在复查 $CONF ..."
check_item debug false
check_item allow_guest false
check_item listen 127.0.0.1
if [ "$errors" -eq 0 ]; then
    echo "✓ 全部配置已修复并通过复查。"
    echo "  发现问题只是开始：验证、修复、复查，才是安全工作的完整闭环。"
    exit 0
fi
echo "还有 $errors 处配置不安全，继续加油。"
exit 1
