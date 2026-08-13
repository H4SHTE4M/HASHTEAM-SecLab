#!/usr/bin/env bash
# 构建验证：检查虚拟机资源完整性，运行全部测试与前端构建。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> 1/11 检查源码文件权限"
permission_errors=0
while IFS= read -r -d '' file; do
    [ -f "$file" ] || continue
    expected_mode=644
    case "$file" in
        scripts/*.sh | \
        scripts/*.py | \
        scripts/validate-challenges.mjs | \
        scripts/validate-binary-profile.mjs | \
        scripts/verify-dist.mjs | \
        vm/build.sh | \
        vm/binary-profile/*.sh | \
        vm/binary-tools/*.sh)
            expected_mode=755
            ;;
        vm/labs/pwnhub/*/*.json | \
        vm/labs/pwnhub/*/*.txt | \
        vm/labs/pwnhub/*/*.sha256 | \
        vm/labs/pwnhub/*/*.c | \
        vm/labs/pwnhub/*/*.gdb | \
        vm/labs/pwnhub/*/home-files | \
        vm/labs/pwnhub/*/unlock-labs | \
        vm/binary-tools/staged/gdbinit)
            ;;
        vm/binary-tools/prebuilt/* | \
        vm/binary-tools/staged/* | \
        vm/labs/pwnhub/*/* | \
        vm/rootfs-overlay/init | \
        vm/rootfs-overlay/opt/hashteam/levels/*/*.sh | \
        vm/rootfs-overlay/usr/local/bin/*)
            expected_mode=755
            ;;
    esac
    actual_mode="$(stat -c '%a' -- "$file")"
    if [ "$actual_mode" != "$expected_mode" ]; then
        printf '  ✗ %s 权限为 %s，预期 %s\n' "$file" "$actual_mode" "$expected_mode" >&2
        permission_errors=1
    fi
done < <(git ls-files --cached --others --exclude-standard -z)
[ "$permission_errors" -eq 0 ]

echo "==> 2/11 审计浏览器生产依赖漏洞"
# EdgeOne CLI 是精确锁定、只在隔离部署 job 使用的 devDependency；其上游
# 1.6.18 仍包含已弃用且无可升级修复的 request 依赖。这里对实际交付给浏览器的
# dependencies/optionalDependencies 保持 low 门禁，CLI 图则由 frozen lockfile 固定。
pnpm audit --prod --audit-level low

echo "==> 3/11 检查虚拟机静态资源"
missing=0
for f in \
    public/v86/libv86.js \
    public/v86/v86.wasm \
    public/v86/v86-fallback.wasm \
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

echo "==> 4/11 SUID BusyBox 边界检查"
pnpm test:suid

echo "==> 5/11 前端单元测试（vitest）"
pnpm test

echo "==> 6/11 遥测后端测试（独立 Node 环境）"
pnpm test:backend

echo "==> 7/11 Linux 检查脚本测试"
pnpm test:vm

echo "==> 8/11 离线 i386 binary profile smoke test"
pnpm test:binary-profile

echo "==> 9/11 部署锁租约与后端部署脚本检查"
bash scripts/test-deploy-lock.sh
bash -n backend/deploy.sh

echo "==> 10/11 端到端集成测试（Node 无头启动真实虚拟机）"
node scripts/integration-test.mjs

echo "==> 11/11 前端生产构建"
pnpm build
pnpm verify:dist

echo
echo "==> 全部验证通过。构建产物："
du -sh dist
