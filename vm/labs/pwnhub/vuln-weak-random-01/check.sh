#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/rand-door"
EXPECTED_SHA256='6a1171604bd85f018409de89477371edd7e60ce0bda83c11eafb60ecd889d6b5'

if [ "$#" -ne 1 ]; then
    echo '用法：check <口令>，口令是样本打印的 6 位十进制数字。' >&2
    exit 2
fi

case "$1" in
    *[!0-9]* | '')
        echo '口令应只包含 6 位十进制数字，请照抄样本输出。' >&2
        exit 2
        ;;
esac
[ "${#1}" -eq 6 ] || {
    echo '口令应是 6 位十进制数字，请照抄样本输出。' >&2
    exit 2
}

[ -f "$PROGRAM" ] && [ ! -L "$PROGRAM" ] || { echo '随机门样本缺失或不是普通文件。' >&2; exit 2; }
[ "$(sha256sum "$PROGRAM" | cut -d ' ' -f 1)" = "$EXPECTED_SHA256" ] || {
    echo '随机门样本校验失败，请确认使用的是审计锁定的版本。' >&2
    exit 2
}

seed_today=$(( $(date +%s) / 86400 ))
seed_yesterday=$(( seed_today - 1 ))

# 提取 "今日口令: NNNNNN" / "种子 N 的口令: NNNNNN" 末尾的 6 位数字。
extract_password() {
    sed -n 's/.*口令:[[:space:]]*\([0-9][0-9]*\)[[:space:]]*$/\1/p' | head -n 1
}

expected_today="$(cd "$LAB_DIR" && ./rand-door --seed "$seed_today" | extract_password)"
expected_yesterday="$(cd "$LAB_DIR" && ./rand-door --seed "$seed_yesterday" | extract_password)"

[ -n "$expected_today" ] && [ -n "$expected_yesterday" ] || {
    echo '无法从随机门样本计算当天口令，请检查样本与重放环境。' >&2
    exit 2
}

if [ "$1" = "$expected_today" ] || [ "$1" = "$expected_yesterday" ]; then
    echo 'vuln-weak-random replay passed'
    exit 0
fi

cat >&2 <<'TEXT'
提交的口令与今天或昨天的实际口令都不一致。
请用 ./rand-door --seed $(python -c "import time; print(int(time.time()) // 86400)") 重放今天后再提交。
TEXT
exit 1