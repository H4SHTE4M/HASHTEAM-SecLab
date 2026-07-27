#!/bin/sh
# 第 4 关验证：完整暗号
set -u
expected=$(cat "${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-4"/answer)
given=${1:-}
if [ -z "$given" ]; then
    echo "用法: check <完整暗号>"
    exit 2
fi
if [ "$given" = "$expected" ]; then
    echo "✓ 验证通过！记住：编码（Base64）只是为了传输，不等于加密。"
    exit 0
fi
echo "✗ 暗号不对。提示：message.b64 用 base64 -d 还原，"
echo "  secret.bin 里的可读字符串用 strings 挑出来，两块碎片用 - 拼接。"
exit 1
