#!/bin/sh
# 第 1 关：初次登录
set -eu
. "${HASHTEAM_LIB_DIR:-/etc/hashteam}/colors.sh"
cd "$HOME"
cat > README <<'README_EOF'
你好，新人！

欢迎加入 HASHTEAM 实验室的测试服务器。
为了确认你能够从终端读取信息，请记录下面的通行证：

    通行证：first-light

提交时只使用冒号后的值，不要包含标签或多余空格。
README_EOF
ht_banner "第 1 关 · 欢迎来到服务器"
echo "主目录里有一份管理员说明。请从观察身份和位置开始。"
echo "右侧面板会在需要时解释命令、占位符和验证方法。"
