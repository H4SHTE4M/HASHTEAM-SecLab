#!/bin/sh
# 第 3 关验证：只检查最终目录结构，不限制整理方法
set -u
base="$HOME/inbox"
errors=0

expect_file() {
    if [ -f "$base/$1" ]; then
        echo "  ✓ inbox/$1"
    else
        echo "  ✗ inbox/$1 应存在（$2）"
        errors=$((errors + 1))
    fi
}

echo "正在复查 inbox 的目录结构 ..."
expect_file logs/app.log       "日志应放进 logs/"
expect_file scripts/backup.sh  "脚本应放进 scripts/"
expect_file scripts/deploy.sh  "脚本应放进 scripts/"
expect_file secrets/api.key    "密钥应放进 secrets/"

if [ "$errors" -eq 0 ]; then
    echo "✓ 整理完成！现在每类文件都有清楚的位置。"
    exit 0
fi
echo "还有 $errors 处没归置好，继续加油（提示见 ~/todo.txt）。"
exit 1
