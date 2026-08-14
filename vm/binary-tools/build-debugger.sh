#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE="$ROOT/vm/toolchain-source/debugger/debugger.c"
LOCK="$ROOT/vm/toolchain-source/debugger/toolchain.lock"
OUTPUT="${1:-$ROOT/vm/rootfs-overlay/usr/local/bin/debugger}"
CC="${DEBUGGER_CC:-/opt/32/bin/i686-aosc-linux-gnu-gcc}"

lock_value() { sed -n "s/^$1=//p" "$LOCK"; }

[ "$(LC_ALL=C "$CC" --version | sed -n '1p')" = "$(lock_value compiler_version)" ] || {
    echo 'debugger compiler version does not match toolchain.lock' >&2
    exit 1
}
printf '%s  %s\n' "$(lock_value compiler_sha256)" "$(command -v "$CC")" | sha256sum -c - >/dev/null

mkdir -p "$(dirname "$OUTPUT")"
env SOURCE_DATE_EPOCH="$(lock_value source_date_epoch)" TZ=UTC \
    "$CC" -m32 -static -Os -Wall -Wextra -Werror \
        -Wl,--build-id=none -Wl,-z,noexecstack -Wl,-z,relro,-z,now \
        -o "$OUTPUT" "$SOURCE"
strip --strip-all "$OUTPUT"

actual="$(sha256sum "$OUTPUT" | cut -d ' ' -f 1)"
expected="$(lock_value output_sha256)"
if [ "$expected" != PENDING ] && [ "$actual" != "$expected" ]; then
    echo "debugger output hash mismatch: $actual" >&2
    exit 1
fi
printf '%s  %s\n' "$actual" "$OUTPUT"
