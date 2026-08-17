#!/bin/sh
set -eu

LAB_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROGRAM="$LAB_DIR/rand-door"
EXPECTED_SHA256='e7e61a9801d8c45a9b77254f9fdbee75822d91f44f413e4249c524649fa6303b'

if [ "$#" -ne 1 ]; then
    echo '用法：check <口令>，口令是用过去某一天的种子重放得到的 6 位十进制数字。' >&2
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

# 提取 "今日口令: NNNNNN" / "种子 N 的口令: NNNNNN" 末尾的 6 位数字。
extract_password() {
    sed -n 's/.*口令:[[:space:]]*\([0-9][0-9]*\)[[:space:]]*$/\1/p' | head -n 1
}

password_for_seed() {
    (cd "$LAB_DIR" && ./rand-door --seed "$1") | extract_password
}

expected_today="$(password_for_seed "$seed_today")"
expected_yesterday="$(password_for_seed "$((seed_today - 1))")"
expected_day_before="$(password_for_seed "$((seed_today - 2))")"

[ -n "$expected_today" ] && [ -n "$expected_yesterday" ] && [ -n "$expected_day_before" ] || {
    echo '无法从随机门样本计算口令，请检查样本与重放环境。' >&2
    exit 2
}

# 今天的口令不算数：门只认过去签发的口令。接受昨天与前天以容忍跨午夜提交。
if [ "$1" = "$expected_today" ]; then
    cat >&2 <<'TEXT'
这是今天的口令，门不认当天签发的口令。
口令由种子决定，种子是到那一天为止的整天数：把今天的日数减一，
就得到昨天的种子。先用 python 算今天的日数：
python -c "import time; print(int(time.time()) // 86400)"
再减一，用 ./rand-door --seed <昨天的日数> 重放昨天的口令。
TEXT
    exit 1
fi

if [ "$1" = "$expected_yesterday" ] || [ "$1" = "$expected_day_before" ]; then
    echo 'vuln-weak-random replay passed'
    exit 0
fi

cat >&2 <<'TEXT'
提交的口令与昨天或前天的实际口令都不一致。
先弄清种子和日期的关系：种子是从 1970-01-01 到那一天为止的整天数，
今天的日数用 python 算：python -c "import time; print(int(time.time()) // 86400)"；
把它减一得到昨天的种子，再用 ./rand-door --seed <昨天的日数> 重放后提交。
TEXT
exit 1
