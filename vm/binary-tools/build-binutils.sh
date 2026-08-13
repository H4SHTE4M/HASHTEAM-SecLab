#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CACHE="$ROOT/vm/.cache"
ARCHIVE="$CACHE/binutils-2.42.tar.xz"
SOURCE="$CACHE/binutils-2.42-src"
BUILD="$CACHE/binutils-2.42-final2-build"
OUTPUT="$CACHE/binutils-tools-2.42"
[ "$#" -eq 0 ] || OUTPUT="$1"

SOURCE_URL='https://ftp.gnu.org/gnu/binutils/binutils-2.42.tar.xz'
SOURCE_SHA256='f6e4d41fd5fc778b06b7891457b3620da5ecea1006c6a4a41ae998109f85a800'
COMPILER_VERSION='i686-linux-gnu-gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0'
COMPILER_SHA256='441d893628701a7e11c5be38d7aa3d295d2c3560dc1a38d441e1626f8e7d7c21'
LINKER_VERSION='GNU ld (GNU Binutils for Ubuntu) 2.42'
LINKER_SHA256='6250222e7132f5c7ae8bec570375710fa7b984c00d3a4eea2715d76842e4d972'

for command_name in curl tar xz make sha256sum file i686-linux-gnu-gcc i686-linux-gnu-ld i686-linux-gnu-strip; do
    command -v "$command_name" >/dev/null 2>&1 || {
        echo "missing build command: $command_name" >&2
        exit 2
    }
done

[ "$(LC_ALL=C i686-linux-gnu-gcc --version | sed -n '1p')" = "$COMPILER_VERSION" ] || {
    echo 'compiler version does not match binutils-2.42.lock' >&2
    exit 1
}
[ "$(LC_ALL=C i686-linux-gnu-ld --version | sed -n '1p')" = "$LINKER_VERSION" ] || {
    echo 'linker version does not match binutils-2.42.lock' >&2
    exit 1
}
printf '%s  %s\n' "$COMPILER_SHA256" "$(command -v i686-linux-gnu-gcc)" | sha256sum -c - >/dev/null
printf '%s  %s\n' "$LINKER_SHA256" "$(command -v i686-linux-gnu-ld)" | sha256sum -c - >/dev/null

mkdir -p "$CACHE"
if ! printf '%s  %s\n' "$SOURCE_SHA256" "$ARCHIVE" | sha256sum -c - >/dev/null 2>&1; then
    curl -fSL --retry 3 -o "$ARCHIVE.part" "$SOURCE_URL"
    printf '%s  %s\n' "$SOURCE_SHA256" "$ARCHIVE.part" | sha256sum -c -
    mv "$ARCHIVE.part" "$ARCHIVE"
fi

rm -rf -- "$SOURCE" "$BUILD"
mkdir -p "$SOURCE" "$BUILD" "$OUTPUT"
tar -xJf "$ARCHIVE" -C "$SOURCE" --strip-components=1

jobs="$(getconf _NPROCESSORS_ONLN 2>/dev/null || printf '2')"
case "$jobs" in ''|*[!0-9]*) jobs=2 ;; esac
export SOURCE_DATE_EPOCH=0

(
    cd "$BUILD"
    CC=i686-linux-gnu-gcc \
    CXX=i686-linux-gnu-g++ \
    AR=i686-linux-gnu-ar \
    RANLIB=i686-linux-gnu-ranlib \
    CFLAGS=-Os \
    CXXFLAGS=-Os \
    LDFLAGS=-static \
    ../binutils-2.42-src/configure \
        --build=x86_64-linux-gnu \
        --host=i686-linux-gnu \
        --target=i686-linux-gnu \
        --disable-nls \
        --disable-shared \
        --enable-static \
        --disable-werror \
        --disable-gdb \
        --disable-gdbserver \
        --disable-gprofng \
        --disable-gold \
        --disable-ld \
        --disable-gas \
        --disable-sim \
        --disable-plugins \
        --disable-libctf \
        --without-zstd \
        --without-debuginfod \
        --without-system-zlib \
        --enable-deterministic-archives
    make -j"$jobs" MAKEINFO=true
)

# Libtool's final executable link requires -all-static. Remove only the three
# frontends so the already-built audited libraries are reused for relinking.
rm -f -- "$BUILD/binutils/readelf" "$BUILD/binutils/nm-new" "$BUILD/binutils/objdump"
make -C "$BUILD/binutils" -j"$jobs" MAKEINFO=true LDFLAGS=-all-static readelf nm-new objdump

install -m 0755 "$BUILD/binutils/readelf" "$OUTPUT/readelf"
install -m 0755 "$BUILD/binutils/nm-new" "$OUTPUT/nm"
install -m 0755 "$BUILD/binutils/objdump" "$OUTPUT/objdump"
i686-linux-gnu-strip --strip-all --remove-section=.note.gnu.build-id \
    "$OUTPUT/readelf" "$OUTPUT/nm" "$OUTPUT/objdump"

printf '%s  %s\n' '4f6cfab9ad21cdaa8cebbf65cd34af881f8645ce47eb2541e8c9f6a3f24cb8f7' "$OUTPUT/readelf" | sha256sum -c -
printf '%s  %s\n' '608bb8aa47218aa818e08e32d85fd4baf294cb05afcf9950d4169367c408a625' "$OUTPUT/nm" | sha256sum -c -
printf '%s  %s\n' 'dd8bcd1a98c0136042cf1246d1e36153183485647b6f7e5cd676b3b915aace1b' "$OUTPUT/objdump" | sha256sum -c -

for tool in readelf nm objdump; do
    description="$(file "$OUTPUT/$tool")"
    printf '%s\n' "$description" | grep -Fq 'ELF 32-bit LSB executable, Intel 80386' || {
        echo "$tool is not an i386 ELF" >&2
        exit 1
    }
    printf '%s\n' "$description" | grep -Fq 'statically linked' || {
        echo "$tool is not statically linked" >&2
        exit 1
    }
    printf '%s\n' "$description" | grep -Fq 'stripped' || {
        echo "$tool is not stripped" >&2
        exit 1
    }
done

sha256sum "$OUTPUT/readelf" "$OUTPUT/nm" "$OUTPUT/objdump"
