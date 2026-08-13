#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/pwn-overflow-offset-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
