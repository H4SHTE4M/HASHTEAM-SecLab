#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/vuln-overwrite-variable-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"