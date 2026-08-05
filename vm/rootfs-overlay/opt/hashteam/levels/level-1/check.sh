#!/bin/sh
# 第 1 关验证：以 guest 身份交出 README 中的通行证
set -u
# 答案以加盐 SHA-256 存储（盐：hashteam-lab answer v1 level-N:），学生读到哈希也无法直接提交；
# 比对的是同一规范化形式（tr 去空白后）的哈希，判定行为与明文时代完全一致。
expected_hash=$(cat "${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-1"/answer.sha256)
given=$(printf '%s' "${1:-}" | tr -d '[:space:]')
given_hash=$(printf '%s' "hashteam-lab answer v1 level-1:$given" | sha256sum | cut -d ' ' -f 1)
# HASHTEAM_USER 仅用于宿主机自动化测试注入；VM 内未设置，使用真实身份
current_user=${HASHTEAM_USER:-$(whoami)}
if [ "$current_user" != "guest" ]; then
    echo "✗ 请使用 guest 账号完成实验。输入 exit 返回 guest 账号。"
    exit 1
fi
if [ ! -f "$HOME/README" ]; then
    echo "✗ README 不见了？试试 reset-level 重置本关。"
    exit 1
fi
if [ -z "$given" ]; then
    echo "用法：check <通行证>"
    exit 2
fi
if [ "$given_hash" = "$expected_hash" ]; then
    echo "✓ 验证通过！你已经会回答三个最基本的问题：我是谁、我在哪、这里有什么。"
    exit 0
fi
echo "✗ 通行证不对。重新确认说明文件中标签、真实值和复制范围。"
echo "  仍失败时检查输入法是否带入了全角字符（如全角空格）。"
exit 1
