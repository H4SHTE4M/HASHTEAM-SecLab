#!/bin/sh
# 第 6 关：修复问题
set -eu
cd "$HOME"
cat > server.conf <<'C_EOF'
# HASHTEAM 内部服务配置
# 评审意见：以下配置存在安全风险，请修复后运行 check 复查
debug=true
allow_guest=true
listen=0.0.0.0
max_connections=100
C_EOF
echo "──────────────────────────────────────────────"
echo " 第 6 关 · 发现漏洞之后"
echo "──────────────────────────────────────────────"
echo "server.conf 里有 3 处不安全配置："
echo "  debug=true / allow_guest=true / listen=0.0.0.0"
echo "修复为安全配置后运行 check 复查（不限修改方式）。"
