#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/rop-call-chain-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
