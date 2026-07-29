#!/usr/bin/env bash
#
# 校验 verify job 生成的唯一生产 artifact，并安全解包到固定的 dist/。
# Nginx 与 EdgeOne 部署 job 必须共用本脚本，避免供应链检查发生漂移。
set -euo pipefail

if [[ "$#" -ne 3 ]]; then
  echo "用法：bash scripts/verify-release-archive.sh <release.tar> <sha256> <git-sha>" >&2
  exit 2
fi

release_archive="$1"
expected_sha256="$2"
expected_source_id="$3"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"

[[ "$expected_sha256" =~ ^[a-f0-9]{64}$ ]] || {
  echo "ERROR: artifact SHA-256 格式无效" >&2
  exit 1
}
[[ "$expected_source_id" =~ ^[a-f0-9]{40}$ ]] || {
  echo "ERROR: Git source ID 格式无效" >&2
  exit 1
}
[[ -f "$release_archive" && ! -L "$release_archive" ]] || {
  echo "ERROR: production artifact 不存在、不是常规文件或是符号链接" >&2
  exit 1
}

for required_command in tar sha256sum grep find node; do
  command -v "$required_command" >/dev/null || {
    echo "ERROR: 缺少 artifact 校验命令：${required_command}" >&2
    exit 1
  }
done

cd "$project_dir"
printf '%s  %s\n' "$expected_sha256" "$release_archive" |
  sha256sum --check --strict -

if tar --list --file "$release_archive" |
  grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "ERROR: production artifact 包含越界路径" >&2
  exit 1
fi

if [[ -e dist || -L dist ]]; then
  echo "ERROR: 解包目标 dist 已存在，拒绝覆盖 runner 上的文件" >&2
  exit 1
fi
install -d -m 0755 dist
tar \
  --extract \
  --file "$release_archive" \
  --directory dist \
  --no-same-owner \
  --no-same-permissions

if find dist -type l -print -quit | grep -q .; then
  echo "ERROR: production artifact 不允许包含符号链接" >&2
  exit 1
fi

node scripts/verify-dist.mjs
dist_source_id="$(
  node -e "const m=require('./dist/vm-assets.json'); process.stdout.write(m.sourceId)"
)"
if [[ "$dist_source_id" != "$expected_source_id" ]]; then
  echo "ERROR: production artifact 的 source ID 与 workflow commit 不一致" >&2
  exit 1
fi

echo "✓ production artifact 的 SHA-256、路径、文件类型、配额与 source ID 均有效"
