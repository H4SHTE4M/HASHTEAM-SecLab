#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/elf-disassembly"
ANSWER_HASH="$LAB_DIR/answer.sha256"
OBJDUMP="${PWNHUB_OBJDUMP:-/usr/local/bin/objdump}"
EXPECTED_PROGRAM_SHA256='63deb66624d45292e645b51804c6f9802fa2dd86a2a86cb6dcba75e390fe2cea'
EXPECTED_OBJDUMP_SHA256='dd8bcd1a98c0136042cf1246d1e36153183485647b6f7e5cd676b3b915aace1b'

if [ "$#" -ne 4 ]; then
    echo '需要四个观察值：choose_path 地址、call 目标、条件跳转助记符和比较立即数。' >&2
    exit 1
fi

choose_address="$(printf '%s' "$1" | tr 'A-F' 'a-f')"
choose_address="${choose_address#0x}"
call_target="$2"
jump_mnemonic="$(printf '%s' "$3" | tr 'A-Z' 'a-z')"
compare_value="$(printf '%s' "$4" | tr 'A-F' 'a-f')"
compare_value="${compare_value#0x}"

printf '%s\n' "$choose_address" | grep -Eq '^[0-9a-f]{8}$' || {
    echo '函数地址应写成八位十六进制地址，可带 0x 前缀。' >&2
    exit 1
}
printf '%s\n' "$call_target" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*$' || {
    echo 'call 目标应填写反汇编中的函数名称。' >&2
    exit 1
}
printf '%s\n' "$jump_mnemonic" | grep -Eq '^j[a-z0-9]+$' || {
    echo '条件跳转应填写指令行中的 j 开头助记符。' >&2
    exit 1
}
printf '%s\n' "$compare_value" | grep -Eq '^[0-9a-f]+$' || {
    echo '比较立即数应填写十六进制数字，可带 0x 前缀。' >&2
    exit 1
}

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo 'ELF 样本缺失。' >&2; exit 1; }
[ -f "$OBJDUMP" ] && [ ! -L "$OBJDUMP" ] || { echo 'objdump 工具缺失。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_PROGRAM_SHA256" ] || {
    echo 'ELF 样本校验失败。' >&2
    exit 1
}
[ "$(sha256sum "$OBJDUMP" | cut -d ' ' -f 1)" = "$EXPECTED_OBJDUMP_SHA256" ] || {
    echo 'objdump 工具校验失败。' >&2
    exit 1
}

choose_dump="$(LC_ALL=C "$OBJDUMP" -d -M intel --disassemble=choose_path "$PROGRAM")"
compute_dump="$(LC_ALL=C "$OBJDUMP" -d -M intel --disassemble=compute_result "$PROGRAM")"
actual_address="$(printf '%s\n' "$choose_dump" | awk '$2 == "<choose_path>:" { print $1; exit }')"
actual_call="$(printf '%s\n' "$compute_dump" | awk '{ for (i = 1; i <= NF; i++) if ($i == "call") { target = $NF; gsub(/[<>]/, "", target); print target; exit } }')"
actual_jump="$(printf '%s\n' "$choose_dump" | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^j[a-z][a-z0-9]*$/) { print $i; exit } }')"
actual_compare="$(printf '%s\n' "$choose_dump" | awk '{ for (i = 1; i <= NF; i++) if ($i == "cmp") { value = $NF; sub(/^.*,/, "", value); sub(/^0x/, "", value); print value; exit } }')"
[ -n "$actual_address" ] && [ -n "$actual_call" ] && [ -n "$actual_jump" ] && [ -n "$actual_compare" ] || {
    echo '无法从真实 ELF 提取锁定的反汇编事实。' >&2
    exit 1
}

actual="$actual_address,$actual_call,$actual_jump,$actual_compare"
actual_digest="$(printf 'hashteam-lab answer v1 elf-disassembly-01:%s' "$actual" | sha256sum | cut -d ' ' -f 1)"
expected_digest="$(tr -d '\r\n ' < "$ANSWER_HASH")"
[ "$actual_digest" = "$expected_digest" ] || {
    echo '真实 ELF、objdump 输出与锁定课程事实不一致。' >&2
    exit 1
}

submitted="$choose_address,$call_target,$jump_mnemonic,$compare_value"
submitted_digest="$(printf 'hashteam-lab answer v1 elf-disassembly-01:%s' "$submitted" | sha256sum | cut -d ' ' -f 1)"
[ "$submitted_digest" = "$expected_digest" ] || {
    echo '观察值与真实 ELF 不一致，请重新核对函数地址、call、跳转和比较立即数。' >&2
    exit 1
}

echo 'elf-disassembly replay passed'
