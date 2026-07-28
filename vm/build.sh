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
#   KERNEL_VERSION     内核版本（默认 6.12.96）
#   KERNEL_MIRROR      内核源码镜像（默认阿里云，可换成 cdn.kernel.org）
#   DEBIAN_MIRROR      Debian 软件源（默认 deb.debian.org）
#   BUSYBOX_DEB        busybox-static 包名（默认 1.38.0-3 i386）
#   BUSYBOX_CROSS_COMPILE
#                      SUID BusyBox 交叉编译器前缀（默认 /opt/32/bin/i686-aosc-linux-gnu-）
#   SOURCE_DATE_EPOCH  SUID BusyBox 可复现构建时间戳（默认 0）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/vm/.cache"
OVERLAY="$ROOT/vm/rootfs-overlay"
OUT_VM="$ROOT/public/vm"
OUT_V86="$ROOT/public/v86"

KERNEL_VERSION="${KERNEL_VERSION:-6.12.96}"
KERNEL_MIRROR="${KERNEL_MIRROR:-https://mirrors.aliyun.com/linux-kernel}"
DEBIAN_MIRROR="${DEBIAN_MIRROR:-http://deb.debian.org/debian}"
BUSYBOX_DEB="${BUSYBOX_DEB:-busybox-static_1.38.0-3_i386.deb}"
SEABIOS_DEB="${SEABIOS_DEB:-seabios_1.16.3-2_all.deb}"
BUSYBOX_VERSION="1.38.0"
BUSYBOX_SOURCE_SHA256="34f9ea6ff8636f2c9241153b9114eefa9e65674a45318ae1ef95bb5f31c53bb2"
BUSYBOX_CROSS_COMPILE="${BUSYBOX_CROSS_COMPILE:-/opt/32/bin/i686-aosc-linux-gnu-}"
BUSYBOX_SUID_CONFIG="$ROOT/vm/busybox-suid.config"
BUSYBOX_BUILD_EPOCH="${SOURCE_DATE_EPOCH:-0}"

SKIP_KERNEL=0
[ "${1:-}" = "--skip-kernel" ] && SKIP_KERNEL=1

node "$ROOT/scripts/validate-challenges.mjs"

mkdir -p "$WORK" "$OUT_VM" "$OUT_V86/bios"
cd "$WORK"

log() { echo "==> $*"; }

# ---------- 1. busybox 静态用户态 ----------
if [ ! -f "$WORK/busybox" ]; then
    log "下载 busybox-static（i386，静态链接，GPLv2）"
    curl -fSL --retry 3 -o busybox.deb "$DEBIAN_MIRROR/pool/main/b/busybox/$BUSYBOX_DEB"
    rm -rf busybox-pkg && dpkg-deb -x busybox.deb busybox-pkg
    cp busybox-pkg/usr/bin/busybox "$WORK/busybox"
else
    log "复用缓存的 busybox"
fi

# ---------- 1b. 最小 SUID busybox（严格仅含 su/passwd）----------
BUSYBOX_SUID="$WORK/busybox-suid"
BUSYBOX_SOURCE_ARCHIVE="$WORK/busybox-$BUSYBOX_VERSION.tar.bz2"

[ -f "$BUSYBOX_SUID_CONFIG" ] || {
    echo "错误：缺少 $BUSYBOX_SUID_CONFIG" >&2
    exit 1
}
command -v "${BUSYBOX_CROSS_COMPILE}gcc" >/dev/null 2>&1 || {
    echo "错误：找不到 ${BUSYBOX_CROSS_COMPILE}gcc；请设置 BUSYBOX_CROSS_COMPILE" >&2
    exit 1
}

if ! printf '%s  %s\n' "$BUSYBOX_SOURCE_SHA256" "$BUSYBOX_SOURCE_ARCHIVE" \
    | sha256sum -c - >/dev/null 2>&1; then
    log "下载并校验 busybox 源码 $BUSYBOX_VERSION"
    _busybox_download="$(mktemp "$WORK/busybox-source.XXXXXX")"
    trap 'rm -f "$_busybox_download"' EXIT
    curl -fSL --retry 3 -o "$_busybox_download" \
        "https://busybox.net/downloads/busybox-$BUSYBOX_VERSION.tar.bz2"
    printf '%s  %s\n' "$BUSYBOX_SOURCE_SHA256" "$_busybox_download" | sha256sum -c -
    mv "$_busybox_download" "$BUSYBOX_SOURCE_ARCHIVE"
    trap - EXIT
fi

_busybox_build="$(mktemp -d "$WORK/busybox-suid-build.XXXXXX")"
trap 'rm -rf "$_busybox_build"' EXIT
tar -xf "$BUSYBOX_SOURCE_ARCHIVE" -C "$_busybox_build" --strip-components=1

log "配置并编译最小 SUID busybox（仅 su + passwd）"
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

_suid_applets="$("$_busybox_build/busybox" --list)"
if [ "$_suid_applets" != "$(printf 'passwd\nsu')" ]; then
    echo "错误：SUID busybox applet 白名单不匹配：" >&2
    printf '%s\n' "$_suid_applets" >&2
    exit 1
fi
cp "$_busybox_build/busybox" "$BUSYBOX_SUID"
rm -rf "$_busybox_build"
trap - EXIT

# ---------- 2. 定制 32 位内核 ----------
if [ "$SKIP_KERNEL" -eq 0 ]; then
    if [ ! -d "linux-$KERNEL_VERSION" ]; then
        log "下载内核源码 linux-$KERNEL_VERSION"
        curl -fSL --retry 3 -C - -o "linux-$KERNEL_VERSION.tar.xz" \
            "$KERNEL_MIRROR/v6.x/linux-$KERNEL_VERSION.tar.xz"
        tar -xf "linux-$KERNEL_VERSION.tar.xz"
    fi
    cd "linux-$KERNEL_VERSION"
    log "生成 tinyconfig 并启用实验所需的最小特性集"
    make ARCH=i386 tinyconfig
    scripts/config \
        --enable BLK_DEV_INITRD --enable RD_GZIP \
        --enable DEVTMPFS --enable PROC_FS --enable SYSFS --enable TMPFS \
        --enable TTY --enable SERIAL_8250 --enable SERIAL_8250_CONSOLE \
        --enable PRINTK --enable UNIX --enable NET --enable INET \
        --enable BINFMT_ELF --enable BINFMT_SCRIPT --enable SHMEM \
        --enable EPOLL --enable FUTEX --enable EVENTFD --enable TIMERFD \
        --enable SIGNALFD --enable INOTIFY_USER --enable PROC_SYSCTL \
        --enable SYSVIPC --enable MULTIUSER \
        --enable IKCONFIG --enable IKCONFIG_PROC \
        --enable PRINTK_TIME \
        --enable MODULES \
        --enable PTRACE --enable CHECKPOINT_RESTORE \
        --enable COMMONCAP --enable SECURITYFS
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
log "打包 initramfs（busybox + SUID busybox + 关卡系统）"
python3 "$ROOT/scripts/pack-initramfs.py" \
    --root "$OVERLAY" --busybox "$WORK/busybox" --busybox-suid "$BUSYBOX_SUID" \
    --out "$OUT_VM/rootfs.cpio.gz"

# ---------- 4. v86 运行时与 BIOS ----------
log "拷贝 v86 运行时"
[ -d "$ROOT/node_modules/v86" ] || { echo "错误：请先 pnpm install" >&2; exit 1; }
cp "$ROOT/node_modules/v86/build/libv86.js" "$OUT_V86/"
cp "$ROOT/node_modules/v86/build/v86.wasm" "$OUT_V86/"
cp "$ROOT/node_modules/v86/build/v86-fallback.wasm" "$OUT_V86/"

if [ ! -f "$OUT_V86/bios/seabios-256k.bin" ]; then
    log "下载 SeaBIOS（LGPLv3）"
    curl -fSL --retry 3 -o seabios.deb "$DEBIAN_MIRROR/pool/main/s/seabios/$SEABIOS_DEB"
    rm -rf seabios-pkg && dpkg-deb -x seabios.deb seabios-pkg
    cp seabios-pkg/usr/share/seabios/bios-256k.bin "$OUT_V86/bios/seabios-256k.bin"
fi

log "构建完成，产物体积："
du -h "$OUT_VM/bzImage" "$OUT_VM/rootfs.cpio.gz" \
      "$OUT_V86/libv86.js" "$OUT_V86/v86.wasm" "$OUT_V86/bios/seabios-256k.bin" \
    | sort -k2
