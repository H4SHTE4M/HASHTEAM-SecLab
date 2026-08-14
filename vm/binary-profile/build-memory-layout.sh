#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LAB="$ROOT/vm/binary-profile/memory-layout-01"
RUNTIME_LAB="$ROOT/vm/rootfs-overlay/opt/pwnhub/labs/memory-layout-01"
LOCK="$LAB/toolchain.lock"
OUT="${1:-$ROOT/vm/rootfs-overlay/opt/pwnhub/labs/memory-layout-01/memory-layout}"
CC="${CC:-i686-linux-gnu-gcc}"

[ "$(LC_ALL=C "$CC" --version | sed -n '1p')" = "$(sed -n 's/^compiler_version=//p' "$LAB/toolchain.lock")" ]
printf '%s  %s\n' "$(sed -n 's/^compiler_sha256=//p' "$LAB/toolchain.lock")" "$(command -v "$CC")" | sha256sum -c - >/dev/null
mkdir -p "$(dirname "$OUT")"
SOURCE_DATE_EPOCH="$(sed -n 's/^source_date_epoch=//p' "$LAB/toolchain.lock")" \
  "$CC" -m32 -O0 -fno-pie -no-pie -fno-stack-protector -fno-omit-frame-pointer \
  -fno-builtin -fno-asynchronous-unwind-tables -fno-unwind-tables -nostdlib -static \
  -Wl,-e,_start -Wl,--build-id=none -Wl,-z,noexecstack -Wl,-z,relro -Wl,-z,now \
  -o "$OUT" "$LAB/memory-layout.c"
LC_ALL=C readelf -h "$OUT" | grep -q 'Machine:[[:space:]]*Intel 80386'
! LC_ALL=C readelf -l "$OUT" | grep -q INTERP
LC_ALL=C readelf -l "$OUT" | grep -Eq 'GNU_STACK[^R]*RW '
"$ROOT/scripts/generate-debugger-index.sh" "$OUT" "${OUT}.disasm" "${OUT}.symbols" \
  "$LOCK" "$RUNTIME_LAB/debugger.json" "$RUNTIME_LAB/debugger-check.sh"
sha256sum "$OUT"
