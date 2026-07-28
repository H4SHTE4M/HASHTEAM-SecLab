#!/bin/sh
# 第 10 关：综合配置、权限与运行状态加固
set -eu
cd "$HOME"

PORT="${HASHTEAM_SECURE_PORT:-9090}"

# 清理前几关或上一轮重置留下的 httpd。
old=$(pidof httpd 2>/dev/null || true)
if [ -n "$old" ]; then
    kill $old 2>/dev/null || true
    sleep 1
fi
if [ -f "$HOME/.hashteam/level-10-httpd.pid" ]; then
    kill "$(cat "$HOME/.hashteam/level-10-httpd.pid" 2>/dev/null)" 2>/dev/null || true
fi

mkdir -p "$HOME/www" "$HOME/.hashteam"
cat > "$HOME/www/index.html" <<'H_EOF'
<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>HASHTEAM internal service</title></head>
<body><h1>internal service ready</h1></body>
</html>
H_EOF

cat > server.conf <<C_EOF
# HASHTEAM 内部服务配置
debug=true
allow_guest=true
listen=0.0.0.0
port=$PORT
document_root=$HOME/www
max_connections=100
C_EOF
chmod 664 server.conf

cat > service-runbook.txt <<R_EOF
内部服务运行说明

程序：httpd
内容目录：$HOME/www
端口：$PORT

启动结构：
  httpd -p <监听地址>:<端口> -h <内容目录>

尖括号部分必须从已修复配置和本说明中替换为真实值。
启动后应重新检查进程和监听状态，不能只相信配置文件。
R_EOF

# 初始运行状态故意监听所有接口；-f 便于记录真实 PID。
httpd -f -p 0.0.0.0:"$PORT" -h "$HOME/www" >/dev/null 2>&1 &
pid=$!
echo "$pid" > "$HOME/.hashteam/level-10-httpd.pid"

tries=0
until netstat -tln 2>/dev/null | grep -q "0.0.0.0:$PORT "; do
    tries=$((tries + 1))
    if [ "$tries" -ge 15 ]; then
        kill "$pid" 2>/dev/null || true
        echo "实验环境启动失败：内部服务未能监听训练端口" >&2
        exit 1
    fi
    sleep 1
done

echo "──────────────────────────────────────────────"
echo " 第 10 关 · 发现漏洞之后"
echo "──────────────────────────────────────────────"
echo "内部服务进入上线前复核。请从文件、权限、进程和监听状态开始盘点。"
echo "系统不会提前说明问题数量或最终修改值。"
