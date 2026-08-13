#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
SCRIPT="$LAB_DIR/inspect-memory-layout.sh"
EXPECTED_SHA256='94a06311f6e006788bff713217216cc3b3b9c7ac064a651927f35219841ff2a7'

if [ "$#" -ne 4 ]; then
    echo '需要四项权限观察值：代码段、数据段、堆和栈。' >&2
    exit 1
fi

for item in "$@"; do
    printf '%s\n' "$item" | grep -Eq '^[r-][w-][x-]$' || {
        echo '权限必须写成三个字符，例如 r-x 或 rw-。' >&2
        exit 1
    }
done

[ -f "$SCRIPT" ] && [ ! -L "$SCRIPT" ] || { echo '内存布局观察脚本缺失。' >&2; exit 1; }
[ "$(sha256sum "$SCRIPT" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo '内存布局观察脚本校验失败。' >&2
    exit 1
}

tmp="$(mktemp "${TMPDIR:-/tmp}/memory-layout.XXXXXX")"
trap 'rm -f -- "$tmp"' EXIT
if ! timeout 2 "$SCRIPT" > "$tmp" 2>/dev/null; then
    echo '真实内存映射观察失败。' >&2
    exit 1
fi
[ "$(wc -c < "$tmp")" -le 2048 ] || { echo '内存映射输出超过限制。' >&2; exit 1; }

permission_for() {
    awk -F '|' -v region="$1" '
        $1 ~ region {
            gsub(/^[ \t]+|[ \t]+$/, "", $3)
            print $3
            exit
        }
    ' "$tmp"
}

code_permission="$(permission_for '代码段')"
data_permission="$(permission_for '数据段')"
heap_permission="$(permission_for '堆')"
stack_permission="$(permission_for '栈')"

[ "$1" = "$code_permission" ] &&
[ "$2" = "$data_permission" ] &&
[ "$3" = "$heap_permission" ] &&
[ "$4" = "$stack_permission" ] || {
    echo '权限观察值与当前进程的真实映射不一致。' >&2
    exit 1
}

echo 'memory-layout replay passed'
