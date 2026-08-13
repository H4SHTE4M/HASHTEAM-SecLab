#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/pwn-ret2win-01"
mkdir -p "$STATE_DIR"
rm -f -- "$STATE_DIR/payload.bin" "$STATE_DIR/output.txt"
chmod 700 "$STATE_DIR"
