#!/bin/sh
set -eu

PROGRAM="${1:-${HOME:?}/reverse-companion}"
printf '\n[1/3] 函数符号与地址\n'
nm -n "$PROGRAM" | awk '$2 ~ /^[Tt]$/ { print }'
printf '\n[2/3] 候选值判断函数\n'
objdump -d -M intel --disassemble=stage_gate "$PROGRAM"
printf '\n[3/3] 结果报告函数\n'
objdump -d -M intel --disassemble=stage_report "$PROGRAM"
