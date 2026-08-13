#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CACHE="$ROOT/vm/.cache"
ARCHIVE="$CACHE/gdb-15.1.tar.xz"
SOURCE="$CACHE/gdb-15.1-src"
BUILD="$CACHE/gdb-15.1-build"
OUTPUT="$CACHE/gdb-tools-15.1"
STATIC_SHIM="$ROOT/vm/binary-tools/gdb-static-shim.c"
[ "$#" -eq 0 ] || OUTPUT="$1"

SOURCE_URL='https://ftp.gnu.org/gnu/gdb/gdb-15.1.tar.xz'
SOURCE_SHA256='38254eacd4572134bca9c5a5aa4d4ca564cbbd30c369d881f733fb6b903354f2'
COMPILER_VERSION='i686-linux-gnu-gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0'
COMPILER_SHA256='441d893628701a7e11c5be38d7aa3d295d2c3560dc1a38d441e1626f8e7d7c21'
CXX_VERSION='i686-linux-gnu-g++ (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0'
CXX_SHA256='7ad90e397ba3532ac4a5fa5859de6d238d058937e3b0e3fd4990493c4aa6abfd'
LINKER_VERSION='GNU ld (GNU Binutils for Ubuntu) 2.42'
LINKER_SHA256='6250222e7132f5c7ae8bec570375710fa7b984c00d3a4eea2715d76842e4d972'
EXPECTED_GDB_SHA256='5bed8004d18a154d4358b82c4068c33e7649c02d9cdd9801e8db55dd100ae216'
EXPECTED_PACKAGES='gcc-i686-linux-gnu=4:13.2.0-7ubuntu1;gcc-13-i686-linux-gnu=13.3.0-6ubuntu2~24.04.1cross1;g++-i686-linux-gnu=4:13.2.0-7ubuntu1;g++-13-i686-linux-gnu=13.3.0-6ubuntu2~24.04.1cross1;binutils-i686-linux-gnu=2.42-4ubuntu2.10;libc6-dev-i386-cross=2.39-0ubuntu8cross1;libgcc-13-dev-i386-cross=13.3.0-6ubuntu2~24.04.1cross1;libstdc++-13-dev-i386-cross=13.3.0-6ubuntu2~24.04.1cross1;libgmp-dev:i386=2:6.3.0+dfsg-2ubuntu6.1;libmpfr-dev:i386=4.2.1-1build1.1;libexpat1-dev:i386=2.6.1-2ubuntu0.4;zlib1g-dev:i386=1:1.3.dfsg-3.1ubuntu2.1;libncurses-dev:i386=6.4+20240113-1ubuntu2.1'

for command_name in curl tar xz make sha256sum file dpkg-query \
    i686-linux-gnu-gcc i686-linux-gnu-g++ i686-linux-gnu-ld \
    i686-linux-gnu-strip; do
    command -v "$command_name" >/dev/null 2>&1 || {
        echo "missing build command: $command_name" >&2
        exit 2
    }
done

IFS=';' read -r -a expected_packages <<< "$EXPECTED_PACKAGES"
for package_spec in "${expected_packages[@]}"; do
    package_name="${package_spec%%=*}"
    expected_version="${package_spec#*=}"
    actual_version="$(dpkg-query -W -f='${Version}' "$package_name" 2>/dev/null || true)"
    [ "$actual_version" = "$expected_version" ] || {
        echo "package version mismatch for $package_name: expected $expected_version, got ${actual_version:-missing}" >&2
        exit 1
    }
done

[ "$(LC_ALL=C i686-linux-gnu-gcc --version | sed -n '1p')" = "$COMPILER_VERSION" ] || {
    echo 'C compiler version does not match gdb-15.1.lock' >&2
    exit 1
}
[ "$(LC_ALL=C i686-linux-gnu-g++ --version | sed -n '1p')" = "$CXX_VERSION" ] || {
    echo 'C++ compiler version does not match gdb-15.1.lock' >&2
    exit 1
}
[ "$(LC_ALL=C i686-linux-gnu-ld --version | sed -n '1p')" = "$LINKER_VERSION" ] || {
    echo 'linker version does not match gdb-15.1.lock' >&2
    exit 1
}
printf '%s  %s\n' "$COMPILER_SHA256" "$(command -v i686-linux-gnu-gcc)" | sha256sum -c - >/dev/null
printf '%s  %s\n' "$CXX_SHA256" "$(command -v i686-linux-gnu-g++)" | sha256sum -c - >/dev/null
printf '%s  %s\n' "$LINKER_SHA256" "$(command -v i686-linux-gnu-ld)" | sha256sum -c - >/dev/null

mkdir -p "$CACHE"
if ! printf '%s  %s\n' "$SOURCE_SHA256" "$ARCHIVE" | sha256sum -c - >/dev/null 2>&1; then
    curl -fSL --retry 3 -o "$ARCHIVE.part" "$SOURCE_URL"
    printf '%s  %s\n' "$SOURCE_SHA256" "$ARCHIVE.part" | sha256sum -c -
    mv "$ARCHIVE.part" "$ARCHIVE"
fi

case "$SOURCE:$BUILD:$OUTPUT" in
    "$CACHE"/*:"$CACHE"/*:"$CACHE"/*) ;;
    *) echo 'refusing to clean paths outside vm/.cache' >&2; exit 2 ;;
esac
rm -rf -- "$SOURCE" "$BUILD" "$OUTPUT"
mkdir -p "$SOURCE" "$BUILD" "$OUTPUT"
tar -xJf "$ARCHIVE" -C "$SOURCE" --strip-components=1

jobs="$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '2')"
case "$jobs" in ''|*[!0-9]*) jobs=2 ;; esac
export SOURCE_DATE_EPOCH=0
export LC_ALL=C
export PKG_CONFIG_LIBDIR=/usr/lib/i386-linux-gnu/pkgconfig

(
    cd "$BUILD"
    CC=i686-linux-gnu-gcc \
    CXX=i686-linux-gnu-g++ \
    AR=i686-linux-gnu-ar \
    RANLIB=i686-linux-gnu-ranlib \
    CFLAGS='-Os -ffunction-sections -fdata-sections' \
    CXXFLAGS='-Os -ffunction-sections -fdata-sections' \
    LDFLAGS='-static -Wl,--gc-sections' \
    "$SOURCE/configure" \
        --build=x86_64-linux-gnu \
        --host=i686-linux-gnu \
        --target=i686-linux-gnu \
        --disable-nls \
        --disable-shared \
        --enable-static \
        --disable-werror \
        --disable-binutils \
        --disable-gas \
        --disable-gdbserver \
        --disable-gold \
        --disable-gprofng \
        --disable-ld \
        --disable-libctf \
        --disable-sim \
        --disable-tui \
        --without-babeltrace \
        --without-debuginfod \
        --without-guile \
        --without-intel-pt \
        --without-libunwind-ia64 \
        --without-lzma \
        --without-python \
        --without-zstd \
        --with-expat \
        --with-system-gdbinit=/etc/pwnhub/gdbinit
    make -j"$jobs" MAKEINFO=true all-gdb
)

i686-linux-gnu-gcc -Os -c "$STATIC_SHIM" -o "$BUILD/gdb-static-shim.o"
rm -f -- "$BUILD/gdb/gdb"
make -C "$BUILD/gdb" -j"$jobs" MAKEINFO=true \
    LDFLAGS='-all-static -Wl,--gc-sections' \
    XM_CLIBS="$BUILD/gdb-static-shim.o" \
    gdb

install -m 0755 "$BUILD/gdb/gdb" "$OUTPUT/gdb"
i686-linux-gnu-strip --strip-all --remove-section=.note.gnu.build-id "$OUTPUT/gdb"

description="$(file "$OUTPUT/gdb")"
printf '%s\n' "$description" | grep -Fq 'ELF 32-bit LSB executable, Intel 80386' || {
    echo 'gdb is not an i386 ELF' >&2
    exit 1
}
printf '%s\n' "$description" | grep -Fq 'statically linked' || {
    echo 'gdb is not statically linked' >&2
    exit 1
}
printf '%s\n' "$description" | grep -Fq 'stripped' || {
    echo 'gdb is not stripped' >&2
    exit 1
}

actual_sha256="$(sha256sum "$OUTPUT/gdb" | cut -d' ' -f1)"
if [ "$EXPECTED_GDB_SHA256" != 'TO_BE_LOCKED' ] && [ "$actual_sha256" != "$EXPECTED_GDB_SHA256" ]; then
    echo "gdb hash mismatch: expected $EXPECTED_GDB_SHA256, got $actual_sha256" >&2
    exit 1
fi

"$OUTPUT/gdb" -nx --batch -ex 'show version' | grep -Fq 'GNU gdb (GDB) 15.1'
printf '%s  %s\n' "$actual_sha256" "$OUTPUT/gdb"
