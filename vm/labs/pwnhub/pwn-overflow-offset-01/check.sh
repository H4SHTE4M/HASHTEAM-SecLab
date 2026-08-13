#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
STATE_DIR="${HOME:?}/pwn-overflow-offset-01"
GDB="${PWNHUB_GDB:-/usr/local/bin/gdb}"
PAYLOAD="${1:-$STATE_DIR/payload.bin}"
EXPECTED_PROGRAM_SHA256='381972c7fab3c613cbd6503a51104a3eba9cca11036800484b830d4050b30333'
EXPECTED_GDB_SHA256='5bed8004d18a154d4358b82c4068c33e7649c02d9cdd9801e8db55dd100ae216'

case "$PAYLOAD" in "$STATE_DIR"/*) ;; *) echo 'payload must be inside $HOME/pwn-overflow-offset-01' >&2; exit 2 ;; esac
case "/$PAYLOAD/" in */../*) echo 'payload path traversal is not allowed' >&2; exit 2 ;; esac
[ -f "$PAYLOAD" ] && [ ! -L "$PAYLOAD" ] || { echo 'payload file is missing or is a symlink' >&2; exit 2; }
[ "$(wc -c < "$PAYLOAD")" -le 512 ] || { echo 'payload exceeds the 512 byte limit' >&2; exit 2; }
[ "$(sha256sum "$LAB_DIR/overflow-offset" | cut -d ' ' -f 1)" = "$EXPECTED_PROGRAM_SHA256" ] || { echo 'sample hash does not match the audited artifact' >&2; exit 2; }
[ "$(sha256sum "$GDB" | cut -d ' ' -f 1)" = "$EXPECTED_GDB_SHA256" ] || { echo 'GDB hash does not match the audited artifact' >&2; exit 2; }

output="$(mktemp "$STATE_DIR/check.XXXXXX")"
trap 'rm -f -- "$output"' EXIT
if ! (cd "$LAB_DIR" && LC_ALL=C "$GDB" --nx --batch -q ./overflow-offset -ex "run < $PAYLOAD" -ex 'info registers eip') > "$output" 2>&1; then
    echo 'GDB could not replay the offset payload.' >&2
    exit 1
fi
eip="$(sed -n 's/^eip[[:space:]]*0x\([0-9a-fA-F]*\).*/\1/p' "$output" | head -n 1 | tr 'A-F' 'a-f')"
[ "$eip" = '42424242' ] || { echo '真实 GDB 没看到 0x42424242 的受控 EIP，请重新核对 padding 偏移。' >&2; exit 1; }
echo 'pwn overflow offset replay passed'
