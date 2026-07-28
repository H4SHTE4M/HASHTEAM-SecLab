#!/bin/sh
# 第 6 关：异常登录分析
set -eu
cd "$HOME"
LEVEL_DIR="${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-6"
cp "$LEVEL_DIR/auth.log" ./auth.log
echo "──────────────────────────────────────────────"
echo " 第 6 关 · 谁在攻击服务器"
echo "──────────────────────────────────────────────"
echo "认证日志已经就绪。请逐段构造统计，找出最高频来源。"
