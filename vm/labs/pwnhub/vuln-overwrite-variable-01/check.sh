#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
STATE_DIR="${HOME:?}/vuln-overwrite-variable-01"
PROGRAM="$LAB_DIR/door"
PAYLOAD="${1:-$STATE_DIR/input.txt}"
EXPECTED_SHA256='e04f671dc760066aefed97188fef131a10630477be540c6a55227b1aaf1b40ff'

case "$PAYLOAD" in "$STATE_DIR"/*) ;; *) echo 'payload must be inside $HOME/vuln-overwrite-variable-01' >&2; exit 2 ;; esac
case "/$PAYLOAD/" in */../*) echo 'payload path traversal is not allowed' >&2; exit 2 ;; esac
[ -f "$PAYLOAD" ] && [ ! -L "$PAYLOAD" ] || { echo 'payload file is missing or is a symlink' >&2; exit 2; }
[ "$(wc -c < "$PAYLOAD")" -le 64 ] || { echo 'payload exceeds the 64 byte limit' >&2; exit 2; }
[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo '样本缺失。' >&2; exit 2; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || { echo '样本哈希校验失败。' >&2; exit 2; }

output="$(mktemp "$STATE_DIR/check.XXXXXX")"
trap 'rm -f -- "$output"' EXIT
if ! LC_ALL=C timeout 2 "$PROGRAM" < "$PAYLOAD" > "$output" 2>&1; then
    echo '样本运行异常，请重试。' >&2
    exit 1
fi
grep -q 'PwnHub_admin_door_open' "$output" || {
    echo '门没有开：超长名字没有越过 16 字节缓冲区改写 is_admin，请把填充长度加到 17 以上。' >&2
    exit 1
}
echo 'vuln-overwrite-variable replay passed'