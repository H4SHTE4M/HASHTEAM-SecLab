#!/bin/sh
# 第 2 关：隐藏的信息
set -eu
cd "$HOME"
rm -rf inbox logs scripts secrets
rm -f todo.txt app.log backup.sh deploy.sh api.key

cat > notes.txt <<'N_EOF'
这是一个普通的备忘录。
管理员说的消息不在这里。
N_EOF

cat > .message <<'M_EOF'
你找到了隐藏消息！

验证信息：dotfile-42

把验证信息交给 check 即可过关。
M_EOF

echo "──────────────────────────────────────────────"
echo " 第 2 关 · 消失的文件"
echo "──────────────────────────────────────────────"
echo "管理员说主目录里有条消息，但普通的 ls 看不到它。"
echo "找到它、读出来，把验证信息交给 check。"
