#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
STATE_DIR="${HOME:?}/pwn-ret2win-args-01"
PAYLOAD="${1:-$STATE_DIR/payload.bin}"
EXPECTED_PROGRAM_SHA256='757ea0ddd6898723df8e48bc1d26b40aa0b68d558b96a562c9b5d1c2e8715559'
MARKER='PwnHub ret2win args complete'

case "$PAYLOAD" in "$STATE_DIR"/*) ;; *) echo 'payload must be inside $HOME/pwn-ret2win-args-01' >&2; exit 2 ;; esac
case "/$PAYLOAD/" in */../*) echo 'payload path traversal is not allowed' >&2; exit 2 ;; esac
[ -f "$PAYLOAD" ] && [ ! -L "$PAYLOAD" ] || { echo 'payload file is missing or is a symlink' >&2; exit 2; }
[ "$(wc -c < "$PAYLOAD")" -le 512 ] || { echo 'payload exceeds the 512 byte limit' >&2; exit 2; }
[ "$(sha256sum "$LAB_DIR/ret2win-args" | cut -d ' ' -f 1)" = "$EXPECTED_PROGRAM_SHA256" ] || { echo 'sample hash does not match the audited artifact' >&2; exit 2; }

tmp="$(mktemp "$STATE_DIR/check.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
if ! timeout 2 "$LAB_DIR/ret2win-args" < "$PAYLOAD" > "$tmp" 2>/dev/null; then
    echo 'ELF replay did not reach the expected state' >&2
    exit 1
fi
[ "$(wc -c < "$tmp")" -le 128 ] || { echo 'ELF output exceeded the limit' >&2; exit 1; }
[ "$(tr -d '\r\n' < "$tmp")" = "$MARKER" ] || { echo 'ELF output did not match the expected marker' >&2; exit 1; }
echo 'pwn ret2win args replay passed'
