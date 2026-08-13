#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/pwn-ret2win-args-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
