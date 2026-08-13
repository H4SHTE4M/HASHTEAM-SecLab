#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/memory-addresses-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
