#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/rop-gadget-stack-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
