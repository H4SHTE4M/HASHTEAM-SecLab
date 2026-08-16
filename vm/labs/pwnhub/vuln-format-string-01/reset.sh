#!/bin/sh
set -eu

cat <<'TEXT'
greeter 没有持久状态：reset 后直接重新运行 ./greeter 即可。
TEXT