#!/bin/sh
set -eu
gdb --nx --batch -q ./gdb-runtime \
    -ex 'run crash < crash.txt' \
    -ex 'info registers eip' \
    -ex 'x/i $eip' \
    -ex backtrace \
    -ex 'frame 0' \
    -ex 'print/x invalid_address'
