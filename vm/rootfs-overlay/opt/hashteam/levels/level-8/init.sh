#!/bin/sh
# 第 8 关：多出来的进程（可疑后门识别与清除）
set -eu
. "${HASHTEAM_LIB_DIR:-/etc/hashteam}/colors.sh"
cd "$HOME"

PORT=31337
BD="$HOME/.backdoor"

cat > incident.txt <<'I_EOF'
巡检告警（值班系统）
时间：今天 03:12
级别：高危

检测到本机存在一个未知监听服务，疑似入侵者遗留的后门。
请值班人建立正常基线，确认异常进程与监听入口，处置后复核并报备端口。
I_EOF

mkdir -p "$BD/www"
cat > "$BD/www/index.html" <<'B_EOF'
<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>it works</title></head>
<body>
  <h1>nothing to see here</h1>
  <p>// TODO: 控制端上线后通过本端口下发指令 —— r.</p>
</body>
</html>
B_EOF

# 幂等：重置时先清理上一轮残留的后门进程（PID 文件，而非 pidof——
# 避免误杀其他关卡/其他 httpd，也避免依赖测试环境被 stub 的 pidof）
if [ -f "$BD/backdoor.pid" ]; then
    kill "$(cat "$BD/backdoor.pid" 2>/dev/null)" 2>/dev/null || true
fi

# 启动后门：httpd -f 前台模式再转后台，$! 即为真实 PID（httpd 默认自我 daemon 化会丢 PID）
tries=0
while :; do
    httpd -f -p 127.0.0.1:"$PORT" -h "$BD/www" >/dev/null 2>&1 &
    pid=$!
    sleep 1
    if netstat -tln 2>/dev/null | grep -q ":$PORT "; then
        echo "$pid" > "$BD/backdoor.pid"
        break
    fi
    kill "$pid" 2>/dev/null || true
    tries=$((tries + 1))
    if [ "$tries" -ge 15 ]; then
        echo "实验环境启动失败：127.0.0.1:$PORT 端口仍被占用" >&2
        exit 1
    fi
    sleep 1
done

ht_banner "第 8 关 · 多出来的进程"
echo "巡检告警：本机出现不属于正常基线的监听服务。"
echo "请从进程与网络状态收集证据，具体观察顺序见旁边的任务面板。"
