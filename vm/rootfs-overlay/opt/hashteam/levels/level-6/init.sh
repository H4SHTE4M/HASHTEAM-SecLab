#!/bin/sh
# 第 6 关：异常登录分析
set -eu
. "${HASHTEAM_LIB_DIR:-/etc/hashteam}/colors.sh"
cd "$HOME"
LEVEL_DIR="${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-6"
# 幂等：关卡文件可能已被改成只读，先删后建，保证 reset-level 可重复执行
rm -f auth.log
cp "$LEVEL_DIR/auth.log" ./auth.log
ht_banner "第 6 关 · 攻击从哪里来"
echo "认证日志已经就绪。请逐段构造统计，找出最高频来源。"
