#!/bin/sh
set -eu
[ "${PWNHUB_DEBUGGER_VERIFIED:-}" = 1 ] && [ "$#" -eq 1 ] || exit 1
printf '%s\n' "$1" | grep -Eq '^[0-9a-f]{48}$' || exit 1
echo 'asm-registers debugger state passed'
