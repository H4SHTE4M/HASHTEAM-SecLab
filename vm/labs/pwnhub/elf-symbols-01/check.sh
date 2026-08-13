#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/elf-symbols"
ANSWER_HASH="$LAB_DIR/answer.sha256"
NM="${PWNHUB_NM:-/usr/local/bin/nm}"
EXPECTED_PROGRAM_SHA256='601d047adf4c98f03168236236e528ef19a445e688e0793aa774513810c0bf9f'
EXPECTED_NM_SHA256='608bb8aa47218aa818e08e32d85fd4baf294cb05afcf9950d4169367c408a625'

if [ "$#" -ne 4 ]; then
    echo '需要四个观察值：compute_total 地址和三个符号类型字母。' >&2
    exit 1
fi

compute_address="$(printf '%s' "$1" | tr 'A-F' 'a-f')"
compute_address="${compute_address#0x}"
compute_type="$2"
mix_type="$3"
pending_type="$4"

printf '%s\n' "$compute_address" | grep -Eq '^[0-9a-f]{8}$' || {
    echo '函数地址应写成八位十六进制地址，可带 0x 前缀。' >&2
    exit 1
}
for type_value in "$compute_type" "$mix_type" "$pending_type"; do
    printf '%s\n' "$type_value" | grep -Eq '^[A-Za-z?]$' || {
        echo '符号类型应填写 nm 第二列的单个字母，并保留大小写。' >&2
        exit 1
    }
done

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo 'ELF 样本缺失。' >&2; exit 1; }
[ -f "$NM" ] && [ ! -L "$NM" ] || { echo 'nm 工具缺失。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_PROGRAM_SHA256" ] || {
    echo 'ELF 样本校验失败。' >&2
    exit 1
}
[ "$(sha256sum "$NM" | cut -d ' ' -f 1)" = "$EXPECTED_NM_SHA256" ] || {
    echo 'nm 工具校验失败。' >&2
    exit 1
}

symbols="$(LC_ALL=C "$NM" -n "$PROGRAM")"
actual_address="$(printf '%s\n' "$symbols" | awk '$3 == "compute_total" { print $1; exit }')"
actual_compute_type="$(printf '%s\n' "$symbols" | awk '$3 == "compute_total" { print $2; exit }')"
actual_mix_type="$(printf '%s\n' "$symbols" | awk '$3 == "mix_value" { print $2; exit }')"
actual_pending_type="$(printf '%s\n' "$symbols" | awk '$3 == "pending_total" { print $2; exit }')"
[ -n "$actual_address" ] && [ -n "$actual_compute_type" ] &&
[ -n "$actual_mix_type" ] && [ -n "$actual_pending_type" ] || {
    echo '无法从真实 ELF 提取锁定的符号事实。' >&2
    exit 1
}

actual="$actual_address,$actual_compute_type,$actual_mix_type,$actual_pending_type"
actual_digest="$(printf 'hashteam-lab answer v1 elf-symbols-01:%s' "$actual" | sha256sum | cut -d ' ' -f 1)"
expected_digest="$(tr -d '\r\n ' < "$ANSWER_HASH")"
[ "$actual_digest" = "$expected_digest" ] || {
    echo '真实 ELF、nm 输出与锁定课程事实不一致。' >&2
    exit 1
}

submitted="$compute_address,$compute_type,$mix_type,$pending_type"
submitted_digest="$(printf 'hashteam-lab answer v1 elf-symbols-01:%s' "$submitted" | sha256sum | cut -d ' ' -f 1)"
[ "$submitted_digest" = "$expected_digest" ] || {
    echo '观察值与真实 ELF 不一致，请重新核对 nm 的地址、类型字母和大小写。' >&2
    exit 1
}

echo 'elf-symbols replay passed'
