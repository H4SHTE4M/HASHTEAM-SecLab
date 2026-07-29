# 登录欢迎信息 + 向前端通告环境就绪
clear 2>/dev/null || true
ht_render_motd /etc/hashteam/motd
printf '@@HASHTEAM:{"type":"ready","version":1}\n'
