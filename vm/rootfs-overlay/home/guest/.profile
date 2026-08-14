# 登录欢迎信息 + 向前端通告环境就绪
clear 2>/dev/null || true
# UART1 监听器会在浏览器首次 fit 后同步真实列/行；启动前保持标准回退值。
stty cols 80 rows 24 2>/dev/null || true
ht_render_motd /etc/hashteam/motd

# Frontend navigation sends `quit` to leave GDB/debugger first. In an ordinary
# shell the same command is intentionally a no-op before the goto command.
quit() { :; }
