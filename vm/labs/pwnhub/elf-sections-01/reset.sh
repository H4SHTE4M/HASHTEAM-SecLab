#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/elf-sections-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
