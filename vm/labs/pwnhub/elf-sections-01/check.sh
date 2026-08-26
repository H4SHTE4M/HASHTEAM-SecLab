#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/elf-sections"
ANSWER_HASH="$LAB_DIR/answer.sha256"
READELF="${PWNHUB_READELF:-/usr/local/bin/readelf}"
EXPECTED_PROGRAM_SHA256='71b23b587a2a1e2a1ecf63f0fdc8cf68247965f6feb18e54fc1251fabf49883e'
EXPECTED_READELF_SHA256='4f6cfab9ad21cdaa8cebbf65cd34af881f8645ce47eb2541e8c9f6a3f24cb8f7'

if [ "$#" -ne 4 ]; then
    echo '需要四个观察值：入口点、.text 地址、.bss 类型和 .data 标志。' >&2
    exit 1
fi

bss_type="$(printf '%s' "$3" | tr 'a-z' 'A-Z')"
data_flags="$(printf '%s' "$4" | tr 'a-z' 'A-Z')"

normalize_hex32_raw() {
    value="$(printf '%s' "$1" | tr 'A-F' 'a-f')"
    case "$value" in
        0x*) value="${value#0x}" ;;
        0X*) value="${value#0X}" ;;
    esac
    case "$value" in
        ''|*[!0-9a-f]*) return 1 ;;
    esac
    value="$(printf '%s' "$value" | sed 's/^0*//')"
    [ -n "$value" ] || value=0
    [ "${#value}" -le 8 ] || return 1
    printf '%s' "$value"
}

normalize_hex32_padded() {
    value="$(normalize_hex32_raw "$1")" || return 1
    printf '%08s' "$value" | tr ' ' '0'
}

case "$1" in 0x*|0X*) ;; *) echo '入口点应是以 0x 开头的十六进制地址。' >&2; exit 1 ;; esac
case "$2" in 0x*|0X*) ;; *) echo '.text 地址应是以 0x 开头的十六进制地址。' >&2; exit 1 ;; esac
entry="$(normalize_hex32_raw "$1")" || { echo '入口点应是以 0x 开头的十六进制地址。' >&2; exit 1; }
text_address="$(normalize_hex32_padded "$2")" || { echo '.text 地址应是以 0x 开头的十六进制地址。' >&2; exit 1; }
printf '%s\n' "$bss_type" | grep -Eq '^[A-Z]{3,12}$' || {
    echo '.bss 类型格式不正确，请填写节表 Type 列。' >&2
    exit 1
}
printf '%s\n' "$data_flags" | grep -Eq '^[A-Z]{1,4}$' || {
    echo '.data 标志格式不正确，请填写节表 Flg 列。' >&2
    exit 1
}

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo 'ELF 样本缺失。' >&2; exit 1; }
[ -f "$READELF" ] && [ ! -L "$READELF" ] || { echo 'readelf 工具缺失。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_PROGRAM_SHA256" ] || {
    echo 'ELF 样本校验失败。' >&2
    exit 1
}
[ "$(sha256sum "$READELF" | cut -d ' ' -f 1)" = "$EXPECTED_READELF_SHA256" ] || {
    echo 'readelf 工具校验失败。' >&2
    exit 1
}

header="$(LC_ALL=C "$READELF" -h "$PROGRAM")"
sections="$(LC_ALL=C "$READELF" -SW "$PROGRAM")"
actual_entry="$(printf '%s\n' "$header" | sed -n 's/^[[:space:]]*Entry point address:[[:space:]]*0x//p')"
actual_text="$(printf '%s\n' "$sections" | awk '$0 ~ /] \.text[[:space:]]/ { for (i = 1; i <= NF; i++) if ($i == ".text") { print $(i + 2); exit } }')"
actual_bss_type="$(printf '%s\n' "$sections" | awk '$0 ~ /] \.bss[[:space:]]/ { for (i = 1; i <= NF; i++) if ($i == ".bss") { print $(i + 1); exit } }')"
actual_data_flags="$(printf '%s\n' "$sections" | awk '$0 ~ /] \.data[[:space:]]/ { for (i = 1; i <= NF; i++) if ($i == ".data") { print $(i + 6); exit } }')"
[ -n "$actual_entry" ] && [ -n "$actual_text" ] && [ -n "$actual_bss_type" ] && [ -n "$actual_data_flags" ] || {
    echo '无法从真实 ELF 提取入口点或节表事实。' >&2
    exit 1
}
actual_entry="$(normalize_hex32_raw "$actual_entry")"
actual_text="$(normalize_hex32_padded "$actual_text")"

actual="$actual_entry,$actual_text,$actual_bss_type,$actual_data_flags"
actual_digest="$(printf 'hashteam-lab answer v1 elf-sections-01:%s' "$actual" | sha256sum | cut -d ' ' -f 1)"
expected_digest="$(tr -d '\r\n ' < "$ANSWER_HASH")"
[ "$actual_digest" = "$expected_digest" ] || {
    echo '真实 ELF、readelf 输出与锁定课程事实不一致。' >&2
    exit 1
}

submitted="$entry,$text_address,$bss_type,$data_flags"
submitted_digest="$(printf 'hashteam-lab answer v1 elf-sections-01:%s' "$submitted" | sha256sum | cut -d ' ' -f 1)"
[ "$submitted_digest" = "$expected_digest" ] || {
    echo '观察值与真实 ELF 不一致，请重新核对 ELF 头和节表列。' >&2
    exit 1
}

echo 'elf-sections replay passed'
