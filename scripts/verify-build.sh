#!/usr/bin/env bash
# 构建验证：检查虚拟机资源完整性，运行全部测试与前端构建。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> 1/5 检查虚拟机静态资源"
missing=0
for f in \
    public/v86/libv86.js \
    public/v86/v86.wasm \
    public/v86/bios/seabios-256k.bin \
    public/vm/bzImage \
    public/vm/rootfs.cpio.gz; do
    if [ -f "$f" ]; then
        printf '  ✓ %-40s %s\n' "$f" "$(du -h "$f" | cut -f1)"
    else
        printf '  ✗ 缺失 %s（请先运行 vm/build.sh）\n' "$f" >&2
        missing=1
    fi
done
[ "$missing" -eq 0 ]

echo "==> 2/5 前端单元测试（vitest）"
pnpm test

echo "==> 3/5 Linux 检查脚本测试"
if [ -n "${BUSYBOX:-}" ] || [ -x /tmp/busybox ] || command -v busybox >/dev/null 2>&1; then
    bash scripts/test-vm-checks.sh
else
    echo "  跳过：未找到 busybox 静态二进制（设置 BUSYBOX=/path/to/busybox 可启用）"
fi

echo "==> 4/5 端到端集成测试（Node 无头启动真实虚拟机）"
node scripts/integration-test.mjs

echo "==> 5/5 前端生产构建"
pnpm build

echo
echo "==> 全部验证通过。构建产物："
du -sh dist
