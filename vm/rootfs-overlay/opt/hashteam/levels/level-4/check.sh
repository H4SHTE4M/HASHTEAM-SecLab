#!/bin/sh
# 第 4 关验证：只检查文件最终权限位，不限制修改方式
set -u

errors=0
check_perm() { # 文件 期望权限
    if [ ! -f "$1" ]; then
        echo "  ✗ 找不到 $1，试试 reset-level 重置本关。"
        errors=$((errors + 1))
        return
    fi
    mode=$(stat -c %a "$1")
    if [ "$mode" = "$2" ]; then
        echo "  ✓ $1 权限为 $mode"
    else
        echo "  ✗ $1 应为 $2（当前：$mode）"
        errors=$((errors + 1))
    fi
}

echo "正在复查文件权限 ..."
check_perm "$HOME/deploy.sh" 700
check_perm "$HOME/secret.txt" 600

if [ "$errors" -eq 0 ]; then
    echo "✓ 权限收紧完成！最小权限原则：只给完成工作所必需的权限，多一点都不行。"
    exit 0
fi
echo "还有 $errors 处权限过宽，继续加油。"
exit 1
