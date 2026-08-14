#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LAB="$ROOT/vm/binary-profile/asm-registers-01"
RUNTIME_LAB="$ROOT/vm/rootfs-overlay/opt/pwnhub/labs/asm-registers-01"
LOCK="$LAB/toolchain.lock"
OUT="${1:-$ROOT/vm/rootfs-overlay/opt/pwnhub/labs/asm-registers-01/asm-registers}"
CC="${CC:-i686-linux-gnu-gcc}"
EXPECTED_VERSION='i686-linux-gnu-gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0'
EXPECTED_SHA256='441d893628701a7e11c5be38d7aa3d295d2c3560dc1a38d441e1626f8e7d7c21'

[ "$(LC_ALL=C "$CC" --version | sed -n '1p')" = "$EXPECTED_VERSION" ] || {
    echo "compiler version does not match asm-registers-01/toolchain.lock" >&2
    exit 1
}
printf '%s  %s\n' "$EXPECTED_SHA256" "$(command -v "$CC")" | sha256sum -c - >/dev/null

mkdir -p "$(dirname "$OUT")"
export SOURCE_DATE_EPOCH=0
"$CC" \
    -m32 -O0 -fno-pie -no-pie -fno-stack-protector -fno-omit-frame-pointer \
    -mpreferred-stack-boundary=2 -fno-builtin -fno-asynchronous-unwind-tables \
    -fno-unwind-tables -nostdlib -static -Wl,-e,_start -Wl,--build-id=none \
    -Wl,-z,noexecstack -Wl,-z,relro -Wl,-z,now \
    -o "$OUT" "$LAB/asm-registers.c"

machine="$(LC_ALL=C readelf -h "$OUT" | sed -n 's/^.*Machine:[[:space:]]*//p')"
type="$(LC_ALL=C readelf -h "$OUT" | sed -n 's/^.*Type:[[:space:]]*//p')"
[ "$machine" = "Intel 80386" ] || { echo "unexpected ELF machine: $machine" >&2; exit 1; }
[ "$type" = "EXEC (Executable file)" ] || { echo "unexpected ELF type: $type" >&2; exit 1; }
! LC_ALL=C readelf -l "$OUT" | grep -q 'INTERP' || { echo "unexpected dynamic loader" >&2; exit 1; }
LC_ALL=C readelf -l "$OUT" | grep -Eq 'GNU_STACK[^R]*RW ' || {
    echo "GNU_STACK is not non-executable" >&2
    exit 1
}
! LC_ALL=C readelf -Ws "$OUT" | grep -qE '__stack_chk_fail|execve|socket|setuid|setgid' || {
    echo "forbidden symbol found" >&2
    exit 1
}
LC_ALL=C nm -n "$OUT" | grep -qE '[[:space:]]T _start$' || {
    echo "_start symbol missing" >&2
    exit 1
}
LC_ALL=C objdump -d "$OUT" | grep -E '[[:space:]]lea[[:space:]]' >/dev/null || {
    echo "lea instruction missing" >&2
    exit 1
}

"$ROOT/scripts/generate-debugger-index.sh" "$OUT" "${OUT}.disasm" "${OUT}.symbols" \
    "$LOCK" "$RUNTIME_LAB/debugger.json" "$RUNTIME_LAB/debugger-check.sh"

sha256sum "$OUT"
"$OUT"
