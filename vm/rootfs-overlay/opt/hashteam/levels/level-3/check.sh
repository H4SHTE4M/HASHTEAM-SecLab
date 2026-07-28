#!/bin/sh
# 第 3 关验证：要求真实移动原文件，并保留内容与最终顶层结构。
set -u

base="$HOME/inbox"
level_dir="${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-3"
errors=0

expect_directory() {
    if [ -d "$base/$1" ] && [ ! -L "$base/$1" ]; then
        echo "  ✓ inbox/$1/ 是真实目录"
    else
        echo "  ✗ inbox/$1/ 应是目录"
        errors=$((errors + 1))
    fi
}

expect_exact_file() {
    target="$base/$1"
    expected="$level_dir/expected/$2"
    if [ ! -f "$target" ] || [ -L "$target" ]; then
        echo "  ✗ inbox/$1 应存在（$3）"
        errors=$((errors + 1))
    elif ! cmp -s "$target" "$expected"; then
        echo "  ✗ inbox/$1 内容与原文件不一致，不能用空文件代替移动"
        errors=$((errors + 1))
    else
        echo "  ✓ inbox/$1"
    fi
}

echo "正在复查 inbox 的目录结构 ..."
for directory in logs scripts secrets; do
    expect_directory "$directory"
done

expect_exact_file logs/app.log app.log "日志应放进 logs/"
expect_exact_file scripts/backup.sh backup.sh "脚本应放进 scripts/"
expect_exact_file scripts/deploy.sh deploy.sh "脚本应放进 scripts/"
expect_exact_file secrets/api.key api.key "密钥应放进 secrets/"

# 顶层只允许三个分类目录。这样 mkdir + touch 且保留原文件不能通过。
for entry in "$base"/* "$base"/.[!.]* "$base"/..?*; do
    if [ ! -e "$entry" ] && [ ! -L "$entry" ]; then
        continue
    fi
    name=${entry##*/}
    case "$name" in
        logs|scripts|secrets) ;;
        *)
            echo "  ✗ inbox 顶层仍有未归类项目：$name"
            errors=$((errors + 1))
            ;;
    esac
done

if [ "$errors" -eq 0 ]; then
    echo "✓ 整理完成！原文件已按类别移动，内容和结构都正确。"
    exit 0
fi
echo "还有 $errors 处没归置好，继续加油（提示见 ~/todo.txt）。"
exit 1
