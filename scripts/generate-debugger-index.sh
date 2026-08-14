#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ] && [ "$#" -ne 6 ]; then
    echo 'usage: generate-debugger-index.sh <ELF> <disasm-output> <symbols-output> [<toolchain-lock> <debugger-config> <debugger-check>]' >&2
    exit 2
fi

ELF=$1
DISASM=$2
SYMBOLS=$3
tmp="$(mktemp "${TMPDIR:-/tmp}/pwnhub-disasm.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

LC_ALL=C objdump -d -M intel -- "$ELF" > "$tmp"
awk '
    /^[[:space:]]*[0-9a-f]+:/ {
        line=$0
        sub(/^[[:space:]]*/, "", line)
        count=split(line, parts, /[[:space:]]+/)
        address=parts[1]
        sub(/:$/, "", address)
        bytes=""
        field=2
        while (field <= count && parts[field] ~ /^[0-9a-f][0-9a-f]$/) {
            bytes=bytes parts[field]
            field++
        }
        text=parts[field]
        for (i=field+1; i<=count; i++) text=text " " parts[i]
        if (length(bytes) > 0 && length(text) > 0)
            printf "%s|%d|%s|%s\n", address, length(bytes)/2, bytes, text
    }
' "$tmp" > "$DISASM"

LC_ALL=C nm -n --defined-only -- "$ELF" |
    awk '$2 ~ /^[A-Za-z]$/ && $3 ~ /^[A-Za-z_.$][A-Za-z0-9_.$@]*$/ { print $1 "|" $3 }' \
    > "$SYMBOLS"

[ -s "$DISASM" ] && [ -s "$SYMBOLS" ]

if [ "$#" -eq 6 ]; then
    LOCK=$4
    CONFIG=$5
    CHECK=$6

    lock_value() { sed -n "s/^$1=//p" "$LOCK"; }
    verify_locked() {
        key=$1
        file=$2
        expected="$(lock_value "$key")"
        actual="$(sha256sum "$file" | cut -d ' ' -f 1)"
        if [ -z "$expected" ] || [ "$actual" != "$expected" ]; then
            echo "$key mismatch: $actual" >&2
            exit 1
        fi
    }

    verify_locked output_sha256 "$ELF"
    verify_locked debugger_disassembly_sha256 "$DISASM"
    verify_locked debugger_symbols_sha256 "$SYMBOLS"
    verify_locked debugger_config_sha256 "$CONFIG"
    verify_locked debugger_check_sha256 "$CHECK"
fi
