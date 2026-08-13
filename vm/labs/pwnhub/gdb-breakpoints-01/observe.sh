#!/bin/sh
set -eu
gdb --nx --batch -q ./gdb-runtime \
    -ex 'break update_cell' \
    -ex run \
    -ex 'info registers eip eax' \
    -ex 'x/2i $eip'
