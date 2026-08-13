#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
STATE_DIR="${HOME:?}/rop-register-chain-01"
PAYLOAD="${1:-$STATE_DIR/payload.bin}"
EXPECTED_PROGRAM_SHA256='4c35a71d070be92dfb8fb4f7be56161dcb37acaf88059fe5bea1099f940e5eeb'
MARKER='PwnHub ROP registers complete'

case "$PAYLOAD" in "$STATE_DIR"/*) ;; *) echo 'payload must be inside $HOME/rop-register-chain-01' >&2; exit 2 ;; esac
case "/$PAYLOAD/" in */../*) echo 'payload path traversal is not allowed' >&2; exit 2 ;; esac
[ -f "$PAYLOAD" ] && [ ! -L "$PAYLOAD" ] || { echo 'payload file is missing or is a symlink' >&2; exit 2; }
[ "$(wc -c < "$PAYLOAD")" -le 512 ] || { echo 'payload exceeds the 512 byte limit' >&2; exit 2; }
[ "$(sha256sum "$LAB_DIR/rop-register-chain" | cut -d ' ' -f 1)" = "$EXPECTED_PROGRAM_SHA256" ] || { echo 'sample hash does not match the audited artifact' >&2; exit 2; }

tmp="$(mktemp "$STATE_DIR/check.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
if ! timeout 2 "$LAB_DIR/rop-register-chain" < "$PAYLOAD" > "$tmp" 2>/dev/null; then
    echo 'ROP replay did not reach the expected state' >&2
    exit 1
fi
[ "$(wc -c < "$tmp")" -le 128 ] || { echo 'ELF output exceeded the limit' >&2; exit 1; }
[ "$(tr -d '\r\n' < "$tmp")" = "$MARKER" ] || { echo 'ELF output did not match the expected marker' >&2; exit 1; }
echo 'rop register chain replay passed'
