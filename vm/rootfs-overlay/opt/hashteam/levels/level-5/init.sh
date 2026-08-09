#!/bin/sh
# 第 5 关：读懂日志（cat / head / wc / grep 入门）
set -eu
. "${HASHTEAM_LIB_DIR:-/etc/hashteam}/colors.sh"
cd "$HOME"
LEVEL_DIR="${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-5"
# 幂等：关卡文件可能已被改成只读，先删后建，保证 reset-level 可重复执行
rm -f auth.log
cp "$LEVEL_DIR/auth.log" ./auth.log
ht_banner "第 5 关 · 读懂日志"
echo "一份 84 行的认证日志已放在主目录。先观察原始格式。"
echo "任务是可靠地统计失败登录总数，具体方法见旁边的任务面板。"
