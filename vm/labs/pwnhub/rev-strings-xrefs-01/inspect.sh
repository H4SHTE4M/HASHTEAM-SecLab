#!/bin/sh
set -eu

PROGRAM="${1:-${HOME:?}/reverse-companion}"
printf '\n[1/4] 文件身份与哈希\n'
file "$PROGRAM"
sha256sum "$PROGRAM"
printf '\n[2/4] 带文件偏移的可打印字符串\n'
strings -tx "$PROGRAM"
printf '\n[3/4] 代码符号\n'
nm -n "$PROGRAM" | awk '$2 ~ /^[Tt]$/ { print }'
printf '\n[4/4] 从字符串使用位置观察所属函数\n'
objdump -d -M intel --disassemble=stage_report "$PROGRAM"
