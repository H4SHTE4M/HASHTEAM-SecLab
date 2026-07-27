#!/bin/sh
# 第 6 关：异常登录分析
set -eu
cd "$HOME"
LEVEL_DIR="${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-6"
cp "$LEVEL_DIR/auth.log" ./auth.log
echo "──────────────────────────────────────────────"
echo " 第 6 关 · 谁在攻击服务器"
echo "──────────────────────────────────────────────"
echo "auth.log 已放在你的主目录。找出失败登录次数最多的来源 IP，"
echo "然后运行 check <IP>。"
