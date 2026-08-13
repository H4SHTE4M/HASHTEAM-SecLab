#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
STATE_DIR="${HOME:?}/rop-gadget-stack-01"
PAYLOAD="${1:-$STATE_DIR/payload.bin}"
EXPECTED_PROGRAM_SHA256='afafd14863bef2ac862d2e9733f3fe83ec40701c76bff535a587ea2f334166ac'
MARKER='PwnHub ROP gadget complete'

case "$PAYLOAD" in "$STATE_DIR"/*) ;; *) echo 'payload must be inside $HOME/rop-gadget-stack-01' >&2; exit 2 ;; esac
case "/$PAYLOAD/" in */../*) echo 'payload path traversal is not allowed' >&2; exit 2 ;; esac
[ -f "$PAYLOAD" ] && [ ! -L "$PAYLOAD" ] || { echo 'payload file is missing or is a symlink' >&2; exit 2; }
[ "$(wc -c < "$PAYLOAD")" -le 512 ] || { echo 'payload exceeds the 512 byte limit' >&2; exit 2; }
[ "$(sha256sum "$LAB_DIR/rop-gadget-stack" | cut -d ' ' -f 1)" = "$EXPECTED_PROGRAM_SHA256" ] || { echo 'sample hash does not match the audited artifact' >&2; exit 2; }

tmp="$(mktemp "$STATE_DIR/check.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
if ! timeout 2 "$LAB_DIR/rop-gadget-stack" < "$PAYLOAD" > "$tmp" 2>/dev/null; then echo 'ROP replay did not reach the expected state' >&2; exit 1; fi
[ "$(wc -c < "$tmp")" -le 128 ] || { echo 'ELF output exceeded the limit' >&2; exit 1; }
[ "$(tr -d '\r\n' < "$tmp")" = "$MARKER" ] || { echo 'ELF output did not match the expected marker' >&2; exit 1; }
echo 'rop gadget stack replay passed'
