#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/elf-bytes"
ANSWER_HASH="$LAB_DIR/answer.sha256"
EXPECTED_SHA256='b95b37f88a4bd1f8bcbb126b353eec2f5cb7a8c2357ec24d449d4a5b4251a698'

if [ "$#" -ne 4 ]; then
    echo '需要四个观察值：魔数、位数标记、字节序标记和字符串标记。' >&2
    exit 1
fi

magic="$(printf '%s' "$1" | tr 'A-F' 'a-f')"
class="$(printf '%s' "$2" | tr 'A-F' 'a-f')"
endian="$(printf '%s' "$3" | tr 'A-F' 'a-f')"
marker="$4"
magic="${magic#0x}"
class="${class#0x}"
endian="${endian#0x}"

printf '%s\n' "$magic" | grep -Eq '^[0-9a-f]{8}$' || {
    echo '魔数应写成四个连续十六进制字节。' >&2
    exit 1
}
for byte in "$class" "$endian"; do
    printf '%s\n' "$byte" | grep -Eq '^[0-9a-f]{2}$' || {
        echo '位数和字节序标记都应写成一个十六进制字节。' >&2
        exit 1
    }
done
printf '%s\n' "$marker" | grep -Eq '^[A-Z0-9-]{3,32}$' || {
    echo '字符串标记格式不正确，请只填写冒号后的标记。' >&2
    exit 1
}

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo 'ELF 样本缺失。' >&2; exit 1; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo 'ELF 样本校验失败。' >&2
    exit 1
}

actual_magic="$(od -An -tx1 -N4 "$PROGRAM" | tr -d ' \n')"
actual_class="$(od -An -tx1 -j4 -N1 "$PROGRAM" | tr -d ' \n')"
actual_endian="$(od -An -tx1 -j5 -N1 "$PROGRAM" | tr -d ' \n')"
actual_marker="$(strings "$PROGRAM" | sed -n 's/^PwnHub_ELF_marker:[[:space:]]*//p' | head -n 1)"
[ -n "$actual_marker" ] || { echo '无法从真实 ELF 提取字符串标记。' >&2; exit 1; }

actual="$actual_magic,$actual_class,$actual_endian,$actual_marker"
actual_digest="$(printf 'hashteam-lab answer v1 elf-bytes-01:%s' "$actual" | sha256sum | cut -d ' ' -f 1)"
expected_digest="$(tr -d '\r\n ' < "$ANSWER_HASH")"
[ "$actual_digest" = "$expected_digest" ] || {
    echo '真实 ELF 与锁定的课程事实不一致。' >&2
    exit 1
}

submitted="$magic,$class,$endian,$marker"
submitted_digest="$(printf 'hashteam-lab answer v1 elf-bytes-01:%s' "$submitted" | sha256sum | cut -d ' ' -f 1)"
[ "$submitted_digest" = "$expected_digest" ] || {
    echo '观察值与真实 ELF 不一致，请重新核对偏移和字符串输出。' >&2
    exit 1
}

echo 'elf-bytes replay passed'
