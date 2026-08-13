#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LAB="$ROOT/vm/binary-profile/elf-symbols-01"
OUT="$ROOT/vm/rootfs-overlay/opt/pwnhub/labs/elf-symbols-01/elf-symbols"
[ "$#" -eq 0 ] || OUT="$1"
CC=i686-linux-gnu-gcc
EXPECTED_VERSION='i686-linux-gnu-gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0'
EXPECTED_SHA256='441d893628701a7e11c5be38d7aa3d295d2c3560dc1a38d441e1626f8e7d7c21'

[ "$(LC_ALL=C "$CC" --version | sed -n '1p')" = "$EXPECTED_VERSION" ] || {
    echo 'compiler version does not match elf-symbols-01/toolchain.lock' >&2
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
    -o "$OUT" "$LAB/elf-symbols.c"

machine="$(LC_ALL=C readelf -h "$OUT" | sed -n 's/^.*Machine:[[:space:]]*//p')"
type="$(LC_ALL=C readelf -h "$OUT" | sed -n 's/^.*Type:[[:space:]]*//p')"
[ "$machine" = 'Intel 80386' ] || { echo "unexpected ELF machine: $machine" >&2; exit 1; }
[ "$type" = 'EXEC (Executable file)' ] || { echo "unexpected ELF type: $type" >&2; exit 1; }
! LC_ALL=C readelf -l "$OUT" | grep -q 'INTERP' || { echo 'unexpected dynamic loader' >&2; exit 1; }
LC_ALL=C readelf -l "$OUT" | grep -Eq 'GNU_STACK[^R]*RW ' || {
    echo 'GNU_STACK is not non-executable' >&2
    exit 1
}
! LC_ALL=C readelf -Ws "$OUT" | grep -qE '__stack_chk_fail|execve|socket|setuid|setgid' || {
    echo 'forbidden symbol found' >&2
    exit 1
}
for expected in 'T compute_total' 't mix_value' 'D initialized_seed' 'B pending_total'; do
    expected_type="${expected%% *}"
    expected_symbol="${expected#* }"
    LC_ALL=C nm -n "$OUT" | awk -v type="$expected_type" -v symbol="$expected_symbol" \
        '$2 == type && $3 == symbol { found = 1 } END { exit found ? 0 : 1 }' || {
        echo "expected symbol missing: $expected_type $expected_symbol" >&2
        exit 1
    }
done

sha256sum "$OUT"
LC_ALL=C nm -n "$OUT"
"$OUT"
