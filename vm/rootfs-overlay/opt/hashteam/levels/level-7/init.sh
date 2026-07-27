#!/bin/sh
# 第 7 关：可疑数据
set -eu
cd "$HOME"
LEVEL_DIR="${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-7"
cp "$LEVEL_DIR/message.b64" ./message.b64
cp "$LEVEL_DIR/secret.bin" ./secret.bin
echo "──────────────────────────────────────────────"
echo " 第 7 关 · 看不懂的消息"
echo "──────────────────────────────────────────────"
echo "message.b64 和 secret.bin 已放在你的主目录。"
echo "两块碎片按提示拼成完整暗号后，运行 check <完整暗号>。"
