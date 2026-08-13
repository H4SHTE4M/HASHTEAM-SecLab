#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LAB="$ROOT/vm/binary-profile/reverse-companion-01"
DEFAULT_OUT="$ROOT/vm/rootfs-overlay/opt/pwnhub/labs/rev-strings-xrefs-01/reverse-companion"
OUT="${1:-$DEFAULT_OUT}"
CC=i686-linux-gnu-gcc
EXPECTED_VERSION='i686-linux-gnu-gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0'
EXPECTED_SHA256='441d893628701a7e11c5be38d7aa3d295d2c3560dc1a38d441e1626f8e7d7c21'
EXPECTED_OUTPUT_SHA256='a1d48129804d6eee16ddf44e8697b780dc47a9b2b088503bc5a41fe7543d66cb'

[ "$(LC_ALL=C "$CC" --version | sed -n '1p')" = "$EXPECTED_VERSION" ] || {
    echo 'compiler version does not match reverse-companion-01/toolchain.lock' >&2
    exit 1
}
printf '%s  %s\n' "$EXPECTED_SHA256" "$(command -v "$CC")" | sha256sum -c - >/dev/null

mkdir -p "$(dirname "$OUT")"
export SOURCE_DATE_EPOCH=0
(
    cd "$LAB"
    "$CC" \
        -m32 -O0 -fno-pie -no-pie -fno-stack-protector -fno-omit-frame-pointer \
        -fno-toplevel-reorder -mpreferred-stack-boundary=2 -fno-builtin \
        -fno-asynchronous-unwind-tables -fno-unwind-tables -nostdlib -static \
        -Wl,-e,_start -Wl,--build-id=none -Wl,-z,noexecstack -Wl,-z,norelro \
        -o "$OUT" reverse-companion.c
)

machine="$(LC_ALL=C readelf -h "$OUT" | sed -n 's/^.*Machine:[[:space:]]*//p')"
type="$(LC_ALL=C readelf -h "$OUT" | sed -n 's/^.*Type:[[:space:]]*//p')"
[ "$machine" = 'Intel 80386' ] || { echo "unexpected ELF machine: $machine" >&2; exit 1; }
[ "$type" = 'EXEC (Executable file)' ] || { echo "unexpected ELF type: $type" >&2; exit 1; }
! LC_ALL=C readelf -l "$OUT" | grep -q 'INTERP' || { echo 'unexpected dynamic loader' >&2; exit 1; }
LC_ALL=C readelf -l "$OUT" | grep -Eq 'GNU_STACK[^R]*RW ' || {
    echo 'GNU_STACK is not non-executable' >&2
    exit 1
}
! LC_ALL=C readelf -l "$OUT" | grep -q 'GNU_RELRO' || {
    echo 'unexpected RELRO segment' >&2
    exit 1
}
! LC_ALL=C readelf -Ws "$OUT" | grep -qE '__stack_chk_fail|execve|socket|setuid|setgid' || {
    echo 'forbidden symbol found' >&2
    exit 1
}
for symbol in _start stage_gate stage_report success_marker last_decision; do
    LC_ALL=C nm -n "$OUT" | grep -E "[[:space:]][A-Za-z] $symbol$" >/dev/null || {
        echo "$symbol symbol missing" >&2
        exit 1
    }
done

printf '%s  %s\n' "$EXPECTED_OUTPUT_SHA256" "$OUT" | sha256sum -c -
"$OUT"

if [ "$#" -eq 0 ]; then
    install -m 0755 "$OUT" "$ROOT/vm/rootfs-overlay/opt/pwnhub/labs/rev-functions-flow-01/reverse-companion"
    install -m 0755 "$OUT" "$ROOT/public/artifacts/reverse-companion"
fi
