#!/bin/sh
# 第 5 关：读懂日志（cat / head / wc / grep 入门）
set -eu
cd "$HOME"
LEVEL_DIR="${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-5"
cp "$LEVEL_DIR/auth.log" ./auth.log
echo "──────────────────────────────────────────────"
echo " 第 5 关 · 读懂日志"
echo "──────────────────────────────────────────────"
echo "auth.log 已放在你的主目录。先用 grep 把「失败的登录」都捞出来，"
echo "数一数一共有多少次，然后运行 check <次数>。"
