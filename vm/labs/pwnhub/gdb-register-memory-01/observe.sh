#!/bin/sh
set -eu
gdb --nx --batch -q ./gdb-runtime \
    -ex 'break gdb_after_update' \
    -ex run \
    -ex 'info registers eax eip' \
    -ex 'print/x &observed_value' \
    -ex 'x/wx &observed_value'
