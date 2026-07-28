#!/bin/sh
# 第 8 关验证：后门端口已确认 + 后门进程已清除（只检查最终状态）
set -u
expected=$(cat "${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-8"/answer)
PORT=31337
given=$(printf '%s' "${1:-}" | tr -d '[:space:]')

if [ ! -f "$HOME/incident.txt" ]; then
    echo "✗ 实验环境不完整，试试 reset-level 重置本关。"
    exit 1
fi
if [ -z "$given" ]; then
    echo "用法：check <端口号>"
    exit 2
fi
if [ "$given" != "$expected" ]; then
    echo "✗ $given 不是陌生监听的端口。回到监听状态，找 LISTEN 中不属于基线的那个端口；"
    echo "  如果异常进程已被你结束，reset-level 可以让它重新出现。"
    exit 1
fi
if netstat -tln 2>/dev/null | grep -q ":$PORT "; then
    echo "✗ 端口对了，但异常进程还在运行。回到进程列表确认它的 PID，再结束它。"
    exit 1
fi
echo "✓ 异常进程已清除！你完成了发现异常、确认端口、结束进程和复核状态。"
exit 0
