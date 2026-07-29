#!/bin/sh
# 第 4 关：过宽的权限
set -eu
. "${HASHTEAM_LIB_DIR:-/etc/hashteam}/colors.sh"
cd "$HOME"

cat > baseline-report.txt <<'R_EOF'
安全基线扫描报告（自动生成）
扫描时间：今天 03:07

发现以下高风险：
  [高] /home/guest/deploy.sh   权限 777（任何人可读、可改、可执行）
       业务需要：仅属主需要读、写、执行
  [高] /home/guest/secret.txt  权限 644（任何人可读）
       业务需要：仅属主需要读、写

请先把权限字符串分组理解，再按业务需要推导最小权限。
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

ht_banner "第 4 关 · 过宽的权限"
echo "基线扫描发现文件权限与业务用途不符。先观察权限字符串。"
