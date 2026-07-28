#!/bin/sh
# 第 3 关：搬家与整理（cd / mkdir / mv）
set -eu
cd "$HOME"
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

cat > inbox/app.log <<'A_EOF'
2024-07-12 08:00:01 INFO  服务启动
2024-07-12 08:00:02 INFO  加载配置完成
2024-07-12 08:01:40 WARN  磁盘使用率超过 80%
A_EOF

cat > inbox/backup.sh <<'B_EOF'
#!/bin/sh
echo "正在备份数据目录 ..."
B_EOF

cat > inbox/deploy.sh <<'D_EOF'
#!/bin/sh
echo "正在部署 ..."
D_EOF

cat > inbox/api.key <<'K_EOF'
API_KEY=sk-training-9f3c7a2e
K_EOF

echo "──────────────────────────────────────────────"
echo " 第 3 关 · 搬家与整理"
echo "──────────────────────────────────────────────"
echo "管理员留下了待办。请先从主目录盘点并阅读现场说明。"
