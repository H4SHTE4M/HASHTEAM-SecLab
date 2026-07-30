#!/bin/sh
# 第 10 关验证：配置唯一性、文件权限与目标 httpd 的真实监听状态。
set -u

CONF="$HOME/server.conf"
PORT="${HASHTEAM_SECURE_PORT:-9090}"
DOCROOT="$HOME/www"

if [ ! -f "$CONF" ] || [ -L "$CONF" ]; then
    echo "✗ 找不到有效的服务配置。根据目录盘点结果检查文件是否被误删。"
    exit 1
fi

get_values() {
    sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*\([^[:space:]#]*\).*/\1/p" "$CONF"
}

errors=0

check_single_value() {
    key="$1"
    expected="$2"
    description="$3"
    values=$(get_values "$key")
    count=$(printf '%s\n' "$values" | sed '/^$/d' | wc -l | tr -d ' ')
    if [ "$count" = "1" ] && [ "$values" = "$expected" ]; then
        echo "  ✓ $description"
    elif [ "$count" -gt 1 ]; then
        echo "  ✗ $key 出现了 $count 次；重复配置会产生歧义"
        errors=$((errors + 1))
    else
        echo "  ✗ $key 当前为 ${values:-缺失}，期望 $expected"
        errors=$((errors + 1))
    fi
}

echo "正在复查配置内容 ..."
check_single_value debug false "debug 已关闭"
check_single_value allow_guest false "allow_guest 已关闭"
check_single_value listen 127.0.0.1 "监听范围已收紧到本机"
check_single_value port "$PORT" "服务端口与运行说明一致"
check_single_value document_root "$DOCROOT" "内容目录与运行说明一致"

mode=$(stat -c %a "$CONF" 2>/dev/null || echo missing)
if [ "$mode" = "600" ]; then
    echo "  ✓ 配置文件仅属主可读写"
else
    echo "  ✗ 配置文件仍向属主之外开放能力（当前数字形式：$mode）；目标是属主保留读写，数字形式应为 600"
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

matching_httpd=0
for proc in /proc/[0-9]*; do
    [ -r "$proc/cmdline" ] || continue
    cmdline=$(tr '\0' ' ' < "$proc/cmdline" 2>/dev/null || true)
    case "$cmdline" in
        *httpd*) ;;
        *) continue ;;
    esac
    case "$cmdline" in
        *"-p 127.0.0.1:$PORT "*) ;;
        *) continue ;;
    esac
    docroot=""
    set -- $cmdline
    while [ $# -gt 0 ]; do
        if [ "$1" = "-h" ]; then
            docroot=${2:-}
            break
        fi
        shift
    done
    case "$docroot" in
        "$DOCROOT"|www|*/www)
            matching_httpd=1
            break
            ;;
    esac
done
if [ "$matching_httpd" -eq 1 ]; then
    echo "  ✓ 监听进程是使用目标端口和内容目录启动的 httpd"
else
    echo "  ✗ 监听进程需用 -p 127.0.0.1:端口 与 -h 内容目录启动；对照运行说明复查这两个参数"
    errors=$((errors + 1))
fi

page=$(wget -q -O - "http://127.0.0.1:$PORT/" 2>/dev/null || true)
if printf '%s\n' "$page" | grep -q "internal service ready"; then
    echo "  ✓ 目标内容目录能够返回预期页面"
else
    echo "  ✗ 当前监听服务没有返回目标内容目录中的页面"
    errors=$((errors + 1))
fi

if [ "$errors" -eq 0 ]; then
    echo "✓ 配置、权限、目标进程和运行状态均已通过复查。"
    echo "  你完成了发现、修复、重启、验证的安全闭环。"
    exit 0
fi

echo "还有 $errors 项检查未达到内部服务基线。请按上方分类反馈定位。"
exit 1
