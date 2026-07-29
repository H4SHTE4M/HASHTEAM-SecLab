#!/bin/sh
# Shell semantic colors. Pipes and non-interactive commands stay plain text.
HT_COLOR_ENABLED=0
if [ "${HASHTEAM_FORCE_COLOR:-}" = 1 ]; then
    HT_COLOR_ENABLED=1
elif [ "${HASHTEAM_FORCE_COLOR:-}" != 0 ] &&
     [ -z "${NO_COLOR:-}" ] &&
     [ "${TERM:-}" != dumb ] &&
     [ -t 1 ]; then
    HT_COLOR_ENABLED=1
fi

if [ "$HT_COLOR_ENABLED" -eq 1 ]; then
    HT_RESET=$(printf '\033[0m')
    HT_CYAN=$(printf '\033[36m')
    HT_CYAN_BOLD=$(printf '\033[1;96m')
    HT_GREEN_BOLD=$(printf '\033[1;92m')
    HT_YELLOW=$(printf '\033[1;93m')
    HT_RED_BOLD=$(printf '\033[1;91m')
else
    HT_RESET=
    HT_CYAN=
    HT_CYAN_BOLD=
    HT_GREEN_BOLD=
    HT_YELLOW=
    HT_RED_BOLD=
fi

ht_banner() {
    printf '%s%s%s\n' "$HT_CYAN" '──────────────────────────────────────────────' "$HT_RESET"
    printf '%s %s%s\n' "$HT_CYAN_BOLD" "$1" "$HT_RESET"
    printf '%s%s%s\n' "$HT_CYAN" '──────────────────────────────────────────────' "$HT_RESET"
}

ht_notice() {
    printf '%s%s%s\n' "$HT_YELLOW" "$1" "$HT_RESET"
}

ht_warning() {
    printf '%s%s%s\n' "$HT_YELLOW" "$1" "$HT_RESET" >&2
}

ht_error() {
    printf '%s%s%s\n' "$HT_RED_BOLD" "$1" "$HT_RESET" >&2
}

ht_render_motd() {
    awk \
        -v reset="$HT_RESET" \
        -v cyan="$HT_CYAN" \
        -v cyan_bold="$HT_CYAN_BOLD" \
        -v yellow="$HT_YELLOW" \
        '
            NR == 1 || NR == 3 || /^=+$/ { color = cyan; print color $0 reset; next }
            /HASHTEAM Security Lab/ { color = cyan_bold; print color $0 reset; next }
            /^输入 help/ || /^完成第一关/ { color = yellow; print color $0 reset; next }
            { print $0 }
        ' "$1"
}

ht_render_result() {
    case "$1" in
        0) default_color=$HT_GREEN_BOLD ;;
        2) default_color=$HT_YELLOW ;;
        *) default_color=$HT_RED_BOLD ;;
    esac
    printf '%s\n' "$2" | awk \
        -v reset="$HT_RESET" \
        -v default_color="$default_color" \
        -v green="$HT_GREEN_BOLD" \
        -v yellow="$HT_YELLOW" \
        -v red="$HT_RED_BOLD" \
        '
            { color = default_color }
            /^[[:space:]]*✓/ { color = green }
            /^[[:space:]]*✗/ { color = red }
            /^[[:space:]]*用法：/ { color = yellow }
            { printf "%s%s%s\n", color, $0, reset }
        '
}
