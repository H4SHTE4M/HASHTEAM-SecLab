#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
STATE_DIR="${HOME:?}/pwn-ret2win-01"
PAYLOAD="${1:-$STATE_DIR/payload.bin}"
MARKER='PwnHub ret2win complete'
EXPECTED_SHA256='58841c68f57cd49e3ed33ec621f000cb4a1d24691f88c7ddcf0a0bdc71013068'

case "$PAYLOAD" in
    "$STATE_DIR"/*) ;;
    *) echo 'payload must be inside $HOME/pwn-ret2win-01' >&2; exit 2 ;;
esac
case "/$PAYLOAD/" in
    */../*) echo 'payload path traversal is not allowed' >&2; exit 2 ;;
esac
[ -f "$PAYLOAD" ] || { echo 'payload file is missing' >&2; exit 2; }
[ ! -L "$PAYLOAD" ] || { echo 'payload symlink is not allowed' >&2; exit 2; }
[ "$(sha256sum "$LAB_DIR/ret2win" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo 'sample hash does not match the audited artifact' >&2
    exit 2
}
size="$(wc -c < "$PAYLOAD")"
[ "$size" -le 512 ] || { echo 'payload exceeds the 512 byte limit' >&2; exit 2; }

tmp="$(mktemp "$STATE_DIR/check.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
if ! timeout 2 "$LAB_DIR/ret2win" < "$PAYLOAD" > "$tmp" 2>/dev/null; then
    echo 'ELF replay did not reach the expected state' >&2
    exit 1
fi
[ "$(wc -c < "$tmp")" -le 128 ] || { echo 'ELF output exceeded the limit' >&2; exit 1; }
actual="$(tr -d '\r\n' < "$tmp")"
[ "$actual" = "$MARKER" ] || { echo 'ELF output did not match the expected marker' >&2; exit 1; }
echo 'ret2win replay passed'
