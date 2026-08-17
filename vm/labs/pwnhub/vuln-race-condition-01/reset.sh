#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/vuln-race-condition-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
printf '%s\n' 1000 > "$STATE_DIR/balance.txt"
: > "$STATE_DIR/ledger"