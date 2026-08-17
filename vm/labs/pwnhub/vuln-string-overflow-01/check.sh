#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
STATE_DIR="${HOME:?}/vuln-string-overflow-01"
PROGRAM="$LAB_DIR/frame"
PAYLOAD="${1:-$STATE_DIR/payload.bin}"
EXPECTED_SHA256='2cb4d2e6c6b80f9575fe6b1a612f9a5e744f450e72334ec1d159e6c23c35c4be'

case "$PAYLOAD" in "$STATE_DIR"/*) ;; *) echo 'payload must be inside $HOME/vuln-string-overflow-01' >&2; exit 2 ;; esac
case "/$PAYLOAD/" in */../*) echo 'payload path traversal is not allowed' >&2; exit 2 ;; esac
[ -f "$PAYLOAD" ] && [ ! -L "$PAYLOAD" ] || { echo 'payload file is missing or is a symlink' >&2; exit 2; }
[ "$(wc -c < "$PAYLOAD")" -le 48 ] || { echo 'payload exceeds the 48 byte limit' >&2; exit 2; }
[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo '样本缺失。' >&2; exit 2; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || { echo '样本哈希校验失败。' >&2; exit 2; }

output="$(mktemp "$STATE_DIR/check.XXXXXX")"
trap 'rm -f -- "$output"' EXIT
set +e
{ LC_ALL=C timeout 2 "$PROGRAM" < "$PAYLOAD" > "$output" 2>&1; } 2>/dev/null
status=$?
set -e
if [ "$status" -lt 128 ]; then
    echo '样本没有崩溃：超长输入还没盖到保存的返回地址，请把填充长度加到 32 以上。' >&2
    exit 1
fi
grep -q '保存的返回地址现在是: 0x41414141' "$output" || {
    echo '保存的返回地址没有被改写成 0x41414141，请让填充覆盖到返回地址那一格。' >&2
    exit 1
}
echo 'vuln-string-overflow replay passed'