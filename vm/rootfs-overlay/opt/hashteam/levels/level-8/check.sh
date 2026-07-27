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
    echo "用法: check <后门监听的端口号>"
    exit 2
fi
if [ "$given" != "$expected" ]; then
    echo "✗ $given 不是后门监听的端口。用 netstat -tln 找 LISTEN 里那个陌生端口；"
    echo "  如果后门已经被你 kill 了，reset-level 可以让它重新出现。"
    exit 1
fi
if netstat -tln 2>/dev/null | grep -q ":$PORT "; then
    echo "✗ 端口对了，但后门进程还在运行。用 ps 找到它，然后 kill <PID>。"
    exit 1
fi
echo "✓ 后门已清除！ps 发现异常、netstat 确认端口、kill 收尾——这就是应急三板斧。"
exit 0
