#!/usr/bin/env bash
# 构建 MicroPython htlab 教学解释器(静态 i386,逐字节可重现)。
# 约定与 build-debugger.sh 一致:编译器/链接器/输出哈希全部钉在
# vm/toolchain-source/micropython/toolchain.lock;不一致即失败。
# 产物默认进 vm/.cache/(不进 initramfs);要随 VM 发布时再显式接线。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VARIANT_DIR="$ROOT/vm/toolchain-source/micropython"
LOCK="$VARIANT_DIR/toolchain.lock"
OUTPUT="${1:-$ROOT/vm/binary-tools/prebuilt/python}"
STAGED="$ROOT/vm/binary-tools/staged/python"
CC="${MICROPY_CC:-/opt/32/bin/i686-aosc-linux-gnu-gcc}"
STRIP="${MICROPY_STRIP:-/opt/32/bin/i686-aosc-linux-gnu-strip}"
LD="${MICROPY_LD:-/opt/32/bin/i686-aosc-linux-gnu-ld}"
SRC_CACHE="$ROOT/vm/.cache/micropython-src"
UPSTREAM="https://github.com/micropython/micropython.git"

lock_value() { sed -n "s/^$1=//p" "$LOCK"; }

[ "$(LC_ALL=C "$CC" --version | sed -n '1p')" = "$(lock_value compiler_version)" ] || {
    echo 'micropython compiler version does not match toolchain.lock' >&2
    exit 1
}
printf '%s  %s\n' "$(lock_value compiler_sha256)" "$(command -v "$CC")" | sha256sum -c - >/dev/null
[ "$(LC_ALL=C "$LD" --version | sed -n '1p')" = "$(lock_value linker_version)" ] || {
    echo 'micropython linker version does not match toolchain.lock' >&2
    exit 1
}
printf '%s  %s\n' "$(lock_value linker_sha256)" "$LD" | sha256sum -c - >/dev/null

commit="$(lock_value micropython_commit)"
if [ ! -d "$SRC_CACHE/.git" ]; then
    mkdir -p "$SRC_CACHE"
    git -C "$SRC_CACHE" init -q
    git -C "$SRC_CACHE" remote add origin "$UPSTREAM"
fi
if [ "$(git -C "$SRC_CACHE" rev-parse HEAD 2>/dev/null || true)" != "$commit" ]; then
    git -C "$SRC_CACHE" fetch -q --depth 1 origin "$commit"
    git -C "$SRC_CACHE" checkout -q FETCH_HEAD
fi

# 主机端工具(mpy-cross)用宿主编译器;目标解释器用锁定的 i686 交叉编译器。
env SOURCE_DATE_EPOCH="$(lock_value source_date_epoch)" TZ=UTC \
    make -C "$SRC_CACHE/mpy-cross" -j"$(nproc)"

install -m 0644 "$VARIANT_DIR/mpconfigvariant.h" "$VARIANT_DIR/mpconfigvariant.mk" \
    "$SRC_CACHE/ports/unix/variants/htlab/" 2>/dev/null || {
    mkdir -p "$SRC_CACHE/ports/unix/variants/htlab"
    install -m 0644 "$VARIANT_DIR/mpconfigvariant.h" "$VARIANT_DIR/mpconfigvariant.mk" \
        "$SRC_CACHE/ports/unix/variants/htlab/"
}

env SOURCE_DATE_EPOCH="$(lock_value source_date_epoch)" TZ=UTC \
    make -C "$SRC_CACHE/ports/unix" VARIANT="$(lock_value micropython_variant)" \
        CC="$CC" LDFLAGS_EXTRA="-static -Wl,--build-id=none -Wl,-z,noexecstack -Wl,-z,relro,-z,now" \
        -j"$(nproc)"

mkdir -p "$(dirname "$OUTPUT")"
"$STRIP" "$SRC_CACHE/ports/unix/build-$(lock_value micropython_variant)/micropython" -o "$OUTPUT"
chmod 0755 "$OUTPUT"

actual="$(sha256sum "$OUTPUT" | cut -d ' ' -f 1)"
expected="$(lock_value output_sha256)"
if [ "$expected" != PENDING ] && [ "$actual" != "$expected" ]; then
    echo "micropython output hash mismatch: $actual" >&2
    exit 1
fi
# 默认目标即生产打包源(prebuilt);staged 保存同一字节流的审计副本。
if [ "$OUTPUT" = "$ROOT/vm/binary-tools/prebuilt/python" ]; then
    install -m 0755 "$OUTPUT" "$STAGED"
fi
echo "micropython: $OUTPUT ($actual)"
