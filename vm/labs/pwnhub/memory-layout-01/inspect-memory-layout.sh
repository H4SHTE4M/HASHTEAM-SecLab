#!/bin/sh
set -eu

maps="/proc/$$/maps"
[ -r "$maps" ] || {
    echo '无法读取当前进程的内存映射。' >&2
    exit 1
}

executable="$(readlink "/proc/$$/exe")"
[ -n "$executable" ] || {
    echo '无法识别当前进程的可执行文件。' >&2
    exit 1
}

printf 'memory-layout-01（来自当前进程的 /proc 映射）\n'
printf '区域     | 地址范围          | rwx | 常见增长 | 含义\n'
awk -v executable="$executable" '
function emit(label, range, perms, growth, meaning) {
    printf "%s | %s | %s | %s | %s\n", label, range, substr(perms, 1, 3), growth, meaning
}
$2 ~ /^r-x/ && $NF == executable && !code_seen {
    emit("代码段   ", $1, $2, "--      ", "保存正在执行的机器指令")
    code_seen = 1
}
$2 ~ /^rw-/ && $NF == executable && !data_seen {
    emit("数据段   ", $1, $2, "--      ", "保存可修改的全局和静态数据")
    data_seen = 1
}
$NF == "[heap]" && !heap_seen {
    emit("堆       ", $1, $2, "向高地址", "承载运行时申请的空间")
    heap_seen = 1
}
$NF == "[stack]" && !stack_seen {
    emit("栈       ", $1, $2, "向低地址", "保存当前调用的临时状态")
    stack_seen = 1
}
END {
    if (!code_seen || !data_seen || !heap_seen || !stack_seen) exit 2
}
' "$maps" || {
    echo '当前进程的内存映射缺少教学所需区域。' >&2
    exit 1
}
