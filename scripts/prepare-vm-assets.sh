#!/usr/bin/env bash
# 便捷入口：等价于 vm/build.sh（构建全部虚拟机静态资源）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/vm/build.sh" "$@"
