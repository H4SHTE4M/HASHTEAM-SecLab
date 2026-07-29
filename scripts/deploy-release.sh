#!/usr/bin/env bash
#
# HASHTEAM Security Lab 原子发布：
#   验证已构建的 dist -> 检查远端最小权限 -> 上传共享内容寻址 VM 资产
#   -> 上传独立 release -> 原子切换 -> 线上健康检查；
#   失败时自动回滚 current 软链接。
#
# 用法：bash scripts/deploy-release.sh
set -euo pipefail

HOST="${DEPLOY_HOST:-cn-tencent}"
REMOTE_PATH="${DEPLOY_PATH:-/var/www/hashteam}"
DEPLOY_URL="${DEPLOY_URL:-https://labtest.lwzheng.tech}"
EXPECTED_REMOTE_USER="${DEPLOY_EXPECTED_USER:-hashteam-deploy}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

case "$HOST" in
  *[!A-Za-z0-9._-]*|'') echo "ERROR: DEPLOY_HOST 含非法字符"; exit 2 ;;
esac
case "$EXPECTED_REMOTE_USER" in
  *[!A-Za-z0-9._-]*|'') echo "ERROR: DEPLOY_EXPECTED_USER 含非法字符"; exit 2 ;;
esac
case "$REMOTE_PATH" in
  /var/www/*) ;;
  *) echo "ERROR: DEPLOY_PATH 必须是 /var/www/ 下的明确目录"; exit 2 ;;
esac
case "$REMOTE_PATH" in
  *[!A-Za-z0-9._/-]*) echo "ERROR: DEPLOY_PATH 含非法字符"; exit 2 ;;
esac
[[ "$REMOTE_PATH" != "/var/www" && "$REMOTE_PATH" != "/var/www/" ]] || {
  echo "ERROR: 拒绝使用过宽的 DEPLOY_PATH"
  exit 2
}
[[ "$DEPLOY_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || {
  echo "ERROR: DEPLOY_URL 必须是无路径、无尾斜杠的 HTTPS 站点地址"
  exit 2
}

cd "$PROJECT_DIR"

if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  [[ "${GITHUB_EVENT_NAME:-}" != "pull_request" ]] || {
    echo "ERROR: 拒绝从 pull_request workflow 使用生产发布脚本" >&2
    exit 1
  }
  [[ "${GITHUB_REF:-}" == "refs/heads/main" ]] || {
    echo "ERROR: GitHub Actions 只允许从 main 分支发布" >&2
    exit 1
  }
fi

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "ERROR: 发布要求工作区已提交且干净，以保证产物、源码和提交可追溯" >&2
  exit 1
fi
SOURCE_ID="$(git rev-parse HEAD)"
[[ "$SOURCE_ID" =~ ^[a-f0-9]{40}$ ]] || {
  echo "ERROR: 无法确定完整 Git source ID" >&2
  exit 1
}
export SOURCE_ID

if [[ -n "${1:-}" ]]; then
  echo "ERROR: 未知参数：$1"
  exit 2
fi

for required_command in git node ssh rsync curl cmp sha256sum; do
  command -v "$required_command" >/dev/null || {
    echo "ERROR: 缺少发布命令：${required_command}" >&2
    exit 1
  }
done

echo "==> [1/6] 校验已通过 CI 的发布包与远端最小权限"
node scripts/verify-dist.mjs

VM_HASH="$(node -e "const m=require('./dist/vm-assets.json'); process.stdout.write(m.hash)")"
[[ "$VM_HASH" =~ ^[a-f0-9]{64}$ ]] || { echo "ERROR: VM 资产哈希无效"; exit 1; }
DIST_SOURCE_ID="$(node -e "const m=require('./dist/vm-assets.json'); process.stdout.write(m.sourceId)")"
[[ "$DIST_SOURCE_ID" == "$SOURCE_ID" ]] || {
  echo "ERROR: dist 的 source ID 与当前 Git 提交不一致" >&2
  exit 1
}
SOURCE_CHECKSUMS="dist/sources/SHA256SUMS-${SOURCE_ID}"
[[ -s "$SOURCE_CHECKSUMS" ]] || {
  echo "ERROR: 发布包缺少当前提交的对应源码校验清单" >&2
  exit 1
}

ssh "$HOST" bash -s -- "$REMOTE_PATH" "$EXPECTED_REMOTE_USER" <<'REMOTE'
set -euo pipefail
root="$1"
expected_user="$2"
actual_user="$(id -un)"
[ "$(id -u)" -ne 0 ]
[ "$actual_user" = "$expected_user" ] || {
  echo "ERROR: SSH 实际用户为 $actual_user，预期为 $expected_user" >&2
  exit 1
}
if command -v sudo >/dev/null && sudo -n true >/dev/null 2>&1; then
  echo "ERROR: 部署账号不应拥有免交互 sudo 权限" >&2
  exit 1
fi
for path in "$root" "$root/releases" "$root/vm-assets" "$root/sources"; do
  [ -d "$path" ] && [ -r "$path" ] && [ -w "$path" ] && [ -x "$path" ] || {
    echo "ERROR: 部署账号缺少目录权限：$path" >&2
    exit 1
  }
done
REMOTE

RELEASE_CONTENT_HASH="$(
  sha256sum dist/index.html dist/vm-assets.json |
    sha256sum |
    cut -c1-12
)"
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)-${RELEASE_CONTENT_HASH}"
[[ "$RELEASE_ID" =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ ]] || exit 1

DEPLOY_TOKEN="${SOURCE_ID}-${RELEASE_ID}-$$"
LOCK_ACQUIRED=0
release_deploy_lock() {
  if [[ "$LOCK_ACQUIRED" -ne 1 ]]; then
    return
  fi
  if ! ssh "$HOST" bash -s -- "$REMOTE_PATH" "$DEPLOY_TOKEN" <<'REMOTE'
set -euo pipefail
root="$1"
token="$2"
lock="$root/.deploy-lock"
test -d "$lock"
test "$(cat "$lock/owner")" = "$token"
unlink "$lock/owner"
rmdir "$lock"
REMOTE
  then
    echo "WARNING: 未能自动释放远端发布锁；再次发布前必须确认没有发布进程，再按手册清理" >&2
  fi
  LOCK_ACQUIRED=0
}
trap release_deploy_lock EXIT

echo "==> [2/6] 获取远端发布锁并准备原子发布目录"
PREVIOUS_TARGET="$(
  ssh "$HOST" bash -s -- "$REMOTE_PATH" "$DEPLOY_TOKEN" <<'REMOTE'
set -euo pipefail
root="$1"
token="$2"
mkdir -p "$root/releases" "$root/vm-assets" "$root/sources"
lock="$root/.deploy-lock"
if ! mkdir "$lock" 2>/dev/null; then
  echo "ERROR: 已有发布占用远端锁：$(cat "$lock/owner" 2>/dev/null || echo owner-unknown)" >&2
  exit 75
fi
cleanup_lock_on_error() {
  status=$?
  if [ "$status" -ne 0 ]; then
    unlink "$lock/owner" 2>/dev/null || true
    rmdir "$lock" 2>/dev/null || true
  fi
  exit "$status"
}
trap cleanup_lock_on_error EXIT
printf '%s\n' "$token" > "$lock/owner"
if [ -L "$root/current" ]; then
  readlink "$root/current"
fi
trap - EXIT
REMOTE
)"
LOCK_ACQUIRED=1
case "$PREVIOUS_TARGET" in
  ''|releases/*) ;;
  *) echo "ERROR: 远端 current 指向异常位置：$PREVIOUS_TARGET"; exit 1 ;;
esac

echo "==> [3/6] 同步共享 VM 资产组 ${VM_HASH}"
rsync -az --checksum \
  ./dist/vm-assets/ \
  "${HOST}:${REMOTE_PATH}/vm-assets/"
rsync -az --checksum \
  --chmod=D755,F644 \
  ./dist/sources/ \
  "${HOST}:${REMOTE_PATH}/sources/"

echo "==> [4/6] 上传 release ${RELEASE_ID}"
ssh "$HOST" mkdir -p "${REMOTE_PATH}/releases/${RELEASE_ID}.upload"
rsync -az --delete \
  --exclude='vm-assets/' \
  --exclude='sources/' \
  --exclude='.DS_Store' \
  --exclude='*.log' \
  ./dist/ \
  "${HOST}:${REMOTE_PATH}/releases/${RELEASE_ID}.upload/"

echo "==> [5/6] 校验远端文件并原子切换 current"
ssh "$HOST" bash -s -- \
  "$REMOTE_PATH" "$RELEASE_ID" "$VM_HASH" "$DEPLOY_TOKEN" <<'REMOTE'
set -euo pipefail
root="$1"
release="$2"
vm_hash="$3"
token="$4"
upload="$root/releases/$release.upload"
final="$root/releases/$release"

test "$(cat "$root/.deploy-lock/owner")" = "$token"
test -s "$upload/index.html"
test -s "$upload/vm-assets.json"
test -s "$root/vm-assets/$vm_hash/v86/v86.wasm"
test -s "$root/vm-assets/$vm_hash/v86/v86-fallback.wasm"
test -s "$root/vm-assets/$vm_hash/vm/bzImage"
test -s "$root/vm-assets/$vm_hash/vm/rootfs.cpio.gz"
test ! -e "$final"
mv "$upload" "$final"
next_link="$root/current.$release.next"
test ! -e "$next_link"
test ! -L "$next_link"
ln -s "releases/$release" "$next_link"
mv -Tf "$next_link" "$root/current"
REMOTE

rollback() {
  if [[ -z "$PREVIOUS_TARGET" ]]; then
    echo "==> 首次发布健康检查失败，撤销 current 入口" >&2
    ssh "$HOST" bash -s -- \
      "$REMOTE_PATH" "$RELEASE_ID" "$DEPLOY_TOKEN" <<'REMOTE'
set -euo pipefail
root="$1"
release="$2"
token="$3"
test "$(cat "$root/.deploy-lock/owner")" = "$token"
if [ -L "$root/current" ] &&
  [ "$(readlink "$root/current")" = "releases/$release" ]; then
  unlink "$root/current"
fi
REMOTE
    return
  fi
  echo "==> 健康检查失败，回滚到 ${PREVIOUS_TARGET}" >&2
  ssh "$HOST" bash -s -- \
    "$REMOTE_PATH" "$PREVIOUS_TARGET" "$RELEASE_ID" "$DEPLOY_TOKEN" <<'REMOTE'
set -euo pipefail
root="$1"
previous="$2"
failed_release="$3"
token="$4"
case "$previous" in releases/*) ;; *) exit 2 ;; esac
test "$(cat "$root/.deploy-lock/owner")" = "$token"
test -d "$root/$previous"
test -L "$root/current"
test "$(readlink "$root/current")" = "releases/$failed_release"
rollback_link="$root/current.$failed_release.rollback"
test ! -e "$rollback_link"
test ! -L "$rollback_link"
ln -s "$previous" "$rollback_link"
mv -Tf "$rollback_link" "$root/current"
REMOTE
}

echo "==> [6/6] 验证线上安全头、精确 release 与当前 VM 资产"
if ! LIVE_HEADERS="$(
  curl -fsSI --max-time 20 \
    -H 'Cache-Control: no-cache' \
    "${DEPLOY_URL}/"
)"; then
  rollback
  exit 1
fi
if ! grep -Eq '^HTTP/[0-9.]+ 200([[:space:]]|$)' <<<"$LIVE_HEADERS"; then
  echo "ERROR: 线上首页没有直接返回 HTTP 200" >&2
  rollback
  exit 1
fi
for required_header in \
  content-security-policy \
  strict-transport-security \
  x-content-type-options; do
  if ! grep -qi "^${required_header}:" <<<"$LIVE_HEADERS"; then
    echo "ERROR: 线上首页缺少安全响应头 ${required_header}" >&2
    rollback
    exit 1
  fi
done
if ! grep -Eqi '^x-content-type-options:[[:space:]]*nosniff[[:space:]]*$' \
  <<<"$LIVE_HEADERS"; then
  echo "ERROR: 线上 X-Content-Type-Options 不是 nosniff" >&2
  rollback
  exit 1
fi
if ! grep -Eqi \
  '^strict-transport-security:.*max-age=[1-9][0-9]{7,}' \
  <<<"$LIVE_HEADERS"; then
  echo "ERROR: 线上 HSTS max-age 不足或无效" >&2
  rollback
  exit 1
fi
if ! grep -Eqi '^cache-control:.*no-store' <<<"$LIVE_HEADERS"; then
  echo "ERROR: 线上首页没有禁止缓存" >&2
  rollback
  exit 1
fi
for csp_directive in \
  "default-src 'self'" \
  "object-src 'none'" \
  "frame-ancestors 'none'" \
  "'wasm-unsafe-eval'"; do
  if ! grep -Eqi "^content-security-policy:.*${csp_directive}" \
    <<<"$LIVE_HEADERS"; then
    echo "ERROR: 线上 CSP 缺少必要约束：${csp_directive}" >&2
    rollback
    exit 1
  fi
done

if ! curl -fsS --max-time 20 \
  -H 'Cache-Control: no-cache' \
  "${DEPLOY_URL}/?release=${RELEASE_ID}" |
  cmp - dist/index.html; then
  echo "ERROR: 线上首页内容不是本次 release 的 index.html" >&2
  rollback
  exit 1
fi

if ! curl -fsS --max-time 20 \
  -H 'Cache-Control: no-cache' \
  "${DEPLOY_URL}/vm-assets.json?release=${RELEASE_ID}" |
  cmp - dist/vm-assets.json; then
  echo "ERROR: 线上 VM 清单不是本次 release 的完整清单" >&2
  rollback
  exit 1
fi

for legal_file in SOURCE_CODE.md THIRD_PARTY_NOTICES.md; do
  if ! curl -fsS --max-time 20 \
    -H 'Cache-Control: no-cache' \
    "${DEPLOY_URL}/legal/${legal_file}?release=${RELEASE_ID}" |
    cmp - "dist/legal/${legal_file}"; then
    echo "ERROR: 线上法律声明与本次 release 不一致：${legal_file}" >&2
    rollback
    exit 1
  fi
done

for relative in \
  v86/libv86.js \
  v86/v86.wasm \
  v86/v86-fallback.wasm \
  v86/bios/seabios-256k.bin \
  vm/bzImage \
  vm/rootfs.cpio.gz; do
  if ! curl -fsS --max-time 60 \
    "${DEPLOY_URL}/vm-assets/${VM_HASH}/${relative}" |
    cmp - "dist/vm-assets/${VM_HASH}/${relative}"; then
    echo "ERROR: 线上 VM 资产与本次构建不一致：${relative}" >&2
    rollback
    exit 1
  fi
done
if ! curl -fsS --max-time 20 \
  "${DEPLOY_URL}/sources/SHA256SUMS-${SOURCE_ID}" |
  cmp - "dist/sources/SHA256SUMS-${SOURCE_ID}"; then
  rollback
  exit 1
fi
while read -r _source_sha256 source_archive; do
  if [[ ! "$_source_sha256" =~ ^[a-f0-9]{64}$ ]] ||
    [[ ! "$source_archive" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "ERROR: 本地源码校验清单包含非法条目" >&2
    rollback
    exit 1
  fi
  source_status="$(
    curl -sS --head -o /dev/null -w '%{http_code}' --max-time 20 \
      "${DEPLOY_URL}/sources/${source_archive}"
  )" || {
    rollback
    exit 1
  }
  if [[ "$source_status" != "200" ]]; then
    echo "ERROR: 线上对应源码不可访问：${source_archive}（HTTP ${source_status}）" >&2
    rollback
    exit 1
  fi
done < "dist/sources/SHA256SUMS-${SOURCE_ID}"

echo "==> 发布完成：${DEPLOY_URL}/"
echo "    release: ${RELEASE_ID}"
echo "    VM assets: ${VM_HASH}"
echo "    previous: ${PREVIOUS_TARGET:-无（首次发布）}"
