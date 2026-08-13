#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/asm-stack-ops-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
