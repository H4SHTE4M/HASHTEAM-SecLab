#!/bin/sh
# 第 4 关：过宽的权限
set -eu
cd "$HOME"

cat > baseline-report.txt <<'R_EOF'
安全基线扫描报告（自动生成）
扫描时间：今天 03:07

发现 2 项高风险：
  [高] /home/guest/deploy.sh   权限 777（任何人可读、可改、可执行）
       建议：仅属主可读、可写、可执行 → 700
  [高] /home/guest/secret.txt  权限 644（任何人可读）
       建议：仅属主可读、可写 → 600

修复后请运行 check 复查（check 只看最终权限位）。
R_EOF

cat > deploy.sh <<'D_EOF'
#!/bin/sh
# HASHTEAM 一键部署脚本（内部使用）
# 警告：本脚本包含部署密钥，切勿外泄！
DEPLOY_KEY="deploy-key-9f3c"
TARGET="127.0.0.1:9000"

echo "正在把最新版本部署到 $TARGET ..."
echo "（教学环境：这里不会真的部署任何东西）"
D_EOF

cat > secret.txt <<'S_EOF'
# 运维交接备忘（机密）
数据库口令：db-pass-2024
备份服务器口令：backup-pass-7x
# 交接完成后请删除本文件
S_EOF

# cat > 不会重置已存在文件的权限位，必须显式 chmod 才能保证重置后回到「不安全」的初始状态
chmod 777 deploy.sh
chmod 644 secret.txt

echo "──────────────────────────────────────────────"
echo " 第 4 关 · 过宽的权限"
echo "──────────────────────────────────────────────"
echo "基线扫描发现 deploy.sh 和 secret.txt 权限过宽（见 baseline-report.txt）。"
echo "把 deploy.sh 收紧为 700、secret.txt 收紧为 600，然后运行 check 复查。"
