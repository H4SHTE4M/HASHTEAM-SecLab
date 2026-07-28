#!/usr/bin/env bash
# Linux 检查脚本测试（宿主机版）：
# 用 busybox 在临时 HOME 中运行每一关的 init.sh + check 流程，验证：
#   - 正确答案通过（退出码 0，且 check 包装器输出 passed 协议）
#   - 错误答案失败（非零退出码，且输出 error 协议）
#   - 未完成状态失败（缺少挑战文件时失败）
#   - 使用不同但合法的方法完成时仍能通过
#
# 运行：scripts/test-vm-checks.sh  （可用 BUSYBOX=/path/busybox 指定二进制）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OVERLAY="$ROOT/vm/rootfs-overlay"
export HASHTEAM_LEVELS_DIR="$OVERLAY/opt/hashteam/levels"

BUSYBOX="${BUSYBOX:-}"
if [ -z "$BUSYBOX" ]; then
    for cand in "$ROOT/vm/.cache/busybox" /tmp/busybox "$(command -v busybox || true)"; do
        if [ -n "$cand" ] && [ -x "$cand" ]; then
            BUSYBOX="$cand"
            break
        fi
    done
fi
if [ -z "$BUSYBOX" ]; then
    echo "错误：找不到 busybox 静态二进制。请先运行 vm/build.sh，或设置 BUSYBOX=/path/to/busybox" >&2
    exit 1
fi

WORK="$(mktemp -d)"
stop_test_httpd() {
    if [ -n "${HASHTEAM_HTTP_PORT:-}" ]; then
        pkill -f "httpd -p 127.0.0.1:${HASHTEAM_HTTP_PORT}" 2>/dev/null || true
    fi
    pkill -f "httpd -f -p 127.0.0.1:31337" 2>/dev/null || true
    if [ -n "${HASHTEAM_SECURE_PORT:-}" ]; then
        pkill -f "httpd .*:${HASHTEAM_SECURE_PORT}" 2>/dev/null || true
    fi
}
trap 'stop_test_httpd; rm -rf "$WORK"' EXIT

# 统一的 applet 环境：尽量使用 busybox（贴近 VM 内行为）
STUB="$WORK/stub-bin"
mkdir -p "$STUB"
for app in sh grep sed awk tr cat cp mkdir rm kill sleep printf tail head sort uniq base64 strings od dd cut wc \
    httpd wget chmod stat ps netstat mv; do
    ln -sf "$BUSYBOX" "$STUB/$app"
done
# 宿主机可能运行着其他 httpd；测试内的 init.sh 不应通过 pidof 误杀它们。
# 本测试会在 reset-level 前按专用端口显式停止自己的服务，因此返回空结果即可。
ln -sf /bin/false "$STUB/pidof"

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  ✗ $1" >&2; }
expect_eq() { # desc actual expected
    if [ "$2" = "$3" ]; then ok "$1"; else bad "$1（期望 $3，实际 $2）"; fi
}
expect_contains() { # desc haystack needle
    case "$1" in *"$3"*) ok "$2" ;; *) bad "$2（输出中未找到：$3）" ;; esac
}

# 为某关准备独立沙箱：HOME + 当前关卡号（每次调用都是独立目录）
SB_N=0
SB_DIR=
sandbox() { # level —— 结果放在全局变量 SB_DIR（不能用命令替换，子shell会丢计数）
    SB_N=$((SB_N + 1))
    SB_DIR="$WORK/sb${SB_N}-l$1"
    mkdir -p "$SB_DIR/home/guest/.hashteam"
    echo "$1" > "$SB_DIR/home/guest/.hashteam/level"
}
run_level() { # sandbox script [args...]
    local sb="$1"; shift
    HOME="$sb/home/guest" HASHTEAM_USER=guest PATH="$STUB:$PATH" "$BUSYBOX" sh "$@"
}
run_check() { # sandbox [args...] → 运行 check 包装器
    local sb="$1"; shift
    HOME="$sb/home/guest" HASHTEAM_USER=guest PATH="$STUB:$PATH" "$BUSYBOX" sh "$OVERLAY/usr/local/bin/check" "$@"
}

echo "使用 busybox: $BUSYBOX"
echo

echo "—— 第 1 关 ——"
sandbox 1
SB="$SB_DIR"
run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-1/init.sh" >/dev/null
if OUT=$(run_check "$SB" first-light); then RC=0; else RC=$?; fi
expect_eq "正确答案通过（退出码 0）" "$RC" "0"
expect_contains "$OUT" "输出 passed 协议" '"status":"passed"'
OUT=$(run_check "$SB" wrong-answer) && RC=0 || RC=$?
expect_eq "错误答案失败（退出码 1）" "$RC" "1"
expect_contains "$OUT" "输出 error 协议" '"type":"error"'
sandbox 1
SB2="$SB_DIR"  # 未运行 init：未完成状态
OUT=$(run_check "$SB2" first-light) && RC=0 || RC=$?
expect_eq "未完成状态失败（README 缺失）" "$RC" "1"

echo "—— 第 2 关 ——"
sandbox 2
SB="$SB_DIR"
run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-2/init.sh" >/dev/null
if [ -f "$SB/home/guest/.message" ]; then ok "隐藏文件已创建"; else bad "隐藏文件未创建"; fi
if OUT=$(run_check "$SB" dotfile-42); then RC=0; else RC=$?; fi
expect_eq "正确答案通过" "$RC" "0"
OUT=$(run_check "$SB" wrong) && RC=0 || RC=$?
expect_eq "错误答案失败" "$RC" "1"
rm "$SB/home/guest/.message"
OUT=$(run_check "$SB" dotfile-42) && RC=0 || RC=$?
expect_eq "未完成状态失败（隐藏文件被删）" "$RC" "1"

echo "—— 第 3 关 ——"
sandbox 3
SB="$SB_DIR"
run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-3/init.sh" >/dev/null
if [ -f "$SB/home/guest/inbox/app.log" ]; then ok "inbox 中待整理文件已就绪"; else bad "待整理文件缺失"; fi
OUT=$(run_check "$SB") && RC=0 || RC=$?
expect_eq "未整理时验证失败" "$RC" "1"
(
    cd "$SB/home/guest/inbox"
    mkdir -p logs scripts secrets
    mv app.log logs/
    mv backup.sh deploy.sh scripts/
)
OUT=$(run_check "$SB") && RC=0 || RC=$?
expect_contains "$OUT" "仍有 1 处未归位" "还有 1 处"
(
    cd "$SB/home/guest/inbox"
    mv api.key secrets/
)
if OUT=$(run_check "$SB"); then RC=0; else RC=$?; fi
expect_eq "从 inbox 整理完成后通过" "$RC" "0"

echo "—— 第 4 关 ——"
sandbox 4
SB="$SB_DIR"
run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-4/init.sh" >/dev/null
MODE=$("$STUB/stat" -c %a "$SB/home/guest/deploy.sh")
expect_eq "deploy.sh 初始权限为 777" "$MODE" "777"
MODE=$("$STUB/stat" -c %a "$SB/home/guest/secret.txt")
expect_eq "secret.txt 初始权限为 644" "$MODE" "644"
OUT=$(run_check "$SB") && RC=0 || RC=$?
expect_eq "未修复时验证失败" "$RC" "1"
expect_contains "$OUT" "报告待修复数量" "还有 2 处"
"$STUB/chmod" 700 "$SB/home/guest/deploy.sh"
OUT=$(run_check "$SB") && RC=0 || RC=$?
expect_contains "$OUT" "只修一处仍有 1 处不达标" "还有 1 处"
"$STUB/chmod" 600 "$SB/home/guest/secret.txt"
if OUT=$(run_check "$SB"); then RC=0; else RC=$?; fi
expect_eq "两处修复后通过" "$RC" "0"
# 不同但合法的方法：符号模式
sandbox 4
SB2="$SB_DIR"
run_level "$SB2" "$HASHTEAM_LEVELS_DIR/level-4/init.sh" >/dev/null
"$STUB/chmod" u=rwx,go= "$SB2/home/guest/deploy.sh"
"$STUB/chmod" go-rw "$SB2/home/guest/secret.txt"
if OUT=$(run_check "$SB2"); then RC=0; else RC=$?; fi
expect_eq "符号模式修复同样通过" "$RC" "0"

echo "—— 第 5 关 ——"
sandbox 5
SB="$SB_DIR"
run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-5/init.sh" >/dev/null
CNT=$(cd "$SB/home/guest" && PATH="$STUB:$PATH" "$STUB/grep" 'Failed password' auth.log | "$STUB/wc" -l | "$STUB/tr" -d ' ')
expect_eq "失败登录总数为 30" "$CNT" "30"
if OUT=$(run_check "$SB" 30); then RC=0; else RC=$?; fi
expect_eq "正确答案通过" "$RC" "0"
OUT=$(run_check "$SB" 29) && RC=0 || RC=$?
expect_eq "错误答案失败" "$RC" "1"
sandbox 5
SB2="$SB_DIR"
OUT=$(run_check "$SB2" 30) && RC=0 || RC=$?
expect_eq "未完成状态失败（auth.log 缺失）" "$RC" "1"

echo "—— 第 6 关 ——"
sandbox 6
SB="$SB_DIR"
run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-6/init.sh" >/dev/null
TOP=$(cd "$SB/home/guest" && PATH="$STUB:$PATH" "$STUB/grep" 'Failed password' auth.log | "$STUB/awk" '{print $11}' | "$STUB/sort" | "$STUB/uniq" -c | "$STUB/sort" -nr | "$STUB/head" -1 | "$STUB/awk" '{print $2}')
expect_eq "目标管道统计结果正确" "$TOP" "203.0.113.66"
# 不同但合法的方法：逐 IP 计数比较
ALT=$(cd "$SB/home/guest" && for ip in $(PATH="$STUB:$PATH" "$STUB/awk" '/Failed password/{print $11}' auth.log | "$STUB/sort" -u); do echo "$(PATH="$STUB:$PATH" "$STUB/grep" 'Failed password' auth.log | "$STUB/grep" -c "$ip") $ip"; done | "$STUB/sort" -nr | "$STUB/head" -1 | "$STUB/awk" '{print $2}')
expect_eq "另一种合法统计方法结果一致" "$ALT" "203.0.113.66"
if OUT=$(run_check "$SB" 203.0.113.66); then RC=0; else RC=$?; fi
expect_eq "正确答案通过" "$RC" "0"
OUT=$(run_check "$SB" 198.51.100.23) && RC=0 || RC=$?
expect_eq "错误答案失败（日志中存在但非最多）" "$RC" "1"
OUT=$(run_check "$SB" 9.9.9.9) && RC=0 || RC=$?
expect_eq "错误答案失败（不在日志中）" "$RC" "1"
sandbox 6
SB2="$SB_DIR"
OUT=$(run_check "$SB2" 203.0.113.66) && RC=0 || RC=$?
expect_eq "未完成状态失败（auth.log 缺失）" "$RC" "1"

echo "—— 第 7 关 ——"
sandbox 7
SB="$SB_DIR"
run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-7/init.sh" >/dev/null
FRAG1=$(cd "$SB/home/guest" && PATH="$STUB:$PATH" "$STUB/base64" -d message.b64 | "$STUB/grep" -o 'nebula')
expect_eq "base64 还原出碎片 1" "$FRAG1" "nebula"
FRAG2=$(cd "$SB/home/guest" && PATH="$STUB:$PATH" "$STUB/strings" secret.bin | "$STUB/grep" -o 'comet-7' | "$STUB/head" -1)
expect_eq "strings 提取出碎片 2" "$FRAG2" "comet-7"
if OUT=$(run_check "$SB" nebula-comet-7); then RC=0; else RC=$?; fi
expect_eq "正确答案通过" "$RC" "0"
OUT=$(run_check "$SB" nebula) && RC=0 || RC=$?
expect_eq "错误答案失败（只有一半暗号）" "$RC" "1"

echo "—— 第 8 关 ——"
sandbox 8
SB="$SB_DIR"
run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-8/init.sh" >/dev/null
sleep 1
PID=$(cat "$SB/home/guest/.backdoor/backdoor.pid")
if "$STUB/kill" -0 "$PID" 2>/dev/null; then ok "后门进程已启动（PID $PID）"; else bad "后门进程未启动"; fi
PORTS=$("$STUB/netstat" -tln)
expect_contains "$PORTS" "31337 端口在监听" ":31337 "
PSOUT=$("$STUB/ps")
expect_contains "$PSOUT" "ps 输出可见后门路径" ".backdoor/www"
OUT=$(run_check "$SB" 31337) && RC=0 || RC=$?
expect_eq "进程仍在时验证失败" "$RC" "1"
expect_contains "$OUT" "提示进程仍在运行" "还在运行"
OUT=$(run_check "$SB" 8080) && RC=0 || RC=$?
expect_eq "交错端口验证失败" "$RC" "1"
"$STUB/kill" "$PID"
sleep 1
if OUT=$(run_check "$SB" 31337); then RC=0; else RC=$?; fi
expect_eq "kill 后交出端口通过" "$RC" "0"
# reset-level 幂等：后门重新出现并可再次清除
HOME="$SB/home/guest" PATH="$STUB:$PATH" "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" reset-level >/dev/null
sleep 1
PID=$(cat "$SB/home/guest/.backdoor/backdoor.pid")
PORTS=$("$STUB/netstat" -tln)
expect_contains "$PORTS" "reset-level 后 31337 重新监听" ":31337 "
"$STUB/kill" "$PID" 2>/dev/null || true

echo "—— 第 9 关 ——"
# 沙箱 8080 常被平台占用，默认改用 18081；调用方可在并行任务中覆盖端口。
# （注意：18080 在某些 WSL 环境被系统级端口保留/拦截，无法 bind，故用 18081。）
export HASHTEAM_HTTP_PORT="${HASHTEAM_HTTP_PORT:-18081}"
sandbox 9
SB="$SB_DIR"
run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-9/init.sh" >/dev/null
sleep 1
ROBOTS=$(cd "$SB/home/guest" && PATH="$STUB:$PATH" "$BUSYBOX" wget -q -O - "http://127.0.0.1:${HASHTEAM_HTTP_PORT}/robots.txt")
expect_contains "$ROBOTS" "robots.txt 暴露隐藏路径" "backup.txt"
TOKEN=$(cd "$SB/home/guest" && PATH="$STUB:$PATH" "$BUSYBOX" wget -q -O - "http://127.0.0.1:${HASHTEAM_HTTP_PORT}/backup.txt")
expect_contains "$TOKEN" "备份文件包含令牌" "dbg-token-8848"
if OUT=$(run_check "$SB" dbg-token-8848); then RC=0; else RC=$?; fi
expect_eq "正确答案通过" "$RC" "0"
OUT=$(run_check "$SB" wrong-token) && RC=0 || RC=$?
expect_eq "错误答案失败" "$RC" "1"
# 服务停止后 check 应失败，reset-level 恢复后应通过
stop_test_httpd
sleep 1
OUT=$(run_check "$SB" dbg-token-8848) && RC=0 || RC=$?
expect_eq "服务停止时验证失败" "$RC" "1"
HOME="$SB/home/guest" PATH="$STUB:$PATH" "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" reset-level >/dev/null
sleep 1
if OUT=$(run_check "$SB" dbg-token-8848); then RC=0; else RC=$?; fi
expect_eq "reset-level 后服务恢复并通过" "$RC" "0"
stop_test_httpd

echo "—— 第 10 关 ——"
export HASHTEAM_SECURE_PORT="${HASHTEAM_SECURE_PORT:-19091}"
sandbox 10
SB="$SB_DIR"
run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-10/init.sh" >/dev/null
sleep 1
PORTS=$("$STUB/netstat" -tln)
expect_contains "$PORTS" "初始服务监听所有接口" "0.0.0.0:${HASHTEAM_SECURE_PORT} "
OUT=$(run_check "$SB") && RC=0 || RC=$?
expect_eq "未完成综合状态验证失败" "$RC" "1"
expect_contains "$OUT" "按检查项报告待修复数量" "还有 6 项检查"
cd "$SB/home/guest" && PATH="$STUB:$PATH" "$STUB/sed" -i 's/debug=true/debug=false/' server.conf
OUT=$(run_check "$SB") && RC=0 || RC=$?
expect_contains "$OUT" "只修配置一项仍有多类问题" "还有 5 项检查"
# 方法 1：sed + chmod + 服务重启
cd "$SB/home/guest" && PATH="$STUB:$PATH" "$STUB/sed" -i 's/allow_guest=true/allow_guest=false/' server.conf && PATH="$STUB:$PATH" "$STUB/sed" -i 's/listen=0.0.0.0/listen=127.0.0.1/' server.conf
"$STUB/chmod" 600 "$SB/home/guest/server.conf"
PID=$(cat "$SB/home/guest/.hashteam/level-10-httpd.pid")
"$STUB/kill" "$PID" 2>/dev/null || true
sleep 1
HOME="$SB/home/guest" PATH="$STUB:$PATH" "$STUB/httpd" -p "127.0.0.1:${HASHTEAM_SECURE_PORT}" -h "$SB/home/guest/www"
sleep 1
if OUT=$(run_check "$SB"); then RC=0; else RC=$?; fi
expect_eq "配置、权限和运行状态全部修复后通过" "$RC" "0"
stop_test_httpd
sleep 1
# 方法 2：整体重写文件 + 符号权限（不同但合法的方法）
HASHTEAM_SECURE_PORT=$((HASHTEAM_SECURE_PORT + 1))
export HASHTEAM_SECURE_PORT
sandbox 10
SB2="$SB_DIR"
run_level "$SB2" "$HASHTEAM_LEVELS_DIR/level-10/init.sh" >/dev/null
cat > "$SB2/home/guest/server.conf" <<'CONF'
debug=false
allow_guest=false
listen=127.0.0.1
max_connections=100
CONF
"$STUB/chmod" u=rw,go= "$SB2/home/guest/server.conf"
PID=$(cat "$SB2/home/guest/.hashteam/level-10-httpd.pid")
"$STUB/kill" "$PID" 2>/dev/null || true
sleep 1
HOME="$SB2/home/guest" PATH="$STUB:$PATH" "$STUB/httpd" -p "127.0.0.1:${HASHTEAM_SECURE_PORT}" -h "$SB2/home/guest/www"
sleep 1
if OUT=$(run_check "$SB2"); then RC=0; else RC=$?; fi
expect_eq "重写文件与符号权限修复同样通过" "$RC" "0"

echo
echo "—— 结果：$PASS 通过，$FAIL 失败 ——"
[ "$FAIL" -eq 0 ]
