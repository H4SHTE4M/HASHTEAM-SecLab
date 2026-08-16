# PwnHub 实验状态共享助手：当前实验、课程全局序号与标题。
# 序号口径与 hashteamctl 终端横幅、前端头部「第 N 关」一致：course-order 行序，从 1 开始。
# 路径约定与 colors.sh 相同，均可由环境变量覆盖（宿主机测试用）。

ht_current_lab() {
    cat "${HASHTEAM_STATE_DIR:-$HOME/.hashteam}/lab" 2>/dev/null || true
}

ht_lab_number() {
    wanted=$1
    order="${PWNHUB_COURSE_ORDER:-/opt/pwnhub/course-order}"
    [ -f "$order" ] || return 1
    number=0
    while IFS= read -r item || [ -n "$item" ]; do
        [ -n "$item" ] || continue
        number=$((number + 1))
        if [ "$item" = "$wanted" ]; then
            printf '%s\n' "$number"
            return 0
        fi
    done < "$order"
    return 1
}

ht_lab_title() {
    # 课程 manifest 的第一个 title 是实验标题；步骤标题位于后面。
    sed -n 's/^[[:space:]]*"title"[[:space:]]*:[[:space:]]*"\([^"\\]*\)".*/\1/p' \
        "${PWNHUB_LABS_DIR:-/opt/pwnhub/labs}/$1/manifest.json" 2>/dev/null | sed -n '1p'
}
