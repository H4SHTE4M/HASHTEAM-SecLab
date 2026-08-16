#!/usr/bin/env bash
# Linux 检查脚本测试（宿主机版）：
# 用「htcheck 的宿主机构建 + busybox」在临时 HOME 中运行每一关的 init.sh + check 流程，
# 走的是与 VM 内完全一致的生产评分路径（SUID 检查器 → 关卡 check.sh → 签名协议），验证：
#   - 正确答案通过（退出码 0，且输出带有效 HMAC 签名的 passed 协议）
#   - 错误答案失败（非零退出码，且输出不带签名的 error 协议）
#   - 未完成状态失败（缺少挑战文件时失败）
#   - 使用不同但合法的方法完成时仍能通过
#
# 依赖：gcc（编译 htcheck 宿主构建）、python3（计算期望签名）、busybox。
# 运行：scripts/test-vm-checks.sh  （可用 BUSYBOX=/path/busybox 指定二进制）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OVERLAY="$ROOT/vm/rootfs-overlay"
export HASHTEAM_LEVELS_DIR="$OVERLAY/opt/hashteam/levels"
export HASHTEAM_LIB_DIR="$OVERLAY/etc/hashteam"

BUSYBOX="${BUSYBOX:-}"
if [ -z "$BUSYBOX" ]; then
    for cand in "$ROOT/vm/.cache/busybox" /tmp/busybox "$(command -v busybox || true)"; do
        if [ -n "$cand" ] && [ -x "$cand" ] && "$cand" true >/dev/null 2>&1; then
            BUSYBOX="$cand"
            break
        fi
    done
fi
if [ -z "$BUSYBOX" ]; then
    echo "错误：找不到与当前宿主机兼容的 busybox。请安装原生 busybox，或设置 BUSYBOX=/path/to/busybox" >&2
    exit 1
fi
if [ ! -x "$BUSYBOX" ] || ! "$BUSYBOX" true >/dev/null 2>&1; then
    echo "错误：BUSYBOX 无法在当前宿主机执行：$BUSYBOX" >&2
    exit 1
fi
BUSYBOX="$(realpath "$BUSYBOX")"

WORK="$(mktemp -d)"
export PWNHUB_LABS_DIR="$WORK/labs"
export PWNHUB_COURSE_ORDER="$OVERLAY/opt/pwnhub/course-order"
mkdir -p "$PWNHUB_LABS_DIR/runtime-smoke-01"
cp -R "$ROOT/vm/labs/pwnhub/memory-addresses-01" "$PWNHUB_LABS_DIR/"
cp -R "$ROOT/vm/labs/pwnhub/memory-layout-01" "$PWNHUB_LABS_DIR/"
cp -R "$ROOT/vm/labs/pwnhub/memory-register-stack-01" "$PWNHUB_LABS_DIR/"
cp -R "$ROOT/vm/labs/pwnhub/asm-registers-01" "$PWNHUB_LABS_DIR/"
cp -R "$ROOT/vm/labs/pwnhub/asm-arithmetic-01" "$PWNHUB_LABS_DIR/"
cp -R "$ROOT/vm/labs/pwnhub/asm-stack-ops-01" "$PWNHUB_LABS_DIR/"
cp -R "$ROOT/vm/labs/pwnhub/asm-branches-01" "$PWNHUB_LABS_DIR/"
cp -R "$ROOT/vm/labs/pwnhub/asm-call-stack-01" "$PWNHUB_LABS_DIR/"
cp -R "$ROOT/vm/labs/pwnhub/elf-bytes-01" "$PWNHUB_LABS_DIR/"
cp -R "$ROOT/vm/labs/pwnhub/elf-sections-01" "$PWNHUB_LABS_DIR/"
cp -R "$ROOT/vm/labs/pwnhub/elf-symbols-01" "$PWNHUB_LABS_DIR/"
cp -R "$ROOT/vm/labs/pwnhub/elf-disassembly-01" "$PWNHUB_LABS_DIR/"
for gdb_lab in gdb-breakpoints-01 gdb-register-memory-01 gdb-stack-frames-01 gdb-input-crash-01; do
    cp -R "$ROOT/vm/labs/pwnhub/$gdb_lab" "$PWNHUB_LABS_DIR/"
done
for reverse_lab in rev-strings-xrefs-01 rev-functions-flow-01; do
    cp -R "$ROOT/vm/labs/pwnhub/$reverse_lab" "$PWNHUB_LABS_DIR/"
done
for pwn_lab in pwn-overflow-offset-01 pwn-ret2win-01 pwn-ret2win-args-01 \
    rop-gadget-stack-01 rop-register-chain-01 rop-call-chain-01; do
    cp -R "$ROOT/vm/labs/pwnhub/$pwn_lab" "$PWNHUB_LABS_DIR/"
done
for vuln_lab in vuln-weak-random-01 vuln-integer-overflow-01 vuln-overwrite-variable-01 \
    vuln-string-overflow-01 vuln-format-string-01 vuln-race-condition-01; do
    cp -R "$ROOT/vm/labs/pwnhub/$vuln_lab" "$PWNHUB_LABS_DIR/"
done
chmod +x "$PWNHUB_LABS_DIR/memory-addresses-01"/*.sh "$PWNHUB_LABS_DIR/memory-addresses-01/memory-addresses"
chmod +x "$PWNHUB_LABS_DIR/memory-layout-01"/*.sh
chmod +x "$PWNHUB_LABS_DIR/memory-register-stack-01"/*.sh "$PWNHUB_LABS_DIR/memory-register-stack-01/memory-register-stack"
chmod +x "$PWNHUB_LABS_DIR/asm-registers-01"/*.sh "$PWNHUB_LABS_DIR/asm-registers-01/asm-registers"
chmod +x "$PWNHUB_LABS_DIR/asm-arithmetic-01"/*.sh "$PWNHUB_LABS_DIR/asm-arithmetic-01/asm-arithmetic"
chmod +x "$PWNHUB_LABS_DIR/asm-stack-ops-01"/*.sh "$PWNHUB_LABS_DIR/asm-stack-ops-01/asm-stack-ops"
chmod +x "$PWNHUB_LABS_DIR/asm-branches-01"/*.sh "$PWNHUB_LABS_DIR/asm-branches-01/asm-branches"
chmod +x "$PWNHUB_LABS_DIR/asm-call-stack-01"/*.sh "$PWNHUB_LABS_DIR/asm-call-stack-01/asm-call-stack"
chmod +x "$PWNHUB_LABS_DIR/elf-bytes-01"/*.sh "$PWNHUB_LABS_DIR/elf-bytes-01/elf-bytes"
chmod +x "$PWNHUB_LABS_DIR/elf-sections-01"/*.sh "$PWNHUB_LABS_DIR/elf-sections-01/elf-sections"
chmod +x "$PWNHUB_LABS_DIR/elf-symbols-01"/*.sh "$PWNHUB_LABS_DIR/elf-symbols-01/elf-symbols"
chmod +x "$PWNHUB_LABS_DIR/elf-disassembly-01"/*.sh "$PWNHUB_LABS_DIR/elf-disassembly-01/elf-disassembly"
for gdb_lab in gdb-breakpoints-01 gdb-register-memory-01 gdb-stack-frames-01 gdb-input-crash-01; do
    chmod +x "$PWNHUB_LABS_DIR/$gdb_lab"/*.sh "$PWNHUB_LABS_DIR/$gdb_lab/gdb-runtime"
done
for reverse_lab in rev-strings-xrefs-01 rev-functions-flow-01; do
    chmod +x "$PWNHUB_LABS_DIR/$reverse_lab"/*.sh "$PWNHUB_LABS_DIR/$reverse_lab/reverse-companion"
done
for pwn_lab in pwn-overflow-offset-01 pwn-ret2win-01 pwn-ret2win-args-01 \
    rop-gadget-stack-01 rop-register-chain-01 rop-call-chain-01; do
    chmod +x "$PWNHUB_LABS_DIR/$pwn_lab"/*.sh
    for pwn_bin in overflow-offset ret2win ret2win-args rop-gadget-stack rop-register-chain rop-call-chain; do
        [ -f "$PWNHUB_LABS_DIR/$pwn_lab/$pwn_bin" ] && chmod +x "$PWNHUB_LABS_DIR/$pwn_lab/$pwn_bin"
    done
done
export PWNHUB_READELF="$ROOT/vm/binary-tools/staged/readelf"
export PWNHUB_NM="$ROOT/vm/binary-tools/staged/nm"
export PWNHUB_OBJDUMP="$ROOT/vm/binary-tools/staged/objdump"
export PWNHUB_GDB="$ROOT/vm/binary-tools/staged/gdb"
chmod +x "$PWNHUB_READELF"
chmod +x "$PWNHUB_NM"
chmod +x "$PWNHUB_OBJDUMP"
chmod +x "$PWNHUB_GDB"
for vuln_lab in vuln-weak-random-01 vuln-integer-overflow-01 vuln-overwrite-variable-01 \
    vuln-string-overflow-01 vuln-format-string-01 vuln-race-condition-01; do
    chmod +x "$PWNHUB_LABS_DIR/$vuln_lab"/*.sh
    for vuln_bin in rand-door wallet door frame greeter bank; do
        [ -f "$PWNHUB_LABS_DIR/$vuln_lab/$vuln_bin" ] \
            && chmod +x "$PWNHUB_LABS_DIR/$vuln_lab/$vuln_bin" || true
    done
done
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
for app in sh grep sed awk tr cat cmp cp mkdir rm kill sleep printf tail head sort uniq base64 strings od dd cut wc readlink hexdump xxd \
    httpd wget chmod stat ps netstat mv mktemp timeout sha256sum; do
    ln -sf "$BUSYBOX" "$STUB/$app"
done
ln -sf "$PWNHUB_GDB" "$STUB/gdb"
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
expect_not_contains() { # haystack desc needle
    case "$1" in *"$3"*) bad "$2（输出意外包含：$3）" ;; *) ok "$2" ;; esac
}

# 生产评分路径是 SUID 的 htcheck（i386）；宿主机无法执行 i386 二进制，
# 这里用同一源码现场编译宿主机版本，行为由 RFC 4231 自测与 vitest 共同保障。
HTCHECK="$WORK/htcheck-host"
if ! gcc -O2 -Wall -Werror -o "$HTCHECK" "$ROOT/vm/toolchain-source/htcheck/htcheck.c"; then
    echo "错误：无法编译 htcheck 宿主机版本（需要 gcc）" >&2
    exit 1
fi
"$HTCHECK" selftest >/dev/null || { echo "错误：htcheck 自检失败" >&2; exit 1; }
if OUT=$("$HTCHECK" debugger-reset 2>&1); then RC=0; else RC=$?; fi
expect_eq "非 SUID 调用不能生成 debugger token" "$RC" "2"
expect_not_contains "$OUT" "非 SUID debugger-reset 不泄漏 token" "/tmp/.pwnhub-debugger-"
if OUT=$("$HTCHECK" debugger-complete 2>&1); then RC=0; else RC=$?; fi
expect_eq "非 SUID 调用不能完成 debugger 判题" "$RC" "2"
expect_contains "$OUT" "非受信任调用得到明确拒绝" "调用者不受信任"

# 测试会话密钥（等价于 VM 内 init 生成的 32 字节密钥）；签名期望由 python3 现算。
TEST_KEY="$WORK/protocol.key"
printf 'hashteam-test-session-key-32byte' > "$TEST_KEY"
expected_sig() { # level —— 计算 level-result:N:passed 的期望 HMAC-SHA256
    python3 - "$TEST_KEY" "$1" <<'PYEOF'
import hashlib
import hmac
import sys

key = open(sys.argv[1], "rb").read()
print(hmac.new(key, f"level-result:{sys.argv[2]}:passed".encode(), hashlib.sha256).hexdigest())
PYEOF
}
expected_message_sig() { # message —— 计算任意稳定协议消息的 HMAC-SHA256
    python3 - "$TEST_KEY" "$1" <<'PYEOF'
import hashlib
import hmac
import sys

key = open(sys.argv[1], "rb").read()
print(hmac.new(key, sys.argv[2].encode(), hashlib.sha256).hexdigest())
PYEOF
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
run_check() { # sandbox [args...] → 经 htcheck（生产评分路径的宿主构建）运行 check
    local sb="$1"; shift
    HOME="$sb/home/guest" HASHTEAM_USER=guest PATH="$STUB:$PATH" \
        HASHTEAM_KEY_FILE="$TEST_KEY" HASHTEAM_TEST_SHELL="$BUSYBOX" \
        HASHTEAM_FORCE_COLOR="${HASHTEAM_FORCE_COLOR:-}" \
        "$HTCHECK" run "$@"
}

echo "使用 busybox: $BUSYBOX"
echo

echo "—— 终端语义色 ——"
MOTD_OUT=$(PATH="$STUB:$PATH" HASHTEAM_FORCE_COLOR=0 "$BUSYBOX" sh -c \
    '. "$1"; ht_render_motd "$2"' sh "$HASHTEAM_LIB_DIR/colors.sh" "$HASHTEAM_LIB_DIR/motd")
MOTD_EXPECTED=$("$STUB/cat" "$HASHTEAM_LIB_DIR/motd")
expect_eq "非交互 MOTD 保持纯文本" "$MOTD_OUT" "$MOTD_EXPECTED"

# check 包装器必须委托给 SUID 评分检查器 htcheck（语义色与签名都在 htcheck 内，
# ✓/✗ 行着色由下方各关卡的交互断言覆盖）
if grep -q 'htcheck}" run "$@"' "$OVERLAY/usr/local/bin/check"; then
    ok "check 包装器委托 htcheck"
else
    bad "check 包装器未委托 htcheck"
fi
# colors.sh 不再保留旧的 shell 版结果渲染（避免与 htcheck.c 双份实现漂移）
if grep -q 'ht_render_result' "$HASHTEAM_LIB_DIR/colors.sh"; then
    bad "colors.sh 仍残留 ht_render_result"
else
    ok "结果渲染实现唯一（htcheck.c）"
fi

echo "—— 第 1 关 ——"
sandbox 1
SB="$SB_DIR"
run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-1/init.sh" >/dev/null
if OUT=$(run_check "$SB" first-light); then RC=0; else RC=$?; fi
expect_eq "正确答案通过（退出码 0）" "$RC" "0"
expect_contains "$OUT" "输出 passed 协议" '"status":"passed"'
if OUT=$(run_check "$SB" "  first-light  "); then RC=0; else RC=$?; fi
expect_eq "答案带多余空格仍通过" "$RC" "0"
OUT=$(run_check "$SB" wrong-answer) && RC=0 || RC=$?
expect_eq "错误答案失败（退出码 1）" "$RC" "1"
expect_contains "$OUT" "输出 error 协议" '"type":"error"'

if OUT=$(HASHTEAM_FORCE_COLOR=1 run_check "$SB" first-light); then RC=0; else RC=$?; fi
expect_eq "强制颜色不改变成功退出码" "$RC" "0"
ESC=$(printf '\033')
case "$OUT" in
    *"${ESC}[1;92m✓ 验证通过！"*) ok "交互成功结果包含 ANSI" ;;
    *) bad "交互成功结果缺少 ANSI" ;;
esac
PROTOCOL=$(printf '%s\n' "$OUT" | "$STUB/sed" -n '/^@@HASHTEAM:/p')
expect_eq "成功协议行带有效签名且保持纯文本" "$PROTOCOL" \
    "@@HASHTEAM:{\"type\":\"level-result\",\"level\":1,\"status\":\"passed\",\"sig\":\"$(expected_sig 1)\"}"

OUT=$(HASHTEAM_FORCE_COLOR=1 run_check "$SB" wrong-answer) && RC=0 || RC=$?
expect_eq "强制颜色不改变失败退出码" "$RC" "1"
case "$OUT" in
    *"${ESC}[1;91m✗ 通行证不对。"*) ok "交互失败结果包含 ANSI" ;;
    *) bad "交互失败结果缺少 ANSI" ;;
esac
PROTOCOL=$(printf '%s\n' "$OUT" | "$STUB/sed" -n '/^@@HASHTEAM:/p')
expect_eq "错误协议行保持纯文本" "$PROTOCOL" '@@HASHTEAM:{"type":"error","message":"level 1 check failed"}'
sandbox 1
SB2="$SB_DIR"  # 未运行 init：未完成状态
OUT=$(run_check "$SB2" first-light) && RC=0 || RC=$?
expect_eq "未完成状态失败（README 缺失）" "$RC" "1"

echo "—— 稳定实验运行时 ——"
printf '%s\n' \
    '#!/bin/sh' \
    'set -eu' \
    'mkdir -p "$HOME/runtime-smoke-01"' \
    'printf ready > "$HOME/runtime-smoke-01/state"' \
    > "$PWNHUB_LABS_DIR/runtime-smoke-01/init.sh"
printf '%s\n' \
    '#!/bin/sh' \
    'set -eu' \
    '[ -f "$HOME/runtime-smoke-01/state" ] || { echo "state missing" >&2; exit 1; }' \
    '[ "${1:-}" = "runtime-ok" ] || { echo "answer mismatch" >&2; exit 1; }' \
    'echo "stable runtime passed"' \
    > "$PWNHUB_LABS_DIR/runtime-smoke-01/check.sh"
printf '1\n' > "$PWNHUB_LABS_DIR/runtime-smoke-01/unlock-level"

sandbox 1
LAB_SB="$SB_DIR"
if OUT=$(HOME="$LAB_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$LAB_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab runtime-smoke-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "前置数字关卡未完成时拒绝稳定实验" "$RC" "3"
printf '1\n' > "$LAB_SB/home/guest/.hashteam/max-completed"
if OUT=$(HOME="$LAB_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$LAB_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab runtime-smoke-01); then
    RC=0
else
    RC=$?
fi
expect_eq "解锁后可进入稳定实验" "$RC" "0"
expect_contains "$OUT" "lab-ready 使用稳定身份" '"type":"lab-ready","labId":"runtime-smoke-01"'
expect_contains "$OUT" "lab-ready 带有效签名" \
    "\"sig\":\"$(expected_message_sig 'lab-ready:runtime-smoke-01')\""
if OUT=$(run_check "$LAB_SB" runtime-ok); then RC=0; else RC=$?; fi
expect_eq "稳定实验真实 check 通过" "$RC" "0"
expect_contains "$OUT" "lab-result 使用稳定身份" '"type":"lab-result","labId":"runtime-smoke-01"'
expect_contains "$OUT" "lab-result 带有效签名" \
    "\"sig\":\"$(expected_message_sig 'lab-result:runtime-smoke-01:passed')\""
grep -Fqx runtime-smoke-01 "$LAB_SB/home/guest/.hashteam/completed-labs" \
    && ok "稳定实验完成状态由评分器记录" \
    || bad "稳定实验完成状态未记录"
OUT=$(run_check "$LAB_SB" wrong) && RC=0 || RC=$?
expect_eq "稳定实验错误答案失败" "$RC" "1"
expect_contains "$OUT" "稳定实验失败不签名" '"type":"error","message":"lab runtime-smoke-01 check failed"'
rm -f "$LAB_SB/home/guest/runtime-smoke-01/state"
HOME="$LAB_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$LAB_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" reset-level >/dev/null
[ -f "$LAB_SB/home/guest/runtime-smoke-01/state" ] \
    && ok "reset-level 可重置稳定实验" \
    || bad "reset-level 未重置稳定实验"

sandbox 1
MEMORY_SB="$SB_DIR"
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab memory-addresses-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "内存实验可独立进入" "$RC" "0"
expect_contains "$OUT" "内存实验发出稳定 ready" '"type":"lab-ready","labId":"memory-addresses-01"'
expect_contains "$OUT" "稳定实验显示全局序号与标题" '第 1 关 · 地址、值与指针'
[ -x "$MEMORY_SB/home/guest/memory-addresses" ] \
    && ok "内存实验样本已复制到 HOME" \
    || bad "内存实验样本未复制到 HOME"
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab asm-registers-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "汇编实验在内存实验完成前保持锁定" "$RC" "3"
if OUT=$(run_check "$MEMORY_SB" 0x0804b140 0xdec0de42 0x0804b140 -42); then RC=0; else RC=$?; fi
expect_eq "内存实验重放真实 ELF 后通过" "$RC" "0"
expect_contains "$OUT" "内存实验发出签名结果" '"type":"lab-result","labId":"memory-addresses-01"'
OUT=$(run_check "$MEMORY_SB" 0x0804b140 0xdec0de42 0x0804b140 42) && RC=0 || RC=$?
expect_eq "内存实验错误补码值失败" "$RC" "1"
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab memory-register-stack-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "栈实验在内存布局实验完成前保持锁定" "$RC" "3"
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab memory-layout-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "地址实验完成后可进入内存布局实验" "$RC" "0"
expect_contains "$OUT" "内存布局实验发出稳定 ready" '"type":"lab-ready","labId":"memory-layout-01"'
[ ! -e "$MEMORY_SB/home/guest/memory-addresses" ] && [ -x "$MEMORY_SB/home/guest/inspect-memory-layout.sh" ] \
    && ok "切换实验会清理旧样本并复制新样本" \
    || bad "切换实验未正确清理或复制 HOME 样本"
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab memory-register-stack-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "栈实验在内存布局实验完成前保持锁定" "$RC" "3"
if OUT=$(run_check "$MEMORY_SB" r-x rw- rw- rw-); then RC=0; else RC=$?; fi
expect_eq "内存布局实验重读真实映射后通过" "$RC" "0"
expect_contains "$OUT" "内存布局实验发出签名结果" '"type":"lab-result","labId":"memory-layout-01"'
OUT=$(run_check "$MEMORY_SB" rwx rw- rw- rw-) && RC=0 || RC=$?
expect_eq "内存布局实验错误权限失败" "$RC" "1"
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab memory-register-stack-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "内存布局实验完成后可进入栈实验" "$RC" "0"
expect_contains "$OUT" "栈实验发出稳定 ready" '"type":"lab-ready","labId":"memory-register-stack-01"'
[ ! -e "$MEMORY_SB/home/guest/inspect-memory-layout.sh" ] && [ -x "$MEMORY_SB/home/guest/memory-register-stack" ] \
    && ok "切换到栈实验会清理布局脚本并复制栈样本" \
    || bad "切换到栈实验未正确清理或复制 HOME 文件"
if OUT=$(run_check "$MEMORY_SB" 0x0804c158 0x22222222 0x11111111 0x11111111); then RC=0; else RC=$?; fi
expect_eq "栈实验重放真实 ELF 后通过" "$RC" "0"
expect_contains "$OUT" "栈实验发出签名结果" '"type":"lab-result","labId":"memory-register-stack-01"'
OUT=$(run_check "$MEMORY_SB" 0x0804c15c 0x22222222 0x11111111 0x11111111) && RC=0 || RC=$?
expect_eq "栈实验错误栈顶失败" "$RC" "1"
echo "—— 第一批漏洞（vuln-first）实验 ——"
vuln_goto() {
    if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
        HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
        HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
        "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab "$1" 2>&1); then
        RC=0
    else
        RC=$?
    fi
}

vuln_goto asm-registers-01
expect_eq "汇编实验在 vuln-first 完成前保持锁定" "$RC" "3"

# 1. 弱随机：当天口令由真实样本重放得出，提交后通过。
chmod +x "$PWNHUB_LABS_DIR/vuln-weak-random-01/rand-door"
WEAK_RANDOM_OUTPUT="$(HOME="$MEMORY_SB/home/guest" \
    "$PWNHUB_LABS_DIR/vuln-weak-random-01/rand-door" 2>/dev/null || true)"
WEAK_RANDOM_SECRET="$(printf '%s\n' "$WEAK_RANDOM_OUTPUT" \
    | "$STUB/awk" '{ for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]{6}$/) { print $i; exit } }')"
[ -n "$WEAK_RANDOM_SECRET" ] || WEAK_RANDOM_SECRET=000000
WEAK_RANDOM_YESTERDAY_SEED=$(( $(date +%s) / 86400 - 1 ))
WEAK_RANDOM_YESTERDAY_SECRET="$(
    "$PWNHUB_LABS_DIR/vuln-weak-random-01/rand-door" --seed "$WEAK_RANDOM_YESTERDAY_SEED" \
        | "$STUB/awk" '{ print $NF }'
)"
WEAK_RANDOM_WRONG_NUMBER=$(( (10#$WEAK_RANDOM_SECRET + 1) % 1000000 ))
printf -v WEAK_RANDOM_WRONG '%06d' "$WEAK_RANDOM_WRONG_NUMBER"
if [ "$WEAK_RANDOM_WRONG" = "$WEAK_RANDOM_YESTERDAY_SECRET" ]; then
    WEAK_RANDOM_WRONG_NUMBER=$(( (WEAK_RANDOM_WRONG_NUMBER + 1) % 1000000 ))
    printf -v WEAK_RANDOM_WRONG '%06d' "$WEAK_RANDOM_WRONG_NUMBER"
fi
vuln_goto vuln-weak-random-01
expect_eq "内存栈完成后可进入弱随机实验" "$RC" "0"
expect_contains "$OUT" "弱随机实验发出稳定 ready" '"type":"lab-ready","labId":"vuln-weak-random-01"'
[ -x "$MEMORY_SB/home/guest/rand-door" ] \
    && ok "弱随机样本已复制到 HOME" \
    || bad "弱随机样本未复制到 HOME"
if OUT=$(run_check "$MEMORY_SB" "$WEAK_RANDOM_SECRET"); then RC=0; else RC=$?; fi
expect_eq "弱随机预测今日口令通过" "$RC" "0"
expect_contains "$OUT" "弱随机发出签名结果" '"type":"lab-result","labId":"vuln-weak-random-01"'
OUT=$(run_check "$MEMORY_SB" "$WEAK_RANDOM_WRONG") && RC=0 || RC=$?
expect_eq "弱随机错误口令失败" "$RC" "1"
expect_not_contains "$OUT" "弱随机失败不签发结果" '"type":"lab-result"'

# 2. 整数溢出：提交 数量=256、回绕金额=0 通过。
vuln_goto vuln-integer-overflow-01
expect_eq "弱随机完成后可进入整数溢出实验" "$RC" "0"
expect_contains "$OUT" "整数溢出实验发出稳定 ready" '"type":"lab-ready","labId":"vuln-integer-overflow-01"'
[ -x "$MEMORY_SB/home/guest/wallet" ] \
    && ok "整数溢出样本已复制到 HOME" \
    || bad "整数溢出样本未复制到 HOME"
if OUT=$(run_check "$MEMORY_SB" 256 0); then RC=0; else RC=$?; fi
expect_eq "整数溢出提交 256,0 通过" "$RC" "0"
expect_contains "$OUT" "整数溢出发出签名结果" '"type":"lab-result","labId":"vuln-integer-overflow-01"'
OUT=$(run_check "$MEMORY_SB" 256 1) && RC=0 || RC=$?
expect_eq "整数溢出错误回绕金额失败" "$RC" "1"
expect_not_contains "$OUT" "整数溢出失败不签发结果" '"type":"lab-result"'

# 3. 覆盖变量：17 个 A 越过 16 字节缓冲区改写 is_admin。
vuln_goto vuln-overwrite-variable-01
expect_eq "整数溢出完成后可进入覆盖变量实验" "$RC" "0"
expect_contains "$OUT" "覆盖变量实验发出稳定 ready" '"type":"lab-ready","labId":"vuln-overwrite-variable-01"'
[ -x "$MEMORY_SB/home/guest/door" ] \
    && ok "覆盖变量样本已复制到 HOME" \
    || bad "覆盖变量样本未复制到 HOME"
OVERWRITE_DIR="$MEMORY_SB/home/guest/vuln-overwrite-variable-01"
mkdir -p "$OVERWRITE_DIR"
OUT=$(run_check "$MEMORY_SB") && RC=0 || RC=$?
expect_eq "覆盖变量缺 payload 失败" "$RC" "2"
expect_contains "$OUT" "覆盖变量给出缺失反馈" "payload file is missing"
OUT=$(run_check "$MEMORY_SB" "$OVERWRITE_DIR/../outside.bin") && RC=0 || RC=$?
expect_eq "覆盖变量拒绝路径穿越 payload" "$RC" "2"
expect_contains "$OUT" "覆盖变量给出穿越反馈" "path traversal is not allowed"
python3 -c "import sys; sys.stdout.write('A' * 17)" > "$OVERWRITE_DIR/input.txt"
if OUT=$(run_check "$MEMORY_SB"); then RC=0; else RC=$?; fi
expect_eq "覆盖变量真实重放通过" "$RC" "0"
expect_contains "$OUT" "覆盖变量发出签名结果" '"type":"lab-result","labId":"vuln-overwrite-variable-01"'
python3 -c "import sys; sys.stdout.write('A' * 5)" > "$OVERWRITE_DIR/input.txt"
OUT=$(run_check "$MEMORY_SB") && RC=0 || RC=$?
expect_eq "覆盖变量过短 payload 失败" "$RC" "1"
python3 -c "import sys; sys.stdout.write('A' * 65)" > "$OVERWRITE_DIR/input.txt"
OUT=$(run_check "$MEMORY_SB") && RC=0 || RC=$?
expect_eq "覆盖变量拒绝超限 payload" "$RC" "2"
expect_contains "$OUT" "覆盖变量给出超限反馈" "exceeds the 64 byte limit"

# 4. 字符串溢出：36 个 A 覆盖到保存的返回地址并崩溃。
vuln_goto vuln-string-overflow-01
expect_eq "覆盖变量完成后可进入字符串溢出实验" "$RC" "0"
expect_contains "$OUT" "字符串溢出实验发出稳定 ready" '"type":"lab-ready","labId":"vuln-string-overflow-01"'
[ -x "$MEMORY_SB/home/guest/frame" ] \
    && ok "字符串溢出样本已复制到 HOME" \
    || bad "字符串溢出样本未复制到 HOME"
STRING_DIR="$MEMORY_SB/home/guest/vuln-string-overflow-01"
mkdir -p "$STRING_DIR"
OUT=$(run_check "$MEMORY_SB") && RC=0 || RC=$?
expect_eq "字符串溢出缺 payload 失败" "$RC" "2"
expect_contains "$OUT" "字符串溢出给出缺失反馈" "payload file is missing"
OUT=$(run_check "$MEMORY_SB" "$STRING_DIR/../outside.bin") && RC=0 || RC=$?
expect_eq "字符串溢出拒绝路径穿越 payload" "$RC" "2"
expect_contains "$OUT" "字符串溢出给出穿越反馈" "path traversal is not allowed"
python3 -c "import sys; sys.stdout.write('A' * 36)" > "$STRING_DIR/payload.bin"
if OUT=$(run_check "$MEMORY_SB"); then RC=0; else RC=$?; fi
expect_eq "字符串溢出真实重放通过" "$RC" "0"
expect_contains "$OUT" "字符串溢出发出签名结果" '"type":"lab-result","labId":"vuln-string-overflow-01"'
python3 -c "import sys; sys.stdout.write('A' * 5)" > "$STRING_DIR/payload.bin"
OUT=$(run_check "$MEMORY_SB") && RC=0 || RC=$?
expect_eq "字符串溢出过短 payload 失败" "$RC" "1"
python3 -c "import sys; sys.stdout.write('A' * 49)" > "$STRING_DIR/payload.bin"
OUT=$(run_check "$MEMORY_SB") && RC=0 || RC=$?
expect_eq "字符串溢出拒绝超限 payload" "$RC" "2"
expect_contains "$OUT" "字符串溢出给出超限反馈" "exceeds the 48 byte limit"

# 5. 格式化字符串：提交 leaked 的 0badf00d 通过。
vuln_goto vuln-format-string-01
expect_eq "字符串溢出完成后可进入格式化字符串实验" "$RC" "0"
expect_contains "$OUT" "格式化字符串实验发出稳定 ready" '"type":"lab-ready","labId":"vuln-format-string-01"'
[ -x "$MEMORY_SB/home/guest/greeter" ] \
    && ok "格式化字符串样本已复制到 HOME" \
    || bad "格式化字符串样本未复制到 HOME"
if OUT=$(run_check "$MEMORY_SB" 0badf00d); then RC=0; else RC=$?; fi
expect_eq "格式化字符串提交 0badf00d 通过" "$RC" "0"
expect_contains "$OUT" "格式化字符串发出签名结果" '"type":"lab-result","labId":"vuln-format-string-01"'
OUT=$(run_check "$MEMORY_SB" deadbeef) && RC=0 || RC=$?
expect_eq "格式化字符串错误秘密值失败" "$RC" "1"
expect_not_contains "$OUT" "格式化字符串失败不签发结果" '"type":"lab-result"'

# 6. 竞争条件：两次并发取款都成功，ledger 两行。
chmod +x "$PWNHUB_LABS_DIR/vuln-race-condition-01/bank"
vuln_goto vuln-race-condition-01
expect_eq "格式化字符串完成后可进入竞争条件实验" "$RC" "0"
expect_contains "$OUT" "竞争条件实验发出稳定 ready" '"type":"lab-ready","labId":"vuln-race-condition-01"'
[ -x "$MEMORY_SB/home/guest/bank" ] \
    && ok "竞争条件样本已复制到 HOME" \
    || bad "竞争条件样本未复制到 HOME"
RACE_DIR="$MEMORY_SB/home/guest/vuln-race-condition-01"
mkdir -p "$RACE_DIR"
OUT=$(run_check "$MEMORY_SB") && RC=0 || RC=$?
expect_eq "竞争条件无成功记录时失败" "$RC" "1"
HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    "$STUB/timeout" 15 "$BUSYBOX" sh -c \
    '"$1" 800 & "$1" 800 & wait' sh "$PWNHUB_LABS_DIR/vuln-race-condition-01/bank" \
    >/dev/null 2>&1 || true
if OUT=$(run_check "$MEMORY_SB"); then RC=0; else RC=$?; fi
expect_eq "竞争条件两次并发扣款通过" "$RC" "0"
expect_contains "$OUT" "竞争条件发出签名结果" '"type":"lab-result","labId":"vuln-race-condition-01"'

if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab asm-registers-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "竞争条件实验完成后可进入汇编实验" "$RC" "0"
expect_contains "$OUT" "汇编实验发出稳定 ready" '"type":"lab-ready","labId":"asm-registers-01"'
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab asm-arithmetic-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "算术实验在寄存器实验完成前保持锁定" "$RC" "3"
if OUT=$(run_check "$MEMORY_SB" 0x11223344 0x0000100c ESP); then RC=0; else RC=$?; fi
expect_eq "寄存器实验重放真实 ELF 后通过" "$RC" "0"
expect_contains "$OUT" "寄存器实验发出签名结果" '"type":"lab-result","labId":"asm-registers-01"'
OUT=$(run_check "$MEMORY_SB" 0x11223344 0x00001008 ESP) && RC=0 || RC=$?
expect_eq "寄存器实验错误 lea 结果失败" "$RC" "1"
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab asm-arithmetic-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "寄存器实验完成后可进入算术实验" "$RC" "0"
expect_contains "$OUT" "算术实验发出稳定 ready" '"type":"lab-ready","labId":"asm-arithmetic-01"'
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab asm-stack-ops-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "栈操作实验在算术实验完成前保持锁定" "$RC" "3"
if OUT=$(run_check "$MEMORY_SB" 0x0000000d 0x0000002a 0x00000008 0x00000003 0x00000022); then RC=0; else RC=$?; fi
expect_eq "算术实验重放真实 ELF 后通过" "$RC" "0"
expect_contains "$OUT" "算术实验发出签名结果" '"type":"lab-result","labId":"asm-arithmetic-01"'
OUT=$(run_check "$MEMORY_SB" 0x0000000d 0x0000002a 0x00000008 0x00000004 0x00000022) && RC=0 || RC=$?
expect_eq "算术实验错误余数失败" "$RC" "1"
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab asm-stack-ops-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "算术实验完成后可进入栈操作实验" "$RC" "0"
expect_contains "$OUT" "栈操作实验发出稳定 ready" '"type":"lab-ready","labId":"asm-stack-ops-01"'
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab asm-branches-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "条件分支实验在栈操作实验完成前保持锁定" "$RC" "3"
if OUT=$(run_check "$MEMORY_SB" 0x0804c0dc 0x0804c0d8 0x22222222 0x11111111); then RC=0; else RC=$?; fi
expect_eq "栈操作实验重放真实 ELF 后通过" "$RC" "0"
expect_contains "$OUT" "栈操作实验发出签名结果" '"type":"lab-result","labId":"asm-stack-ops-01"'
OUT=$(run_check "$MEMORY_SB" 0x0804c0dc 0x0804c0d8 0x11111111 0x22222222) && RC=0 || RC=$?
expect_eq "栈操作实验错误取值顺序失败" "$RC" "1"
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab asm-branches-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "栈操作实验完成后可进入条件分支实验" "$RC" "0"
expect_contains "$OUT" "条件分支实验发出稳定 ready" '"type":"lab-ready","labId":"asm-branches-01"'
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab asm-call-stack-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "call/ret 实验在条件分支实验完成前保持锁定" "$RC" "3"
if OUT=$(run_check "$MEMORY_SB" 1 1 1 ZF SF=OF); then RC=0; else RC=$?; fi
expect_eq "条件分支实验重放真实 ELF 后通过" "$RC" "0"
expect_contains "$OUT" "条件分支实验发出签名结果" '"type":"lab-result","labId":"asm-branches-01"'
OUT=$(run_check "$MEMORY_SB" 1 1 0 ZF SF=OF) && RC=0 || RC=$?
expect_eq "条件分支实验错误跳转结果失败" "$RC" "1"
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab asm-call-stack-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "条件分支实验完成后可进入 call/ret 实验" "$RC" "0"
expect_contains "$OUT" "call/ret 实验发出稳定 ready" '"type":"lab-ready","labId":"asm-call-stack-01"'
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab elf-bytes-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "ELF 实验在 call/ret 实验完成前保持锁定" "$RC" "3"
if OUT=$(run_check "$MEMORY_SB" 0x08049081 0x00000015 0x0000002b 4 0x0000002b); then RC=0; else RC=$?; fi
expect_eq "call/ret 实验重放真实 ELF 后通过" "$RC" "0"
expect_contains "$OUT" "call/ret 实验发出签名结果" '"type":"lab-result","labId":"asm-call-stack-01"'
OUT=$(run_check "$MEMORY_SB" 0x08049081 0x00000015 0x0000002a 4 0x0000002b) && RC=0 || RC=$?
expect_eq "call/ret 实验错误局部值失败" "$RC" "1"
OUT=$(run_check "$MEMORY_SB" 0x08049081 0x00000015 0x0000002b 8 0x0000002b) && RC=0 || RC=$?
expect_eq "call/ret 实验错误清理值失败" "$RC" "1"
expect_not_contains "$OUT" "call/ret 失败反馈不泄露清理答案" "必须是 4"
expect_not_contains "$OUT" "call/ret 失败反馈不泄露紧凑答案" "必须是4"
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab elf-bytes-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "call/ret 实验完成后可进入 ELF 实验" "$RC" "0"
expect_contains "$OUT" "ELF 实验发出稳定 ready" '"type":"lab-ready","labId":"elf-bytes-01"'
VM_FILE_OUTPUT="$("$BUSYBOX" sh "$ROOT/vm/binary-tools/staged/file" "$PWNHUB_LABS_DIR/elf-bytes-01/elf-bytes")"
case "$VM_FILE_OUTPUT" in
    *"ELF 32-bit LSB executable, Intel 80386"*|*"ELF 32-bit LSB executable, Intel i386"*)
        ok "VM 简化 file 解析 i386 ELF"
        ;;
    *) bad "VM 简化 file 未识别 i386 ELF" ;;
esac
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab elf-sections-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "节表实验在 ELF 字节实验完成前保持锁定" "$RC" "3"
if OUT=$(run_check "$MEMORY_SB" 7f454c46 01 01 ORBIT-386); then RC=0; else RC=$?; fi
expect_eq "ELF 实验重新读取真实文件后通过" "$RC" "0"
expect_contains "$OUT" "ELF 实验发出签名结果" '"type":"lab-result","labId":"elf-bytes-01"'
OUT=$(run_check "$MEMORY_SB" 7f454c46 02 01 ORBIT-386) && RC=0 || RC=$?
expect_eq "ELF 实验错误位数标记失败" "$RC" "1"
expect_not_contains "$OUT" "ELF 失败反馈不泄露正确位数标记" "位数标记必须是 01"
OUT=$(run_check "$MEMORY_SB" 7f454c46 01 01 WRONG-MARKER) && RC=0 || RC=$?
expect_eq "ELF 实验错误字符串标记失败" "$RC" "1"
expect_not_contains "$OUT" "ELF 失败反馈不泄露正确字符串标记" "ORBIT-386"
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab elf-sections-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "ELF 字节实验完成后可进入节表实验" "$RC" "0"
expect_contains "$OUT" "节表实验发出稳定 ready" '"type":"lab-ready","labId":"elf-sections-01"'
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab elf-symbols-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "符号实验在节表实验完成前保持锁定" "$RC" "3"
if OUT=$(run_check "$MEMORY_SB" 0x8049033 08049000 NOBITS WA); then RC=0; else RC=$?; fi
expect_eq "节表实验调用锁定 readelf 后通过" "$RC" "0"
expect_contains "$OUT" "节表实验发出签名结果" '"type":"lab-result","labId":"elf-sections-01"'
OUT=$(run_check "$MEMORY_SB" 0x8049033 08049000 PROGBITS WA) && RC=0 || RC=$?
expect_eq "节表实验错误 .bss 类型失败" "$RC" "1"
expect_not_contains "$OUT" "节表失败反馈不泄露正确类型" "必须是 NOBITS"
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab elf-symbols-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "节表实验完成后可进入符号实验" "$RC" "0"
expect_contains "$OUT" "符号实验发出稳定 ready" '"type":"lab-ready","labId":"elf-symbols-01"'
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab elf-disassembly-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "反汇编实验在符号实验完成前保持锁定" "$RC" "3"
if OUT=$(run_check "$MEMORY_SB" 0x08049031 T t B); then RC=0; else RC=$?; fi
expect_eq "符号实验调用锁定 nm 后通过" "$RC" "0"
expect_contains "$OUT" "符号实验发出签名结果" '"type":"lab-result","labId":"elf-symbols-01"'
OUT=$(run_check "$MEMORY_SB" 0x08049031 t t B) && RC=0 || RC=$?
expect_eq "符号实验错误函数可见性失败" "$RC" "1"
expect_not_contains "$OUT" "符号失败反馈不泄露正确类型" "compute_total 类型必须是 T"
if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
    HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab elf-disassembly-01 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "符号实验完成后可进入反汇编实验" "$RC" "0"
expect_contains "$OUT" "反汇编实验发出稳定 ready" '"type":"lab-ready","labId":"elf-disassembly-01"'
if OUT=$(run_check "$MEMORY_SB" 08049020 choose_path jne 7); then RC=0; else RC=$?; fi
expect_eq "反汇编实验调用锁定 objdump 后通过" "$RC" "0"
expect_contains "$OUT" "反汇编实验发出签名结果" '"type":"lab-result","labId":"elf-disassembly-01"'
OUT=$(run_check "$MEMORY_SB" 08049020 call jne 7) && RC=0 || RC=$?
expect_eq "反汇编实验错误调用目标失败" "$RC" "1"
expect_not_contains "$OUT" "反汇编失败反馈不泄露正确目标" "choose_path"

echo "—— 原生 GDB 动态调试实验 ——"
GDB_CASES=$(cat <<'CASES'
gdb-breakpoints-01|elf-disassembly-01|wrong 0|update_cell 22
gdb-register-memory-01|gdb-breakpoints-01|0x49 0x0804b090 0x48|0x48 0x0804b090 0x48
gdb-stack-frames-01|gdb-register-memory-01|gdb_after_update update_cell frame_middle frame_outer 10|gdb_after_update update_cell frame_middle frame_outer 11
gdb-input-crash-01|gdb-stack-frames-01|SIGSEGV crash_from_input 0x41414142|SIGSEGV crash_from_input 0x41414141
CASES
)
while IFS='|' read -r lab_id prerequisite wrong_args correct_args; do
    if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
        HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
        HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
        "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab "$lab_id" 2>&1); then
        RC=0
    else
        RC=$?
    fi
    expect_eq "$prerequisite 完成后可进入 $lab_id" "$RC" "0"
    expect_contains "$OUT" "$lab_id 发出稳定 ready" "\"type\":\"lab-ready\",\"labId\":\"$lab_id\""
    [ -x "$MEMORY_SB/home/guest/gdb-runtime" ] && [ -f "$MEMORY_SB/home/guest/gdb-runtime.c" ] && \
        [ -f "$MEMORY_SB/home/guest/session.gdb" ] \
        && ok "$lab_id 将样本、源码和交互会话复制到 HOME" \
        || bad "$lab_id 的 HOME 调试资产不完整"
    OUT=$(run_check "$MEMORY_SB" $wrong_args) && RC=0 || RC=$?
    expect_eq "$lab_id 错误观察值失败" "$RC" "1"
    expect_not_contains "$OUT" "$lab_id 失败反馈不打印完整正确答案" "$correct_args"
    if OUT=$(run_check "$MEMORY_SB" $correct_args); then RC=0; else RC=$?; fi
    expect_eq "$lab_id 真实 GDB 重放通过" "$RC" "0"
    expect_contains "$OUT" "$lab_id 发出签名结果" "\"type\":\"lab-result\",\"labId\":\"$lab_id\""
done <<< "$GDB_CASES"

echo "—— 外部静态逆向实验 ——"
REVERSE_CASES=$(cat <<'CASES'
rev-strings-xrefs-01|gdb-input-crash-01|0x804a034 stage_gate|0x804a034 stage_report
rev-functions-flow-01|rev-strings-xrefs-01|0x804904e stage_gate 46 jne|0x804904e stage_gate 45 jne
CASES
)
while IFS='|' read -r lab_id prerequisite wrong_args correct_args; do
    if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
        HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
        HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
        "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab "$lab_id" 2>&1); then
        RC=0
    else
        RC=$?
    fi
    expect_eq "$prerequisite 完成后可进入 $lab_id" "$RC" "0"
    expect_contains "$OUT" "$lab_id 发出稳定 ready" "\"type\":\"lab-ready\",\"labId\":\"$lab_id\""
    [ -x "$MEMORY_SB/home/guest/reverse-companion" ] && [ -x "$MEMORY_SB/home/guest/inspect.sh" ] \
        && ok "$lab_id 将样本和终端等价路线复制到 HOME" \
        || bad "$lab_id 的 HOME 静态分析资产不完整"
    OUT=$(run_check "$MEMORY_SB" $wrong_args) && RC=0 || RC=$?
    expect_eq "$lab_id 错误静态事实失败" "$RC" "1"
    expect_not_contains "$OUT" "$lab_id 失败反馈不打印完整正确答案" "$correct_args"
    if OUT=$(run_check "$MEMORY_SB" $correct_args); then RC=0; else RC=$?; fi
    expect_eq "$lab_id 锁定工具重放通过" "$RC" "0"
    expect_contains "$OUT" "$lab_id 发出签名结果" "\"type\":\"lab-result\",\"labId\":\"$lab_id\""
done <<< "$REVERSE_CASES"

echo "—— 栈溢出与 ret2win / 基础 ROP 实验 ——"
PWN_CASES=$(cat <<'CASES'
pwn-overflow-offset-01|rev-functions-flow-01|overflow-offset|b'A'*68+b'BBBB'|b'A'*67+b'BBBB'
pwn-ret2win-01|pwn-overflow-offset-01|ret2win|b'A'*68+p32(0x08049020)|b'A'*68+p32(0xdeadbeef)
pwn-ret2win-args-01|pwn-ret2win-01|ret2win-args|b'A'*68+p32(0x08049020)+p32(0)+p32(0x13572468)+p32(0x24681357)|b'A'*68+p32(0x08049020)+p32(0)+p32(0x24681357)+p32(0x13572468)
rop-gadget-stack-01|pwn-ret2win-args-01|rop-gadget-stack|b'A'*68+p32(0x08049020)+p32(0x4b434154)+p32(0x08049025)+p32(0)|b'A'*68+p32(0x08049020)+p32(0x4b434155)+p32(0x08049025)+p32(0)
rop-register-chain-01|rop-gadget-stack-01|rop-register-chain|b'A'*68+p32(0x08049020)+p32(0x11112222)+p32(0x08049025)+p32(0x33334444)+p32(0x0804902a)|b'A'*68+p32(0x08049020)+p32(0x33334444)+p32(0x08049025)+p32(0x11112222)+p32(0x0804902a)
rop-call-chain-01|rop-register-chain-01|rop-call-chain|b'A'*68+p32(0x08049020)+p32(0x08049030)+p32(0x0804904a)|b'A'*68+p32(0x08049030)+p32(0x08049020)+p32(0x0804904a)
CASES
)
write_pwn_payload() { # state_dir spec
    python3 - "$1" "$2" <<'PY'
import struct
import sys

payload = eval(sys.argv[2], {'A': b'A', 'p32': lambda value: struct.pack('<I', value)})
with open(f"{sys.argv[1]}/payload.bin", 'wb') as stream:
    stream.write(payload)
PY
}
while IFS='|' read -r lab_id prerequisite bin_name correct_spec wrong_spec; do
    [ -n "$lab_id" ] || continue
    if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
        HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
        HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
        "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab "$lab_id" 2>&1); then
        RC=0
    else
        RC=$?
    fi
    expect_eq "$prerequisite 完成后可进入 $lab_id" "$RC" "0"
    expect_contains "$OUT" "$lab_id 发出稳定 ready" "\"type\":\"lab-ready\",\"labId\":\"$lab_id\""
    [ -x "$MEMORY_SB/home/guest/$bin_name" ] \
        && ok "$lab_id 样本已复制到 HOME" \
        || bad "$lab_id 样本未复制到 HOME"
    OUT=$(run_check "$MEMORY_SB") && RC=0 || RC=$?
    expect_eq "$lab_id 缺少 payload 时失败" "$RC" "2"
    expect_contains "$OUT" "$lab_id 给出缺失反馈" "payload file is missing"
    OUT=$(run_check "$MEMORY_SB" "$MEMORY_SB/home/guest/$lab_id/../outside.bin") && RC=0 || RC=$?
    expect_eq "$lab_id 拒绝路径穿越 payload" "$RC" "2"
    expect_contains "$OUT" "$lab_id 给出穿越反馈" "path traversal is not allowed"
    write_pwn_payload "$MEMORY_SB/home/guest/$lab_id" "$wrong_spec"
    OUT=$(run_check "$MEMORY_SB") && RC=0 || RC=$?
    expect_eq "$lab_id 错误 payload 失败" "$RC" "1"
    expect_contains "$OUT" "$lab_id 失败不签发结果" '"type":"error"'
    write_pwn_payload "$MEMORY_SB/home/guest/$lab_id" "$correct_spec"
    if OUT=$(run_check "$MEMORY_SB"); then RC=0; else RC=$?; fi
    expect_eq "$lab_id 真实重放通过" "$RC" "0"
    expect_contains "$OUT" "$lab_id 发出签名结果" "\"type\":\"lab-result\",\"labId\":\"$lab_id\""
    expect_contains "$OUT" "$lab_id 结果带有效签名" \
        "\"sig\":\"$(expected_message_sig "lab-result:$lab_id:passed")\""
    printf '%*s' 513 '' | tr ' ' A > "$MEMORY_SB/home/guest/$lab_id/payload.bin"
    OUT=$(run_check "$MEMORY_SB") && RC=0 || RC=$?
    expect_eq "$lab_id 拒绝超限 payload" "$RC" "2"
    expect_contains "$OUT" "$lab_id 给出超限反馈" "exceeds the 512 byte limit"
    if OUT=$(HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
        HASHTEAM_HTCHECK="$HTCHECK" HASHTEAM_KEY_FILE="$TEST_KEY" \
        HASHTEAM_STATE_DIR="$MEMORY_SB/home/guest/.hashteam" \
        "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab "$lab_id" >/dev/null 2>&1); then
        RC=0
    else
        RC=$?
    fi
    expect_eq "reset-level 后 $lab_id 环境恢复" "$RC" "0"
    write_pwn_payload "$MEMORY_SB/home/guest/$lab_id" "$correct_spec"
    if OUT=$(run_check "$MEMORY_SB"); then RC=0; else RC=$?; fi
    expect_eq "$lab_id 重置后仍可重放通过" "$RC" "0"
done <<< "$PWN_CASES"

echo "—— 受限 payload 教学工具 ——"
for tool_name in p32 hex2bin cyclic cyclic-find payload-run; do
    cp -f "$ROOT/vm/binary-tools/staged/$tool_name" "$STUB/$tool_name"
done
TOOL_OUT=$(PATH="$STUB:$PATH" "$BUSYBOX" sh "$ROOT/vm/binary-tools/staged/cyclic" 16)
expect_eq "VM cyclic 与前端 golden 向量一致" "$TOOL_OUT" "aaaabaaacaaadaaa"
TOOL_OUT=$(PATH="$STUB:$PATH" "$BUSYBOX" sh "$ROOT/vm/binary-tools/staged/cyclic-find" baaa)
expect_eq "VM cyclic-find 定位 ba aa" "$TOOL_OUT" "4"
TOOL_OUT=$(PATH="$STUB:$PATH" "$BUSYBOX" sh "$ROOT/vm/binary-tools/staged/p32" 0x08049020 | "$STUB/od" -An -tx1 | "$STUB/tr" -d ' \n')
expect_eq "VM p32 输出小端地址字节" "$TOOL_OUT" "20900408"
TOOL_OUT=$(PATH="$STUB:$PATH" "$BUSYBOX" sh "$ROOT/vm/binary-tools/staged/hex2bin" 414243 | "$STUB/od" -An -tx1 | "$STUB/tr" -d ' \n')
expect_eq "VM hex2bin 解码连续十六进制" "$TOOL_OUT" "414243"
if PATH="$STUB:$PATH" "$BUSYBOX" sh "$ROOT/vm/binary-tools/staged/p32" 0x100000000 >/dev/null 2>&1; then
    bad "p32 接受了越界数值"
else
    ok "p32 拒绝越界数值"
fi
if PATH="$STUB:$PATH" "$BUSYBOX" sh "$ROOT/vm/binary-tools/staged/hex2bin" zz >/dev/null 2>&1; then
    bad "hex2bin 接受了非十六进制输入"
else
    ok "hex2bin 拒绝非十六进制输入"
fi
if OUT=$(cd "$MEMORY_SB/home/guest" && HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    PWNHUB_LABS_DIR="$PWNHUB_LABS_DIR" \
    "$BUSYBOX" sh "$ROOT/vm/binary-tools/staged/payload-run" not-in-home rop-call-chain-01/payload.bin 2>&1); then
    bad "payload-run 接受了非实验样本"
else
    ok "payload-run 拒绝非实验样本"
fi
if OUT=$(cd "$MEMORY_SB/home/guest" && HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    PWNHUB_LABS_DIR="$PWNHUB_LABS_DIR" \
    "$BUSYBOX" sh "$ROOT/vm/binary-tools/staged/payload-run" rop-call-chain rop-call-chain-01/../payload.bin 2>&1); then
    bad "payload-run 接受了路径穿越"
else
    ok "payload-run 拒绝路径穿越"
fi
if OUT=$(cd "$MEMORY_SB/home/guest" && HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    PWNHUB_LABS_DIR="$PWNHUB_LABS_DIR" \
    "$BUSYBOX" sh "$ROOT/vm/binary-tools/staged/payload-run" rop-call-chain rop-call-chain-01/payload.bin 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "payload-run 重放当前实验 payload" "$RC" "0"
expect_contains "$OUT" "payload-run 输出真实标记" "PwnHub ROP calls complete"
if OUT=$(cd "$MEMORY_SB/home/guest" && HOME="$MEMORY_SB/home/guest" PATH="$STUB:$PATH" \
    PWNHUB_LABS_DIR="$PWNHUB_LABS_DIR" \
    "$BUSYBOX" sh "$ROOT/vm/binary-tools/staged/payload-run" rop-call-chain other.bin 2>&1); then
    bad "payload-run 接受了实验目录外的 payload"
else
    ok "payload-run 拒绝实验目录外的 payload"
fi

if HOME="$LAB_SB/home/guest" PATH="$STUB:$PATH" \
    "$BUSYBOX" sh "$OVERLAY/usr/local/bin/hashteamctl" goto-lab ../escape >/dev/null 2>&1; then
    bad "goto-lab 接受了路径穿越 ID"
else
    ok "goto-lab 拒绝路径穿越 ID"
fi

echo "—— 第 2 关 ——"
sandbox 2
SB="$SB_DIR"
run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-2/init.sh" >/dev/null
if [ -f "$SB/home/guest/.message" ]; then ok "隐藏文件已创建"; else bad "隐藏文件未创建"; fi
if OUT=$(run_check "$SB" dotfile-42); then RC=0; else RC=$?; fi
expect_eq "正确答案通过" "$RC" "0"
if OUT=$(run_check "$SB" "dotfile-42  "); then RC=0; else RC=$?; fi
expect_eq "答案带多余空格仍通过" "$RC" "0"
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
# 旧判题漏洞回归：创建目标路径和空文件、但保留原文件，必须失败。
mkdir -p "$SB/home/guest/inbox/logs" "$SB/home/guest/inbox/scripts" "$SB/home/guest/inbox/secrets"
: > "$SB/home/guest/inbox/logs/app.log"
: > "$SB/home/guest/inbox/scripts/backup.sh"
: > "$SB/home/guest/inbox/scripts/deploy.sh"
: > "$SB/home/guest/inbox/secrets/api.key"
OUT=$(run_check "$SB") && RC=0 || RC=$?
expect_eq "mkdir + touch 不能伪造移动结果" "$RC" "1"
rm -rf "$SB/home/guest/inbox/logs" "$SB/home/guest/inbox/scripts" "$SB/home/guest/inbox/secrets"
(
    cd "$SB/home/guest/inbox"
    mkdir -p logs scripts secrets
    mv app.log logs/
    mv backup.sh deploy.sh scripts/
)
OUT=$(run_check "$SB") && RC=0 || RC=$?
expect_contains "$OUT" "缺文件且原件仍在时报告 2 处" "还有 2 处"
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
# 沙箱 8080 常被平台占用；默认按当前测试进程选择专用高位端口，
# 调用方仍可在并行任务中显式覆盖。
export HASHTEAM_HTTP_PORT="${HASHTEAM_HTTP_PORT:-$((18000 + ($$ % 1000)))}"
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
if OUT=$(run_check "$SB" "  dbg-token-8848 "); then RC=0; else RC=$?; fi
expect_eq "答案带多余空格仍通过" "$RC" "0"
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
export HASHTEAM_SECURE_PORT="${HASHTEAM_SECURE_PORT:-$((20000 + ($$ % 1000)))}"
sandbox 10
SB="$SB_DIR"
run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-10/init.sh" >/dev/null
sleep 1
PORTS=$("$STUB/netstat" -tln)
expect_contains "$PORTS" "初始服务监听所有接口" "0.0.0.0:${HASHTEAM_SECURE_PORT} "
OUT=$(run_check "$SB") && RC=0 || RC=$?
expect_eq "未完成综合状态验证失败" "$RC" "1"
expect_contains "$OUT" "按检查项报告待修复数量" "还有 7 项检查"
cd "$SB/home/guest" && PATH="$STUB:$PATH" "$STUB/sed" -i 's/debug=true/debug=false/' server.conf
OUT=$(run_check "$SB") && RC=0 || RC=$?
expect_contains "$OUT" "只修配置一项仍有多类问题" "还有 6 项检查"
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
# 旧判题漏洞回归：追加重复“安全值”不能掩盖前面的冲突配置。
printf '\ndebug=true\ndebug=false\n' >> "$SB/home/guest/server.conf"
OUT=$(run_check "$SB") && RC=0 || RC=$?
expect_eq "重复配置不能用最后一个安全值绕过" "$RC" "1"
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
port=__PORT__
document_root=__DOCROOT__
max_connections=100
CONF
sed -i \
    -e "s|__PORT__|$HASHTEAM_SECURE_PORT|" \
    -e "s|__DOCROOT__|$SB2/home/guest/www|" \
    "$SB2/home/guest/server.conf"
"$STUB/chmod" u=rw,go= "$SB2/home/guest/server.conf"
PID=$(cat "$SB2/home/guest/.hashteam/level-10-httpd.pid")
"$STUB/kill" "$PID" 2>/dev/null || true
sleep 1
HOME="$SB2/home/guest" PATH="$STUB:$PATH" "$STUB/httpd" -p "127.0.0.1:${HASHTEAM_SECURE_PORT}" -h "$SB2/home/guest/www"
sleep 1
if OUT=$(run_check "$SB2"); then RC=0; else RC=$?; fi
expect_eq "重写文件与符号权限修复同样通过" "$RC" "0"
# 启动参数换序（-h 在前）与相对路径 -h www 也应通过
HASHTEAM_SECURE_PORT=$((HASHTEAM_SECURE_PORT + 1))
export HASHTEAM_SECURE_PORT
sandbox 10
SB3="$SB_DIR"
run_level "$SB3" "$HASHTEAM_LEVELS_DIR/level-10/init.sh" >/dev/null
sleep 1
cd "$SB3/home/guest" && PATH="$STUB:$PATH" "$STUB/sed" -i \
    -e 's/debug=true/debug=false/' \
    -e 's/allow_guest=true/allow_guest=false/' \
    -e 's/listen=0.0.0.0/listen=127.0.0.1/' server.conf
"$STUB/chmod" 600 "$SB3/home/guest/server.conf"
PID=$(cat "$SB3/home/guest/.hashteam/level-10-httpd.pid")
"$STUB/kill" "$PID" 2>/dev/null || true
sleep 1
(cd "$SB3/home/guest" && HOME="$SB3/home/guest" PATH="$STUB:$PATH" \
    "$STUB/httpd" -h "$SB3/home/guest/www" -p "127.0.0.1:${HASHTEAM_SECURE_PORT}")
sleep 1
if OUT=$(run_check "$SB3"); then RC=0; else RC=$?; fi
expect_eq "httpd 参数换序启动同样通过" "$RC" "0"
stop_test_httpd
sleep 1
(cd "$SB3/home/guest" && HOME="$SB3/home/guest" PATH="$STUB:$PATH" \
    "$STUB/httpd" -p "127.0.0.1:${HASHTEAM_SECURE_PORT}" -h www)
sleep 1
if OUT=$(run_check "$SB3"); then RC=0; else RC=$?; fi
expect_eq "相对路径 -h www 启动同样通过" "$RC" "0"
stop_test_httpd

echo "—— 重置幂等（关卡文件被改成只读）——"
# 回归：学生把关卡文件改成只读（如 chmod 444）后，init.sh 的 cat >/cp
# 以 EACCES 失败，set -e 中止导致 reset-level 永久卡死（第 4 关真实事故，
# 报错位置 line 20 cat > deploy.sh）。所有会重建文件的关卡都必须能从
# 无写权限状态恢复：删除不依赖文件自身权限位，只依赖目录可写。
for spec in \
    "1 README" \
    "4 baseline-report.txt deploy.sh secret.txt" \
    "5 auth.log" \
    "6 auth.log" \
    "7 message.b64 secret.bin"; do
    set -- $spec
    lvl=$1; shift
    sandbox "$lvl"
    SB="$SB_DIR"
    run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-$lvl/init.sh" >/dev/null
    for f in "$@"; do "$STUB/chmod" 444 "$SB/home/guest/$f"; done
    if run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-$lvl/init.sh" >/dev/null; then RC=0; else RC=$?; fi
    expect_eq "第 $lvl 关：文件只读（$*）后重置重建成功" "$RC" "0"
    if [ "$lvl" = "4" ]; then
        # 第 4 关还需确认权限位回到「不安全」初始态
        MODE=$("$STUB/stat" -c %a "$SB/home/guest/deploy.sh")
        expect_eq "第 4 关：重置后 deploy.sh 恢复 777" "$MODE" "777"
        MODE=$("$STUB/stat" -c %a "$SB/home/guest/secret.txt")
        expect_eq "第 4 关：重置后 secret.txt 恢复 644" "$MODE" "644"
    fi
done

# 进程关卡：重置同时重建文件并重启服务。
# 第 10 关沿用上方惯例换新端口：其 init 只启动一次 httpd、无重绑重试，
# 复用刚跑过 check（有 wget 连接）的端口会撞上残留 socket 状态导致 bind 失败。
sandbox 8
SB="$SB_DIR"
run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-8/init.sh" >/dev/null
"$STUB/chmod" 444 "$SB/home/guest/incident.txt" "$SB/home/guest/.backdoor/www/index.html"
if run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-8/init.sh" >/dev/null; then RC=0; else RC=$?; fi
expect_eq "第 8 关：文件只读后重置重建成功" "$RC" "0"
sleep 1
PORTS=$("$STUB/netstat" -tln)
expect_contains "$PORTS" "第 8 关：重置后 31337 重新监听" ":31337 "
"$STUB/kill" "$(cat "$SB/home/guest/.backdoor/backdoor.pid")" 2>/dev/null || true

sandbox 9
SB="$SB_DIR"
run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-9/init.sh" >/dev/null
"$STUB/chmod" 444 "$SB/home/guest/www/index.html" "$SB/home/guest/www/robots.txt" \
    "$SB/home/guest/www/debug" "$SB/home/guest/www/backup.txt"
# 宿主机的 pidof 被 stub，重置前先按端口停掉上一轮 httpd（VM 内由 init 自行清理）
stop_test_httpd
sleep 1
if run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-9/init.sh" >/dev/null; then RC=0; else RC=$?; fi
expect_eq "第 9 关：文件只读后重置重建成功" "$RC" "0"
sleep 1
TOKEN=$(cd "$SB/home/guest" && PATH="$STUB:$PATH" "$BUSYBOX" wget -q -O - \
    "http://127.0.0.1:${HASHTEAM_HTTP_PORT}/backup.txt")
expect_contains "$TOKEN" "第 9 关：重置后调试令牌恢复" "dbg-token-8848"
stop_test_httpd

HASHTEAM_SECURE_PORT=$((HASHTEAM_SECURE_PORT + 1))
export HASHTEAM_SECURE_PORT
sandbox 10
SB="$SB_DIR"
run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-10/init.sh" >/dev/null
"$STUB/chmod" 444 "$SB/home/guest/server.conf" "$SB/home/guest/service-runbook.txt" \
    "$SB/home/guest/www/index.html"
# 同第 9 关：pidof 被 stub，先按端口停掉上一轮 httpd（VM 内由 pidof+sleep 覆盖）
stop_test_httpd
sleep 1
if run_level "$SB" "$HASHTEAM_LEVELS_DIR/level-10/init.sh" >/dev/null; then RC=0; else RC=$?; fi
expect_eq "第 10 关：文件只读后重置重建成功" "$RC" "0"
MODE=$("$STUB/stat" -c %a "$SB/home/guest/server.conf")
expect_eq "第 10 关：重置后 server.conf 恢复 664" "$MODE" "664"
stop_test_httpd
sleep 1

echo "—— 分层 help ——"
sandbox 1
SB="$SB_DIR"
HELP_ENV=(
    "HOME=$SB/home/guest"
    "PATH=$STUB:$PATH"
    "HASHTEAM_HELP_FILE=$HASHTEAM_LIB_DIR/help.txt"
)
OUT=$(env "${HELP_ENV[@]}" "$BUSYBOX" sh "$OVERLAY/usr/local/bin/help")
expect_contains "$OUT" "默认 help 显示零基础标题" "HASHTEAM 零基础命令备忘"
expect_contains "$OUT" "默认 help 提醒无输出也可能成功" "很多修改命令成功时没有输出"
expect_contains "$OUT" "默认 help 给出当前关命令" "当前是第 1 关"
HELP_LINES=$(printf '%s\n' "$OUT" | "$STUB/wc" -l)
if [ "$HELP_LINES" -le 30 ]; then
    ok "默认 help 控制在一屏多一点（$HELP_LINES 行）"
else
    bad "默认 help 仍然过长（$HELP_LINES 行）"
fi

OUT=$(env "${HELP_ENV[@]}" "$BUSYBOX" sh "$OVERLAY/usr/local/bin/help" ls)
expect_contains "$OUT" "help ls 只提取 ls 说明" "用途：列出目录内容"
case "$OUT" in
    *"用途：把文本文件内容打印到终端。"*) bad "help ls 混入了 cat 说明" ;;
    *) ok "help ls 在下一个命令前停止" ;;
esac

OUT=$(env "${HELP_ENV[@]}" "$BUSYBOX" sh "$OVERLAY/usr/local/bin/help" all)
expect_contains "$OUT" "help all 仍可查看完整备忘" "文件识别与本地 HTTP"

if OUT=$(env "${HELP_ENV[@]}" "$BUSYBOX" sh "$OVERLAY/usr/local/bin/help" does-not-exist 2>&1); then
    RC=0
else
    RC=$?
fi
expect_eq "未知 help 主题退出码为 2" "$RC" "2"
expect_contains "$OUT" "未知 help 主题给出下一步" "输入 help 查看可查询的命令和主题"

echo "—— 占位命令 ——"
for cmd in man nano python; do
    OUT=$(PATH="$STUB:$PATH" "$BUSYBOX" sh "$OVERLAY/usr/local/bin/$cmd" 2>&1) && RC=0 || RC=$?
    expect_eq "$cmd 退出码为 127" "$RC" "127"
    expect_contains "$OUT" "$cmd 提示输入 help" "输入 help"
done

echo
echo "—— 结果：$PASS 通过，$FAIL 失败 ——"
[ "$FAIL" -eq 0 ]
