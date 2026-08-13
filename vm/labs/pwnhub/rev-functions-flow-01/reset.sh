#!/bin/sh
set -eu

STATE_DIR="${HOME:?}/rev-functions-flow-01"
rm -rf -- "$STATE_DIR"
mkdir -p -- "$STATE_DIR"
