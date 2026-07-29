#!/bin/sh
# 第 9 关：被遗忘的调试接口（本地 Web 服务，只监听 127.0.0.1）
set -eu
. "${HASHTEAM_LIB_DIR:-/etc/hashteam}/colors.sh"
cd "$HOME"
mkdir -p www
cat > www/index.html <<'H_EOF'
<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>HASHTEAM 内部系统</title></head>
<body>
  <h1>HASHTEAM 内部系统</h1>
  <p>建设中，敬请期待。</p>
</body>
</html>
H_EOF
cat > www/robots.txt <<'R_EOF'
User-agent: *
# 开发调试中，以下路径请勿收录
Disallow: /debug
Disallow: /backup.txt
R_EOF
cat > www/debug <<'D_EOF'
DEBUG MODE: ON
session store: memory
note: 调试令牌临时备份在 backup.txt，上线前记得删除。
D_EOF
cat > www/backup.txt <<'B_EOF'
# 临时备份，上线前务必删除！
debug_token=dbg-token-8848
B_EOF
# 重启本地 Web 服务（只监听虚拟机内部的 127.0.0.1）
# HASHTEAM_HTTP_PORT 仅用于宿主机自动化测试；VM 内固定为 8080
PORT="${HASHTEAM_HTTP_PORT:-8080}"
old=$(pidof httpd 2>/dev/null || true)
if [ -n "$old" ]; then
    kill $old 2>/dev/null || true
fi
# 旧进程退出 / 端口释放可能需要一点时间，重试绑定
tries=0
until httpd -p 127.0.0.1:"$PORT" -h "$HOME/www" 2>/dev/null; do
    tries=$((tries + 1))
    if [ "$tries" -ge 15 ]; then
        echo "本地服务启动失败：127.0.0.1:$PORT 端口仍被占用" >&2
        exit 1
    fi
    sleep 1
done
ht_banner "第 9 关 · 被遗忘的调试接口"
echo "一个 Web 服务已在虚拟机本机启动。请先从监听状态发现入口。"
echo "所有请求必须限制在当前训练虚拟机内。"
