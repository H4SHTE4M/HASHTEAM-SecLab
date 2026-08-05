#!/bin/sh
# 第 7 关验证：两段输出的组合结果
set -u
# 答案以加盐 SHA-256 存储，判定行为与明文时代一致（逐字比对哈希，不去空白）
expected_hash=$(cat "${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-7"/answer.sha256)
given=${1:-}
given_hash=$(printf '%s' "hashteam-lab answer v1 level-7:$given" | sha256sum | cut -d ' ' -f 1)
if [ -z "$given" ]; then
    echo "用法：check <组合结果>"
    exit 2
fi
if [ "$given_hash" = "$expected_hash" ]; then
    echo "✓ 验证通过！记住：编码（Base64）只是为了传输，不等于加密。"
    exit 0
fi
echo "✗ 组合结果不对。分别核对两段内容、顺序、连接符和复制边界。"
echo "  需要工具方向时逐层展开右侧提示。"
exit 1
