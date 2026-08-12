#!/bin/sh
# 遥测命令 wrapper：在执行真实命令后，通过串口协议上报命令执行。
#
# 设计约束（不可违反）：
# - 不改变命令的 argv、stdin、stdout、stderr、exit code
# - 只上报 allowlist 中的命令
# - 协议行写入 /dev/tty（控制终端 = 串口控制台），不经过 fd 1/fd 2，
#   因此管道、重定向、命令替换均不受污染：
#     find . | grep foo   -> grep 的 stdin 干净
#     x=$(find .)         -> 捕获的字符串干净
#     find . > out.txt    -> 文件干净
# - 先执行真实命令、捕获退出码，再上报（只统计真正执行过的命令），
#   最后透传退出码。
#
# 协议行 @@HASHTEAM:{...} 经 /dev/tty -> 串口 -> 前端解析器拦截，不显示到终端。
#
# 被统计的命令 allowlist（必须与 src/telemetry/schema.ts 的
# SECLAB_COMMAND_ALLOWLIST 保持一致）：
#   find grep chmod ls cat cd pwd whoami check help su
# hint / reset-level 有独立的遥测事件类型（hint / reset），不经此 wrapper。

# 上报一次命令执行（写入 /dev/tty；非交互子 shell 无 tty 时静默跳过）。
# || true 确保即使 /dev/tty 不可用（非交互子 shell）也不影响退出码链。
_ht_telemetry_emit() {
    printf '@@HASHTEAM:{"type":"telemetry-command","command":"%s"}\n' "$1" \
        > /dev/tty 2>/dev/null || true
}

# 执行真实命令并上报：用子 shell 捕获退出码，确保透传给调用方。
# command 内建绕过函数自身，调用真实 BusyBox applet。
find()     { command find "$@";     local rc=$?; _ht_telemetry_emit find;     return $rc; }
grep()     { command grep "$@";     local rc=$?; _ht_telemetry_emit grep;     return $rc; }
chmod()    { command chmod "$@";    local rc=$?; _ht_telemetry_emit chmod;    return $rc; }
ls()       { command ls "$@";       local rc=$?; _ht_telemetry_emit ls;       return $rc; }
cat()      { command cat "$@";      local rc=$?; _ht_telemetry_emit cat;      return $rc; }
pwd()      { command pwd "$@";      local rc=$?; _ht_telemetry_emit pwd;      return $rc; }
whoami()   { command whoami "$@";   local rc=$?; _ht_telemetry_emit whoami;   return $rc; }

# cd 是 shell 内建，command cd 在 ash 中可调用内建且绕过函数递归。
cd()       { command cd "$@";       local rc=$?; _ht_telemetry_emit cd;       return $rc; }

# check 是 /usr/local/bin/check wrapper（通关成功另有 level_complete 事件）
check()    { /usr/local/bin/check "$@"; local rc=$?; _ht_telemetry_emit check; return $rc; }

# help：ash 有 help 内建，command help 会命中内建而非 /usr/local/bin/help。
# 必须用完整路径，与原 alias help='/usr/local/bin/help' 行为一致。
help()     { /usr/local/bin/help "$@";  local rc=$?; _ht_telemetry_emit help;  return $rc; }

# su：BusyBox su applet 会命中 command su，而非 SUID helper /bin/su。
# 必须用完整路径，与原 alias su='/bin/su' 行为一致。
su()       { /bin/su "$@";              local rc=$?; _ht_telemetry_emit su;    return $rc; }
