#!/bin/sh
# 第 3 关：搬家与整理（cd / mkdir / mv）
set -eu
cd "$HOME"
LEVEL_DIR="${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-3"
rm -f .message notes.txt
mkdir -p inbox
rm -rf inbox/logs inbox/scripts inbox/secrets
rm -f inbox/app.log inbox/backup.sh inbox/deploy.sh inbox/api.key

cat > todo.txt <<'T_EOF'
待整理的文件都在 inbox/ 里。请先进入这个目录，再完成整理：

  logs/       放 app.log
  scripts/    放 backup.sh 和 deploy.sh
  secrets/    放 api.key

操作前先确认位置；整理完成后逐个目录复查。
T_EOF

cp "$LEVEL_DIR/expected/app.log" inbox/app.log
cp "$LEVEL_DIR/expected/backup.sh" inbox/backup.sh
cp "$LEVEL_DIR/expected/deploy.sh" inbox/deploy.sh
cp "$LEVEL_DIR/expected/api.key" inbox/api.key

echo "──────────────────────────────────────────────"
echo " 第 3 关 · 搬家与整理"
echo "──────────────────────────────────────────────"
echo "管理员留下了待办。请先从主目录盘点并阅读现场说明。"
