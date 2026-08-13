#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LAB="$ROOT/vm/binary-profile/elf-disassembly-01"
OUT="$ROOT/vm/rootfs-overlay/opt/pwnhub/labs/elf-disassembly-01/elf-disassembly"
[ "$#" -eq 0 ] || OUT="$1"
CC=i686-linux-gnu-gcc
OBJDUMP="${PWNHUB_OBJDUMP:-objdump}"
EXPECTED_VERSION='i686-linux-gnu-gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0'
EXPECTED_SHA256='441d893628701a7e11c5be38d7aa3d295d2c3560dc1a38d441e1626f8e7d7c21'
EXPECTED_OUTPUT_SHA256='63deb66624d45292e645b51804c6f9802fa2dd86a2a86cb6dcba75e390fe2cea'

[ "$(LC_ALL=C "$CC" --version | sed -n '1p')" = "$EXPECTED_VERSION" ] || {
    echo 'compiler version does not match elf-disassembly-01/toolchain.lock' >&2
    exit 1
}
printf '%s  %s\n' "$EXPECTED_SHA256" "$(command -v "$CC")" | sha256sum -c - >/dev/null
command -v "$OBJDUMP" >/dev/null 2>&1 || {
    echo 'objdump is required to audit the disassembly sample' >&2
    exit 1
}

mkdir -p "$(dirname "$OUT")"
export SOURCE_DATE_EPOCH=0
"$CC" \
    -m32 -O0 -fno-pie -no-pie -fno-stack-protector -fno-omit-frame-pointer \
    -mpreferred-stack-boundary=2 -fno-builtin -fno-asynchronous-unwind-tables \
    -fno-unwind-tables -nostdlib -static -Wl,-e,_start -Wl,--build-id=none \
    -Wl,-z,noexecstack -Wl,-z,relro -Wl,-z,now \
    -o "$OUT" "$LAB/elf-disassembly.c"

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
for symbol in _start choose_path compute_result pending_result; do
    LC_ALL=C nm -n "$OUT" | grep -E "[[:space:]][A-Za-z] $symbol$" >/dev/null || {
        echo "$symbol symbol missing" >&2
        exit 1
    }
done

printf '%s  %s\n' "$EXPECTED_OUTPUT_SHA256" "$OUT" | sha256sum -c -
LC_ALL=C "$OBJDUMP" -d -M intel --disassemble=choose_path "$OUT"
LC_ALL=C "$OBJDUMP" -d -M intel --disassemble=compute_result "$OUT"
"$OUT"
