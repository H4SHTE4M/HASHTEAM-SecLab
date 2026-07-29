#!/bin/sh
# 第 7 关：可疑数据
set -eu
. "${HASHTEAM_LIB_DIR:-/etc/hashteam}/colors.sh"
cd "$HOME"
LEVEL_DIR="${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-7"
cp "$LEVEL_DIR/message.b64" ./message.b64
cp "$LEVEL_DIR/secret.bin" ./secret.bin
ht_banner "第 7 关 · 看不懂的消息"
echo "两个外观不同的可疑文件已放入主目录。请先自行发现并识别类型。"
