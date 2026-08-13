#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/elf-bytes"
EXPECTED_SHA256='b95b37f88a4bd1f8bcbb126b353eec2f5cb7a8c2357ec24d449d4a5b4251a698'

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo 'ELF 样本缺失。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo 'ELF 样本校验失败。' >&2
    exit 1
}

printf '文件类型（file ./elf-bytes）\n'
file "$PROGRAM"
printf '\n前 16 字节（hexdump -C -n 16 ./elf-bytes）\n'
hexdump -C -n 16 "$PROGRAM"

magic="$(od -An -tx1 -N4 "$PROGRAM" | awk '{$1=$1; print}')"
class="$(od -An -tx1 -j4 -N1 "$PROGRAM" | awk '{$1=$1; print}')"
endian="$(od -An -tx1 -j5 -N1 "$PROGRAM" | awk '{$1=$1; print}')"

printf '\nELF 识别字段（同一组真实字节）\n'
printf '字段     | 偏移 | 原始字节\n'
printf '魔数     | 0x00 | %s\n' "$magic"
printf '位数标记 | 0x04 | %s\n' "$class"
printf '字节序   | 0x05 | %s\n' "$endian"
