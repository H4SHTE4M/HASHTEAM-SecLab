#!/usr/bin/env bash
# 构建浏览器内 Linux 虚拟机所需的全部静态资源：
#   1. 32 位精简 Linux 内核（bzImage，基于 tinyconfig 定制，无网卡驱动；
#      额外开启 dmesg 时间戳、可加载模块、ptrace 调试、capabilities 提权，
#      为调试/逆向/提权方向的关卡预留能力）
#   2. busybox 静态用户态 + 关卡系统 → initramfs（rootfs.cpio.gz）
#   3. v86 运行时（libv86.js / v86.wasm）与 SeaBIOS
#
# 产物输出到 public/v86/ 与 public/vm/，全部可由纯静态托管提供。
#
# 用法：
#   vm/build.sh                 完整构建（内核 + initramfs + v86 资源）
#   vm/build.sh --skip-kernel   只重建 initramfs 与资源（复用已有内核）
#
# 环境变量（均有默认值）：
#   KERNEL_VERSION     内核版本（默认 6.12.98）
#   KERNEL_MIRROR      内核源码镜像（默认阿里云，可换成 cdn.kernel.org）
#   DEBIAN_MIRROR      Debian 软件源（默认 https://deb.debian.org/debian）
#   BUSYBOX_DEB        busybox-static 包名（默认 1.38.0-3 i386）
#   BUSYBOX_DEB_SHA256 对应 Debian 包 SHA-256
#   KERNEL_SOURCE_SHA256
#                      对应 Linux 源码包 SHA-256
#   SEABIOS_DEB_SHA256 对应 SeaBIOS Debian 包 SHA-256
#   BUSYBOX_CROSS_COMPILE
#                      SUID BusyBox 交叉编译器前缀（默认 /opt/32/bin/i686-aosc-linux-gnu-）
#                      精确版本及工具哈希锁定在 vm/suid-toolchain.lock
#   HTCHECK_CC         htcheck i386 交叉编译器（默认 i686-linux-gnu-gcc）
#   HTCHECK_LD         htcheck i386 链接器（默认 i686-linux-gnu-ld）
#   SOURCE_DATE_EPOCH  BusyBox 与内核的可复现构建时间戳（默认 0）
#   REBUILD_SUID       设为 1 时忽略已校验的 SUID BusyBox 缓存（默认复用）
#   REBUILD_HTCHECK    设为 1 时忽略已校验的 htcheck 缓存（默认复用）
#   REBUILD_DEBUGGER   设为 1 时重编译原生 i386 debugger（默认复用）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/vm/.cache"
OVERLAY="$ROOT/vm/rootfs-overlay"
OUT_VM="$ROOT/public/vm"
OUT_V86="$ROOT/public/v86"

KERNEL_VERSION="${KERNEL_VERSION:-6.12.98}"
KERNEL_MIRROR="${KERNEL_MIRROR:-https://mirrors.aliyun.com/linux-kernel}"
DEBIAN_MIRROR="${DEBIAN_MIRROR:-https://deb.debian.org/debian}"
BUSYBOX_DEB="${BUSYBOX_DEB:-busybox-static_1.38.0-3_i386.deb}"
SEABIOS_DEB="${SEABIOS_DEB:-seabios_1.16.3-2_all.deb}"
BUSYBOX_DEB_SHA256="${BUSYBOX_DEB_SHA256:-22e5889c9e8d1c44f928860873e1d63265017e4c5dc93c79520f5d398f065659}"
BUSYBOX_GLIBC_BUILT_USING="glibc (= 2.42-17)"
KERNEL_SOURCE_SHA256="${KERNEL_SOURCE_SHA256:-a62b6a2d207ff72510e5f47156b7078e1e71797357412411b8e4fff97fc8f4c7}"
SEABIOS_DEB_SHA256="${SEABIOS_DEB_SHA256:-2b590534250b940f43222eeab9a8f57f337a9d9a73fc412a43ab8cd07a7e56f6}"
BUSYBOX_VERSION="1.38.0"
BUSYBOX_SOURCE_SHA256="34f9ea6ff8636f2c9241153b9114eefa9e65674a45318ae1ef95bb5f31c53bb2"
BUSYBOX_CROSS_COMPILE="${BUSYBOX_CROSS_COMPILE:-/opt/32/bin/i686-aosc-linux-gnu-}"
HTCHECK_CC="${HTCHECK_CC:-/opt/32/bin/i686-aosc-linux-gnu-gcc}"
HTCHECK_LD="${HTCHECK_LD:-/opt/32/bin/i686-aosc-linux-gnu-ld}"
BUSYBOX_CHECKSUM="$ROOT/vm/busybox.sha256"
BUSYBOX_SUID_CONFIG="$ROOT/vm/busybox-suid.config"
BUSYBOX_SUID_CHECKSUM="$ROOT/vm/busybox-suid.sha256"
BUSYBOX_TOOLCHAIN_LOCK="$ROOT/vm/suid-toolchain.lock"
AOSC_GLIBC_RECIPE="$ROOT/vm/toolchain-source/aosc-glibc32"
HTCHECK_TOOLCHAIN_LOCK="$ROOT/vm/toolchain-source/htcheck/toolchain.lock"
DEBUGGER_TOOLCHAIN_LOCK="$ROOT/vm/toolchain-source/debugger/toolchain.lock"
BUSYBOX_BUILD_EPOCH="${SOURCE_DATE_EPOCH:-0}"
export KBUILD_BUILD_USER="${KBUILD_BUILD_USER:-hashteam}"
export KBUILD_BUILD_HOST="${KBUILD_BUILD_HOST:-reproducible-builder}"
if [ -z "${KBUILD_BUILD_TIMESTAMP:-}" ]; then
    KBUILD_BUILD_TIMESTAMP="$(LC_ALL=C date -u -d "@${SOURCE_DATE_EPOCH:-0}")"
fi
export KBUILD_BUILD_TIMESTAMP
export KBUILD_BUILD_VERSION="${KBUILD_BUILD_VERSION:-1}"

SKIP_KERNEL=0
[ "${1:-}" = "--skip-kernel" ] && SKIP_KERNEL=1

node "$ROOT/scripts/validate-challenges.mjs"

mkdir -p "$WORK" "$OUT_VM" "$OUT_V86/bios"
cd "$WORK"

log() { echo "==> $*"; }

verify_sha256() {
    local expected="$1"
    local file="$2"
    printf '%s  %s\n' "$expected" "$file" | sha256sum -c -
}

download_verified() {
    local url="$1"
    local output="$2"
    local expected="$3"
    local download
    download="$(mktemp "$WORK/download.XXXXXX")"
    curl -fSL --retry 3 -o "$download" "$url"
    verify_sha256 "$expected" "$download"
    mv "$download" "$output"
}

# ---------- 1. busybox 静态用户态 ----------
[ -f "$BUSYBOX_CHECKSUM" ] || {
    echo "错误：缺少 $BUSYBOX_CHECKSUM" >&2
    exit 1
}
if ! verify_sha256 "$BUSYBOX_DEB_SHA256" "$WORK/busybox.deb" >/dev/null 2>&1; then
    log "下载 busybox-static（i386，静态链接，GPLv2）"
    download_verified \
        "$DEBIAN_MIRROR/pool/main/b/busybox/$BUSYBOX_DEB" \
        "$WORK/busybox.deb" \
        "$BUSYBOX_DEB_SHA256"
fi
verify_sha256 "$BUSYBOX_DEB_SHA256" "$WORK/busybox.deb" >/dev/null
rm -rf busybox-pkg
dpkg-deb -x busybox.deb busybox-pkg
_busybox_built_using="$(dpkg-deb -f busybox.deb Built-Using)"
[ "$_busybox_built_using" = "$BUSYBOX_GLIBC_BUILT_USING" ] || {
    echo "错误：busybox-static 的 Built-Using 已变化：$_busybox_built_using" >&2
    echo "必须先更新并审查对应 glibc 源码归档" >&2
    exit 1
}
cp busybox-pkg/usr/bin/busybox "$WORK/busybox"
_expected_busybox_sha256="$(awk 'NF >= 2 && $2 == "bin/busybox" { print $1 }' "$BUSYBOX_CHECKSUM")"
[ -n "$_expected_busybox_sha256" ] || {
    echo "错误：普通 BusyBox 校验文件格式无效" >&2
    exit 1
}
verify_sha256 "$_expected_busybox_sha256" "$WORK/busybox" >/dev/null || {
    echo "错误：普通 BusyBox 与审核锁定值不一致" >&2
    exit 1
}

# ---------- 1b. 最小 SUID busybox（严格仅含 su）----------
BUSYBOX_SUID="$WORK/busybox-suid"
BUSYBOX_SOURCE_ARCHIVE="$WORK/busybox-$BUSYBOX_VERSION.tar.bz2"

_expected_suid_sha256="$(awk 'NF >= 2 && $2 == "bin/busybox-suid" { print $1 }' "$BUSYBOX_SUID_CHECKSUM")"
[ -n "$_expected_suid_sha256" ] || {
    echo "错误：SUID helper 校验文件格式无效" >&2
    exit 1
}
_reuse_suid_cache=0
if [ "${REBUILD_SUID:-0}" != 1 ] && [ -f "$BUSYBOX_SUID" ] &&
    verify_sha256 "$_expected_suid_sha256" "$BUSYBOX_SUID" >/dev/null 2>&1; then
    _reuse_suid_cache=1
    log "复用已审核的 SUID BusyBox 缓存"
fi

if [ "$_reuse_suid_cache" -eq 0 ]; then

[ -f "$BUSYBOX_SUID_CONFIG" ] || {
    echo "错误：缺少 $BUSYBOX_SUID_CONFIG" >&2
    exit 1
}
[ -f "$BUSYBOX_SUID_CHECKSUM" ] || {
    echo "错误：缺少 $BUSYBOX_SUID_CHECKSUM" >&2
    exit 1
}
command -v "${BUSYBOX_CROSS_COMPILE}gcc" >/dev/null 2>&1 || {
    echo "错误：找不到 ${BUSYBOX_CROSS_COMPILE}gcc；请设置 BUSYBOX_CROSS_COMPILE" >&2
    exit 1
}
[ -f "$BUSYBOX_TOOLCHAIN_LOCK" ] || {
    echo "错误：缺少 $BUSYBOX_TOOLCHAIN_LOCK" >&2
    exit 1
}
[ -f "$AOSC_GLIBC_RECIPE/SHA256SUMS" ] || {
    echo "错误：缺少 AOSC glibc+32 对应源码校验清单" >&2
    exit 1
}
(
    cd "$AOSC_GLIBC_RECIPE"
    sha256sum -c SHA256SUMS >/dev/null
) || {
    echo "错误：AOSC glibc+32 对应源码配方与审核值不一致" >&2
    exit 1
}

toolchain_lock_value() {
    local key="$1"
    sed -n "s/^${key}=//p" "$BUSYBOX_TOOLCHAIN_LOCK"
}

_expected_gcc_version="$(toolchain_lock_value gcc_version)"
_expected_ld_version="$(toolchain_lock_value ld_version)"
_expected_gcc_sha256="$(toolchain_lock_value gcc_sha256)"
_expected_cc1_sha256="$(toolchain_lock_value cc1_sha256)"
_expected_ld_sha256="$(toolchain_lock_value ld_sha256)"
_actual_gcc_version="$(LC_ALL=C "${BUSYBOX_CROSS_COMPILE}gcc" --version | sed -n '1p')"
_actual_ld_version="$(LC_ALL=C "${BUSYBOX_CROSS_COMPILE}ld" --version | sed -n '1p')"
_cc1_path="$("${BUSYBOX_CROSS_COMPILE}gcc" -print-prog-name=cc1)"

[ "$_actual_gcc_version" = "$_expected_gcc_version" ] &&
[ "$_actual_ld_version" = "$_expected_ld_version" ] &&
[ -f "$_cc1_path" ] || {
    echo "错误：SUID BusyBox 工具链版本与 vm/suid-toolchain.lock 不一致" >&2
    echo "  GCC: $_actual_gcc_version" >&2
    echo "  LD:  $_actual_ld_version" >&2
    exit 1
}
verify_sha256 "$_expected_gcc_sha256" "${BUSYBOX_CROSS_COMPILE}gcc" >/dev/null
verify_sha256 "$_expected_cc1_sha256" "$_cc1_path" >/dev/null
verify_sha256 "$_expected_ld_sha256" "${BUSYBOX_CROSS_COMPILE}ld" >/dev/null

for _package_check in \
    "gcc+32:gcc_package_version" \
    "binutils+32:binutils_package_version" \
    "glibc+32:glibc_package_version" \
    "linux+api+32:linux_api_package_version"; do
    _package_name="${_package_check%%:*}"
    _lock_key="${_package_check#*:}"
    _actual_package_version="$(dpkg-query -W -f='${Version}' "$_package_name")"
    [ "$_actual_package_version" = "$(toolchain_lock_value "$_lock_key")" ] || {
        echo "错误：$_package_name 版本与 vm/suid-toolchain.lock 不一致" >&2
        exit 1
    }
done
for _metadata_check in \
    "X-AOSC-Commit:glibc_aosc_commit" \
    "X-AOSC-ACBS-Version:glibc_acbs_version"; do
    _metadata_field="${_metadata_check%%:*}"
    _lock_key="${_metadata_check#*:}"
    _actual_metadata="$(dpkg-query -W -f="\${${_metadata_field}}" glibc+32)"
    [ "$_actual_metadata" = "$(toolchain_lock_value "$_lock_key")" ] || {
        echo "错误：glibc+32 的 $_metadata_field 与审核记录不一致" >&2
        exit 1
    }
done
log "SUID 工具链锁定校验通过：$(toolchain_lock_value packages)"

if ! printf '%s  %s\n' "$BUSYBOX_SOURCE_SHA256" "$BUSYBOX_SOURCE_ARCHIVE" \
    | sha256sum -c - >/dev/null 2>&1; then
    log "下载并校验 busybox 源码 $BUSYBOX_VERSION"
    download_verified \
        "https://busybox.net/downloads/busybox-$BUSYBOX_VERSION.tar.bz2" \
        "$BUSYBOX_SOURCE_ARCHIVE" \
        "$BUSYBOX_SOURCE_SHA256"
fi

_busybox_build="$(mktemp -d "$WORK/busybox-suid-build.XXXXXX")"
trap 'rm -rf "$_busybox_build"' EXIT
tar -xf "$BUSYBOX_SOURCE_ARCHIVE" -C "$_busybox_build" --strip-components=1

log "配置并编译最小 SUID busybox（仅 su）"
env SOURCE_DATE_EPOCH="$BUSYBOX_BUILD_EPOCH" TZ=UTC \
    make -C "$_busybox_build" allnoconfig >/dev/null
while IFS= read -r _config_line; do
    case "$_config_line" in
        CONFIG_*=*)
            _config_key="${_config_line%%=*}"
            sed -i \
                -e "s|^${_config_key}=.*$|${_config_line}|" \
                -e "s|^# ${_config_key} is not set$|${_config_line}|" \
                "$_busybox_build/.config"
            ;;
        '# CONFIG_'*' is not set')
            _config_key="${_config_line#\# }"
            _config_key="${_config_key% is not set}"
            sed -i \
                -e "s|^${_config_key}=.*$|${_config_line}|" \
                -e "s|^# ${_config_key} is not set$|${_config_line}|" \
                "$_busybox_build/.config"
            ;;
    esac
done < "$BUSYBOX_SUID_CONFIG"
env SOURCE_DATE_EPOCH="$BUSYBOX_BUILD_EPOCH" TZ=UTC \
    make -C "$_busybox_build" oldconfig </dev/null >/dev/null
while IFS= read -r _config_line; do
    case "$_config_line" in
        CONFIG_*=*|'# CONFIG_'*' is not set')
            grep -qxF "$_config_line" "$_busybox_build/.config" || {
                echo "错误：BusyBox 配置未生效：$_config_line" >&2
                exit 1
            }
            ;;
    esac
done < "$BUSYBOX_SUID_CONFIG"
env SOURCE_DATE_EPOCH="$BUSYBOX_BUILD_EPOCH" TZ=UTC \
    make -C "$_busybox_build" -j"$(nproc)" \
        CROSS_COMPILE="$BUSYBOX_CROSS_COMPILE" >/dev/null

_suid_applets="$(
    sed -n 's/^#define APPLET_NO_\([^ ]*\).*/\1/p' \
        "$_busybox_build/include/applet_tables.h" |
        LC_ALL=C sort
)"
if [ "$_suid_applets" != "su" ]; then
    echo "错误：SUID busybox applet 白名单不匹配：" >&2
    printf '%s\n' "$_suid_applets" >&2
    exit 1
fi
cp "$_busybox_build/busybox" "$BUSYBOX_SUID"
verify_sha256 "$_expected_suid_sha256" "$BUSYBOX_SUID" >/dev/null || {
    echo "错误：SUID helper 与审核锁定值不一致；请先审查工具链/配置变化，再更新校验值" >&2
    exit 1
}
rm -rf "$_busybox_build"
trap - EXIT
fi

# ---------- 1c. SUID 签名评分检查器 htcheck ----------
# 源码和独立的 i386 工具链/产物锁在 vm/toolchain-source/htcheck/。
HTCHECK_SOURCE="$ROOT/vm/toolchain-source/htcheck/htcheck.c"
htcheck_lock_value() {
    local key="$1"
    sed -n "s/^${key}=//p" "$HTCHECK_TOOLCHAIN_LOCK"
}

[ -f "$HTCHECK_TOOLCHAIN_LOCK" ] || {
    echo "错误：缺少 $HTCHECK_TOOLCHAIN_LOCK" >&2
    exit 1
}
_expected_htcheck_sha256="$(htcheck_lock_value output_sha256)"
[ -n "$_expected_htcheck_sha256" ] || {
    echo "错误：htcheck 输出校验值缺失" >&2
    exit 1
}
_reuse_htcheck_cache=0
if [ "${REBUILD_HTCHECK:-0}" != 1 ] && [ -f "$WORK/htcheck" ] &&
    verify_sha256 "$_expected_htcheck_sha256" "$WORK/htcheck" >/dev/null 2>&1; then
    _reuse_htcheck_cache=1
    log "复用已审核的 htcheck 缓存"
fi

if [ "$_reuse_htcheck_cache" -eq 0 ]; then
[ -f "$HTCHECK_SOURCE" ] || {
    echo "错误：缺少 $HTCHECK_SOURCE" >&2
    exit 1
}
command -v "$HTCHECK_CC" >/dev/null 2>&1 || {
    echo "错误：找不到 htcheck 编译器 $HTCHECK_CC" >&2
    exit 1
}
command -v "$HTCHECK_LD" >/dev/null 2>&1 || {
    echo "错误：找不到 htcheck 链接器 $HTCHECK_LD" >&2
    exit 1
}

_htcheck_cc_path="$(command -v "$HTCHECK_CC")"
_htcheck_ld_path="$(command -v "$HTCHECK_LD")"
_actual_htcheck_cc_version="$(LC_ALL=C "$HTCHECK_CC" --version | sed -n '1p')"
_actual_htcheck_ld_version="$(LC_ALL=C "$HTCHECK_LD" --version | sed -n '1p')"
[ "$_actual_htcheck_cc_version" = "$(htcheck_lock_value compiler_version)" ] &&
[ "$_actual_htcheck_ld_version" = "$(htcheck_lock_value linker_version)" ] || {
    echo "错误：htcheck 工具链版本与锁定值不一致" >&2
    echo "  GCC: $_actual_htcheck_cc_version" >&2
    echo "  LD:  $_actual_htcheck_ld_version" >&2
    exit 1
}
verify_sha256 "$(htcheck_lock_value compiler_sha256)" "$_htcheck_cc_path" >/dev/null
verify_sha256 "$(htcheck_lock_value linker_sha256)" "$_htcheck_ld_path" >/dev/null

log "编译 SUID 签名评分检查器 htcheck（i386 静态）"
env SOURCE_DATE_EPOCH="$BUSYBOX_BUILD_EPOCH" TZ=UTC \
    "$HTCHECK_CC" -m32 -static -Os -Wall -Wextra -Werror \
        -Wl,--build-id=none -Wl,-z,noexecstack -Wl,-z,relro,-z,now \
        -o "$WORK/htcheck" "$HTCHECK_SOURCE"
verify_sha256 "$_expected_htcheck_sha256" "$WORK/htcheck" >/dev/null || {
    echo "错误：htcheck 产物与审核锁定值不一致" >&2
    exit 1
}
_htcheck_machine="$(LC_ALL=C readelf -h "$WORK/htcheck" | sed -n 's/^.*Machine:[[:space:]]*//p')"
[ "$_htcheck_machine" = "Intel 80386" ] || {
    echo "错误：htcheck 不是 i386 可执行文件：$_htcheck_machine" >&2
    exit 1
}
LC_ALL=C readelf -l "$WORK/htcheck" | grep -q 'INTERP' && {
    echo "错误：htcheck 不是静态链接（含 INTERP 段）" >&2
    exit 1
}
LC_ALL=C readelf -l "$WORK/htcheck" | grep -Eq 'GNU_STACK[^R]*RW ' || {
    echo "错误：htcheck 栈不是非可执行" >&2
    exit 1
}
fi

# ---------- 1d. 原生 i386 ptrace debugger ----------
DEBUGGER_OUTPUT="$WORK/debugger"
_expected_debugger_sha256="$(sed -n 's/^output_sha256=//p' "$DEBUGGER_TOOLCHAIN_LOCK")"
_reuse_debugger_cache=0
if [ "${REBUILD_DEBUGGER:-0}" != 1 ] && [ -f "$DEBUGGER_OUTPUT" ] &&
    verify_sha256 "$_expected_debugger_sha256" "$DEBUGGER_OUTPUT" >/dev/null 2>&1; then
    _reuse_debugger_cache=1
    log "复用已审核的 debugger 缓存"
fi
if [ "$_reuse_debugger_cache" -eq 0 ]; then
    bash "$ROOT/vm/binary-tools/build-debugger.sh" "$DEBUGGER_OUTPUT"
fi
verify_sha256 "$_expected_debugger_sha256" "$DEBUGGER_OUTPUT" >/dev/null

# ---------- 2. 定制 32 位内核 ----------
if [ "$SKIP_KERNEL" -eq 0 ]; then
    if ! verify_sha256 "$KERNEL_SOURCE_SHA256" "linux-$KERNEL_VERSION.tar.xz" >/dev/null 2>&1; then
        log "下载内核源码 linux-$KERNEL_VERSION"
        download_verified \
            "$KERNEL_MIRROR/v6.x/linux-$KERNEL_VERSION.tar.xz" \
            "linux-$KERNEL_VERSION.tar.xz" \
            "$KERNEL_SOURCE_SHA256"
    fi
    verify_sha256 "$KERNEL_SOURCE_SHA256" "linux-$KERNEL_VERSION.tar.xz" >/dev/null
    rm -rf "linux-$KERNEL_VERSION"
    tar -xf "linux-$KERNEL_VERSION.tar.xz"
    cd "linux-$KERNEL_VERSION"
    log "生成 tinyconfig 并启用实验所需的最小特性集"
    make ARCH=i386 tinyconfig
    scripts/config \
        --enable BLK_DEV_INITRD --enable RD_GZIP \
        --enable DEVTMPFS --enable PROC_FS --enable SYSFS --enable TMPFS \
        --enable TTY --enable SERIAL_8250 --enable SERIAL_8250_CONSOLE \
        --enable PRINTK --enable UNIX --enable NET --enable INET \
        --disable IPV6 \
        --enable BINFMT_ELF --enable BINFMT_SCRIPT --enable SHMEM \
        --enable EPOLL --enable FUTEX --enable EVENTFD --enable TIMERFD \
        --enable SIGNALFD --enable INOTIFY_USER --enable PROC_SYSCTL \
        --enable SYSVIPC --enable MULTIUSER --enable COMPAT_32BIT_TIME \
        --enable IKCONFIG --enable IKCONFIG_PROC \
        --enable PRINTK_TIME \
        --enable MODULES \
        --enable PTRACE --enable CHECKPOINT_RESTORE \
        --enable COMMONCAP --enable SECURITY --enable SECURITY_YAMA \
        --enable SECURITYFS
    make ARCH=i386 olddefconfig
    log "编译内核（需要 gcc make flex bison bc，约 5-15 分钟）"
    make ARCH=i386 -j"$(nproc)" bzImage
    cp arch/x86/boot/bzImage "$OUT_VM/bzImage"
    cd "$WORK"
else
    log "跳过内核构建（--skip-kernel）"
    [ -f "$OUT_VM/bzImage" ] || { echo "错误：$OUT_VM/bzImage 不存在" >&2; exit 1; }
fi

# ---------- 3. 打包 initramfs ----------
log "打包 initramfs（busybox + SUID busybox + htcheck + 关卡系统）"
python3 "$ROOT/scripts/pack-initramfs.py" \
    --root "$OVERLAY" --busybox "$WORK/busybox" --busybox-suid "$BUSYBOX_SUID" \
    --htcheck "$WORK/htcheck" --debugger "$DEBUGGER_OUTPUT" \
    --profile "$ROOT/vm/profiles/production.json" \
    --labs-root "$ROOT/vm/labs/pwnhub" \
    --binary-tools-root "$ROOT/vm/binary-tools/prebuilt" \
    --out "$OUT_VM/rootfs.cpio.gz"

# ---------- 4. v86 运行时与 BIOS ----------
log "拷贝 v86 运行时"
[ -d "$ROOT/node_modules/v86" ] || { echo "错误：请先 pnpm install" >&2; exit 1; }
cp "$ROOT/node_modules/v86/build/libv86.js" "$OUT_V86/"
cp "$ROOT/node_modules/v86/build/v86.wasm" "$OUT_V86/"
cp "$ROOT/node_modules/v86/build/v86-fallback.wasm" "$OUT_V86/"

if ! verify_sha256 "$SEABIOS_DEB_SHA256" "$WORK/seabios.deb" >/dev/null 2>&1; then
    log "下载并校验 SeaBIOS（LGPLv3）"
    download_verified \
        "$DEBIAN_MIRROR/pool/main/s/seabios/$SEABIOS_DEB" \
        "$WORK/seabios.deb" \
        "$SEABIOS_DEB_SHA256"
fi
verify_sha256 "$SEABIOS_DEB_SHA256" "$WORK/seabios.deb" >/dev/null
rm -rf seabios-pkg
dpkg-deb -x seabios.deb seabios-pkg
cp seabios-pkg/usr/share/seabios/bios-256k.bin "$OUT_V86/bios/seabios-256k.bin"

log "构建完成，产物体积："
du -h "$OUT_VM/bzImage" "$OUT_VM/rootfs.cpio.gz" \
      "$OUT_V86/libv86.js" "$OUT_V86/v86.wasm" "$OUT_V86/bios/seabios-256k.bin" \
    | sort -k2
