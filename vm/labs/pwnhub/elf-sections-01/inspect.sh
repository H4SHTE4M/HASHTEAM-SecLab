#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/elf-sections"
READELF="${PWNHUB_READELF:-/usr/local/bin/readelf}"
EXPECTED_PROGRAM_SHA256='71b23b587a2a1e2a1ecf63f0fdc8cf68247965f6feb18e54fc1251fabf49883e'
EXPECTED_READELF_SHA256='4f6cfab9ad21cdaa8cebbf65cd34af881f8645ce47eb2541e8c9f6a3f24cb8f7'

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

printf '\nELF 头关键字段（readelf -h ./elf-sections）\n'
LC_ALL=C "$READELF" -h "$PROGRAM" |
    sed -n '/^[[:space:]]*Class:/p; /^[[:space:]]*Data:/p; /^[[:space:]]*Machine:/p; /^[[:space:]]*Entry point address:/p; /^[[:space:]]*Start of section headers:/p; /^[[:space:]]*Number of section headers:/p'

printf '\n常见节（readelf -SW ./elf-sections）\n'
LC_ALL=C "$READELF" -SW "$PROGRAM" |
    sed -n '/^  \[Nr\]/p; /] \.text[[:space:]]/p; /] \.rodata[[:space:]]/p; /] \.data[[:space:]]/p; /] \.bss[[:space:]]/p'

cat <<'TEXT'

阅读提示：
- Entry point address 是 CPU 开始执行的位置。
- Addr 是节加载后的虚拟地址，Off 是节在文件中的偏移。
- A/W/X 分别表示加载到内存、可写和可执行；.bss 的 NOBITS 表示文件不为零值内容保存字节。
TEXT
