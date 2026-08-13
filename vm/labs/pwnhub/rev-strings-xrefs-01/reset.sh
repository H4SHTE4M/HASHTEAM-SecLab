#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/rev-strings-xrefs-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
