#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/vuln-string-overflow-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"