#!/bin/sh
# 第 5 关：读懂日志（cat / head / wc / grep 入门）
set -eu
cd "$HOME"
LEVEL_DIR="${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-5"
cp "$LEVEL_DIR/auth.log" ./auth.log
echo "──────────────────────────────────────────────"
echo " 第 5 关 · 读懂日志"
echo "──────────────────────────────────────────────"
echo "一份 84 行的认证训练日志已放在主目录。先观察原始格式。"
echo "任务是可靠地统计失败登录总数，具体方法见右侧教学步骤。"
