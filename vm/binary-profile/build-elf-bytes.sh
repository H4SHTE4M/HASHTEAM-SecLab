#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LAB="$ROOT/vm/binary-profile/elf-bytes-01"
OUT="${1:-$ROOT/vm/rootfs-overlay/opt/pwnhub/labs/elf-bytes-01/elf-bytes}"
CC="${CC:-i686-linux-gnu-gcc}"
EXPECTED_VERSION='i686-linux-gnu-gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0'
EXPECTED_SHA256='441d893628701a7e11c5be38d7aa3d295d2c3560dc1a38d441e1626f8e7d7c21'

[ "$(LC_ALL=C "$CC" --version | sed -n '1p')" = "$EXPECTED_VERSION" ] || {
    echo "compiler version does not match elf-bytes-01/toolchain.lock" >&2
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
    -o "$OUT" "$LAB/elf-bytes.c"

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
for symbol in _start show_runtime_message analysis_marker; do
    LC_ALL=C nm -n "$OUT" | grep -E "[[:space:]][TtrR] ${symbol}$" >/dev/null || {
        echo "$symbol symbol missing" >&2
        exit 1
    }
done
[ "$(od -An -tx1 -N6 "$OUT" | tr -d ' \n')" = '7f454c460101' ] || {
    echo "unexpected ELF identification bytes" >&2
    exit 1
}
LC_ALL=C strings "$OUT" | grep -Fx 'PwnHub_ELF_marker: ORBIT-386' >/dev/null || {
    echo "analysis marker missing" >&2
    exit 1
}

sha256sum "$OUT"
"$OUT"
