#!/bin/sh
# 第 10 关验证：配置内容、文件权限与真实监听状态
set -u

CONF="$HOME/server.conf"
PORT="${HASHTEAM_SECURE_PORT:-9090}"

if [ ! -f "$CONF" ]; then
    echo "✗ 找不到服务配置。根据目录盘点结果检查文件是否被误删。"
    exit 1
fi

get_value() {
    sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*\([^[:space:]#]*\).*/\1/p" "$CONF" |
        tail -n 1
}

errors=0

check_disabled() {
    value=$(get_value "$1")
    if [ "$value" = "false" ]; then
        echo "  ✓ $1 已关闭"
    else
        echo "  ✗ $1 仍未关闭（当前：${value:-缺失}）"
        errors=$((errors + 1))
    fi
}

echo "正在复查配置内容 ..."
check_disabled debug
check_disabled allow_guest

listen=$(get_value listen)
if [ "$listen" = "127.0.0.1" ]; then
    echo "  ✓ 配置中的监听范围已收紧到本机"
else
    echo "  ✗ 配置中的监听范围仍不符合内部服务用途（当前：${listen:-缺失}）"
    errors=$((errors + 1))
fi

mode=$(stat -c %a "$CONF" 2>/dev/null || echo missing)
if [ "$mode" = "600" ]; then
    echo "  ✓ 配置文件仅属主可读写"
else
    echo "  ✗ 配置文件仍向属主之外开放能力（当前数字形式：$mode）"
    errors=$((errors + 1))
fi

echo "正在复查真实运行状态 ..."
listeners=$(netstat -tln 2>/dev/null || true)
if printf '%s\n' "$listeners" | grep -q "127.0.0.1:$PORT "; then
    echo "  ✓ 内部服务正在本机地址监听"
else
    echo "  ✗ 运行中的服务尚未在本机地址监听；修改文件后还需要重启并复查"
    errors=$((errors + 1))
fi
if printf '%s\n' "$listeners" | grep -q "0.0.0.0:$PORT "; then
    echo "  ✗ 旧的宽范围监听仍然存在"
    errors=$((errors + 1))
fi

if [ "$errors" -eq 0 ]; then
    echo "✓ 配置、权限和运行状态均已通过复查。"
    echo "  你完成了发现、修复、重启、验证的安全闭环。"
    exit 0
fi

echo "还有 $errors 项检查未达到内部服务基线。请按上方分类反馈定位。"
exit 1
