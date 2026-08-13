#!/bin/sh
set -eu
gdb --nx --batch -q ./gdb-runtime \
    -ex 'break gdb_after_update' \
    -ex run \
    -ex backtrace \
    -ex 'frame 2' \
    -ex 'info args' \
    -ex 'info locals'
