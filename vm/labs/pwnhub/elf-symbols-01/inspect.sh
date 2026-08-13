#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/elf-symbols"
NM="${PWNHUB_NM:-/usr/local/bin/nm}"
EXPECTED_PROGRAM_SHA256='601d047adf4c98f03168236236e528ef19a445e688e0793aa774513810c0bf9f'
EXPECTED_NM_SHA256='608bb8aa47218aa818e08e32d85fd4baf294cb05afcf9950d4169367c408a625'

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

printf '\n关键符号（nm -n ./elf-symbols）\n'
LC_ALL=C "$NM" -n "$PROGRAM" |
    sed -n '/ _start$/p; / compute_total$/p; / mix_value$/p; / initialized_seed$/p; / pending_total$/p'

cat <<'TEXT'

阅读提示：
- 第一列是符号地址，-n 让结果按地址从低到高排列。
- 第二列是类型字母：T/t 表示代码，D 表示已初始化数据，B 表示未初始化数据。
- 大写字母表示全局符号，小写字母表示只在当前目标文件内可见的局部符号。
TEXT
