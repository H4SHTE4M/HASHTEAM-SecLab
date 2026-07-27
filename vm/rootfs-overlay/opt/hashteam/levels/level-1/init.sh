#!/bin/sh
# 第 1 关：初次登录
set -eu
cd "$HOME"
cat > README <<'README_EOF'
你好，新人！

欢迎加入 HASHTEAM 实验室的测试服务器。你正在使用普通用户 guest，
主目录是 /home/guest。开始之前，先确认三件小事：

  1. 你是谁     →  whoami
  2. 你在哪里   →  pwd
  3. 这里有什么 →  ls

为了确认你确实读到了这里，请把下面这个通行证交给 check：

    通行证：first-light

用法：check <通行证>
README_EOF
echo "──────────────────────────────────────────────"
echo " 第 1 关 · 欢迎来到服务器"
echo "──────────────────────────────────────────────"
echo "主目录里有一份 README，读完后把通行证交给 check。"
echo "卡住时可以输入 hint，完成后运行 check <通行证>。"
