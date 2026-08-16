#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LAB_ID="${1:?usage: build-pwn-lab.sh LAB_ID [OUTPUT]}"
case "$LAB_ID" in
    pwn-overflow-offset-01) source_name=overflow-offset.c; output_name=overflow-offset ;;
    pwn-ret2win-args-01) source_name=ret2win-args.c; output_name=ret2win-args ;;
    vuln-weak-random-01) source_name=rand-door.c; output_name=rand-door ;;
    vuln-integer-overflow-01) source_name=wallet.c; output_name=wallet ;;
    vuln-overwrite-variable-01) source_name=door.c; output_name=door ;;
    vuln-string-overflow-01) source_name=frame.c; output_name=frame ;;
    vuln-format-string-01) source_name=greeter.c; output_name=greeter ;;
    vuln-race-condition-01) source_name=bank.c; output_name=bank ;;
    rop-gadget-stack-01) source_name=rop-gadget-stack.c; output_name=rop-gadget-stack ;;
    rop-register-chain-01) source_name=rop-register-chain.c; output_name=rop-register-chain ;;
    rop-call-chain-01) source_name=rop-call-chain.c; output_name=rop-call-chain ;;
    *) echo "unsupported pwn lab: $LAB_ID" >&2; exit 2 ;;
esac

LAB="$ROOT/vm/binary-profile/$LAB_ID"
OUT="${2:-$ROOT/vm/rootfs-overlay/opt/pwnhub/labs/$LAB_ID/$output_name}"
CC="${CC:-i686-linux-gnu-gcc}"
EXPECTED_VERSION='i686-linux-gnu-gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0'
EXPECTED_SHA256='441d893628701a7e11c5be38d7aa3d295d2c3560dc1a38d441e1626f8e7d7c21'

[ "$(LC_ALL=C "$CC" --version | sed -n '1p')" = "$EXPECTED_VERSION" ] || {
    echo "compiler version does not match $LAB/toolchain.lock" >&2
    exit 1
}
printf '%s  %s\n' "$EXPECTED_SHA256" "$(command -v "$CC")" | sha256sum -c - >/dev/null

mkdir -p "$(dirname "$OUT")"
export SOURCE_DATE_EPOCH=0
"$CC" \
    -m32 -O0 -fno-pie -no-pie -fno-stack-protector -fno-omit-frame-pointer \
    -mpreferred-stack-boundary=2 -fno-builtin -fno-asynchronous-unwind-tables \
    -fno-unwind-tables -nostdlib -static -Wl,-e,_start -Wl,--build-id=none \
    -Wl,-z,noexecstack -Wl,-z,norelro \
    -o "$OUT" "$LAB/$source_name"

machine="$(LC_ALL=C readelf -h "$OUT" | sed -n 's/^.*Machine:[[:space:]]*//p')"
type="$(LC_ALL=C readelf -h "$OUT" | sed -n 's/^.*Type:[[:space:]]*//p')"
[ "$machine" = "Intel 80386" ] || { echo "unexpected ELF machine: $machine" >&2; exit 1; }
[ "$type" = "EXEC (Executable file)" ] || { echo "unexpected ELF type: $type" >&2; exit 1; }
! LC_ALL=C readelf -l "$OUT" | grep -q 'INTERP' || { echo 'unexpected dynamic loader' >&2; exit 1; }
LC_ALL=C readelf -l "$OUT" | grep -Eq 'GNU_STACK[^R]*RW ' || {
    echo 'GNU_STACK is not non-executable' >&2
    exit 1
}
! LC_ALL=C readelf -l "$OUT" | grep -q 'GNU_RELRO' || { echo 'unexpected RELRO segment' >&2; exit 1; }
! LC_ALL=C readelf -Ws "$OUT" | grep -qE '__stack_chk_fail|execve|socket|setuid|setgid' || {
    echo 'forbidden symbol found' >&2
    exit 1
}
sha256sum "$OUT"
LC_ALL=C nm -n "$OUT" | grep -E '[[:space:]]T (_start|vulnerable|win|pop_eax_ret|pop_edx_ret|check_eax|check_registers|step_one|step_two|finish)$' || true
