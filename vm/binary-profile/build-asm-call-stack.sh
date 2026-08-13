#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LAB="$ROOT/vm/binary-profile/asm-call-stack-01"
OUT="${1:-$ROOT/vm/rootfs-overlay/opt/pwnhub/labs/asm-call-stack-01/asm-call-stack}"
CC="${CC:-i686-linux-gnu-gcc}"
EXPECTED_VERSION='i686-linux-gnu-gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0'
EXPECTED_SHA256='441d893628701a7e11c5be38d7aa3d295d2c3560dc1a38d441e1626f8e7d7c21'

[ "$(LC_ALL=C "$CC" --version | sed -n '1p')" = "$EXPECTED_VERSION" ] || {
    echo "compiler version does not match asm-call-stack-01/toolchain.lock" >&2
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
    -o "$OUT" "$LAB/asm-call-stack.c"

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
for symbol in _start teaching_stack capture_call teaching_callee; do
    LC_ALL=C nm -n "$OUT" | grep -E "[[:space:]][TtBb] ${symbol}$" >/dev/null || {
        echo "$symbol symbol missing" >&2
        exit 1
    }
done
LC_ALL=C objdump -d "$OUT" | grep -E '[[:space:]]call[[:space:]].*<teaching_callee>' >/dev/null || {
    echo "teaching call instruction missing" >&2
    exit 1
}
LC_ALL=C objdump -d "$OUT" | grep -E '[[:space:]]leave[[:space:]]*$' >/dev/null || {
    echo "leave instruction missing" >&2
    exit 1
}
LC_ALL=C objdump -d "$OUT" | grep -E '[[:space:]]ret[[:space:]]*$' >/dev/null || {
    echo "ret instruction missing" >&2
    exit 1
}
LC_ALL=C objdump -d "$OUT" | grep -E '[[:space:]]add[[:space:]]+\$0x4,%esp' >/dev/null || {
    echo "caller cleanup instruction missing" >&2
    exit 1
}

sha256sum "$OUT"
"$OUT"
