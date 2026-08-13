#!/usr/bin/env bash
# HASHTEAM Security Lab 原子发布：
#   验证已构建的 dist -> 检查远端最小权限 -> 上传共享内容寻址 VM 资产
#   -> 分片并行上传 release 差量至持久传输缓存（单流失败自动重试）
#   -> 服务器本地组装 release -> 校验文件集 -> GC 缓存 -> 原子切换
#   -> 线上健康检查；失败时自动回滚 current 软链接。
# 持久缓存使同一内容只跨链路传输一次；N 条独立 SSH 连接规避跨境按流限速
# （实测单流 ~12 kB/s，8 流聚合 ~86 kB/s；严禁 ControlMaster 复用连接）。
#
# 用法：bash scripts/deploy-release.sh
set -euo pipefail

HOST="${DEPLOY_HOST:-cn-tencent}"
REMOTE_PATH="${DEPLOY_PATH:-/var/www/hashteam}"
DEPLOY_URL="${DEPLOY_URL:-https://labtest.lwzheng.tech}"
EXPECTED_REMOTE_USER="${DEPLOY_EXPECTED_USER:-hashteam-deploy}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCK_HELPER="$SCRIPT_DIR/remote-deploy-lock.sh"
ARTIFACT_SNAPSHOT_HELPER="$SCRIPT_DIR/remote-artifact-snapshot.sh"
LOCK_HEARTBEAT_SECONDS="${DEPLOY_LOCK_HEARTBEAT_SECONDS:-30}"
LOCK_STALE_SECONDS="${DEPLOY_LOCK_STALE_SECONDS:-180}"
LOCK_WAIT_SECONDS="${DEPLOY_LOCK_WAIT_SECONDS:-300}"
LOCK_RETRY_SECONDS="${DEPLOY_LOCK_RETRY_SECONDS:-15}"

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
for lock_interval in \
  "$LOCK_HEARTBEAT_SECONDS" \
  "$LOCK_STALE_SECONDS" \
  "$LOCK_WAIT_SECONDS" \
  "$LOCK_RETRY_SECONDS"; do
  [[ "$lock_interval" =~ ^[0-9]+$ ]] || {
    echo "ERROR: 发布锁时间参数必须是整数" >&2
    exit 2
  }
done
(( LOCK_HEARTBEAT_SECONDS >= 10 && LOCK_HEARTBEAT_SECONDS <= 120 ))
(( LOCK_STALE_SECONDS >= LOCK_HEARTBEAT_SECONDS * 3 && LOCK_STALE_SECONDS <= 3600 ))
(( LOCK_WAIT_SECONDS >= LOCK_STALE_SECONDS && LOCK_WAIT_SECONDS <= 900 ))
(( LOCK_RETRY_SECONDS >= 5 && LOCK_RETRY_SECONDS <= LOCK_HEARTBEAT_SECONDS ))

DEPLOY_PARALLELISM="${DEPLOY_PARALLELISM:-8}"
DEPLOY_UPLOAD_RETRIES="${DEPLOY_UPLOAD_RETRIES:-3}"
DEPLOY_UPLOAD_RETRY_WAIT="${DEPLOY_UPLOAD_RETRY_WAIT:-10}"
[[ "$DEPLOY_PARALLELISM" =~ ^[1-9][0-9]?$ ]] &&
  (( DEPLOY_PARALLELISM <= 16 )) || {
    echo "ERROR: DEPLOY_PARALLELISM 必须是 1-16 的整数"
    exit 2
  }
[[ "$DEPLOY_UPLOAD_RETRIES" =~ ^[1-5]$ ]] || {
  echo "ERROR: DEPLOY_UPLOAD_RETRIES 必须是 1-5 的整数"
  exit 2
}
[[ "$DEPLOY_UPLOAD_RETRY_WAIT" =~ ^[0-9]+$ ]] &&
  (( DEPLOY_UPLOAD_RETRY_WAIT >= 1 && DEPLOY_UPLOAD_RETRY_WAIT <= 60 )) || {
    echo "ERROR: DEPLOY_UPLOAD_RETRY_WAIT 必须是 1-60 的整数"
    exit 2
  }
[[ -r "$LOCK_HELPER" ]] || {
  echo "ERROR: 缺少远端发布锁助手：$LOCK_HELPER" >&2
  exit 1
}
[[ -r "$ARTIFACT_SNAPSHOT_HELPER" ]] || {
  echo "ERROR: 缺少远端 artifact 快照助手：$ARTIFACT_SNAPSHOT_HELPER" >&2
  exit 1
}

cd "$PROJECT_DIR"

if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  # 新拓扑下本脚本只服务 PR staging 部署（生产走 EdgeOne CLI）;
  # pull_request 的 GITHUB_REF 为 refs/pull/N/merge,防线在 job 级 if。
  [[ "${GITHUB_EVENT_NAME:-}" == "pull_request" ]] || {
    echo "ERROR: GitHub Actions 中本脚本仅用于 PR staging 部署" >&2
    exit 1
  }
fi

if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo "ERROR: 发布要求工作区已提交且干净，以保证产物和提交可追溯" >&2
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

for required_command in git node ssh rsync curl cmp sha256sum sleep; do
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
mkdir -p "$root/artifacts"
for path in "$root" "$root/releases" "$root/vm-assets" "$root/artifacts"; do
  [ -d "$path" ] && [ ! -L "$path" ] &&
    [ -r "$path" ] && [ -w "$path" ] && [ -x "$path" ] || {
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
LOCK_HEARTBEAT_PID=""
LOCK_HEARTBEAT_FAILURE_FILE="${RUNNER_TEMP:-/tmp}/hashteam-deploy-heartbeat-failed-${BASHPID}"

run_lock_helper() {
  local action="$1"
  shift
  ssh "$HOST" bash -s -- \
    "$action" "$REMOTE_PATH" "$DEPLOY_TOKEN" "$@" \
    < "$LOCK_HELPER"
}

heartbeat_deploy_lock() {
  while sleep "$LOCK_HEARTBEAT_SECONDS"; do
    if ! run_lock_helper refresh; then
      echo "ERROR: 远端发布锁心跳失败；本次发布不得继续切换 current" >&2
      : > "$LOCK_HEARTBEAT_FAILURE_FILE"
      return 1
    fi
  done
}

start_deploy_lock_heartbeat() {
  heartbeat_deploy_lock &
  LOCK_HEARTBEAT_PID="$!"
}

stop_deploy_lock_heartbeat() {
  if [[ -z "$LOCK_HEARTBEAT_PID" ]]; then
    return
  fi
  if kill -0 "$LOCK_HEARTBEAT_PID" 2>/dev/null; then
    kill "$LOCK_HEARTBEAT_PID" 2>/dev/null || true
  fi
  wait "$LOCK_HEARTBEAT_PID" 2>/dev/null || true
  LOCK_HEARTBEAT_PID=""
}

assert_deploy_lock_heartbeat() {
  if [[ -e "$LOCK_HEARTBEAT_FAILURE_FILE" ]] ||
    [[ -z "$LOCK_HEARTBEAT_PID" ]] ||
    ! kill -0 "$LOCK_HEARTBEAT_PID" 2>/dev/null; then
    echo "ERROR: 远端发布锁心跳已停止；拒绝继续发布" >&2
    return 1
  fi
}

release_deploy_lock() {
  [[ "$LOCK_ACQUIRED" -eq 1 ]] || return
  if ! run_lock_helper release; then
    return 1
  fi
  LOCK_ACQUIRED=0
}

cleanup_deploy() {
  local status=$?
  trap - EXIT HUP INT TERM
  stop_deploy_lock_heartbeat
  if [[ "$LOCK_ACQUIRED" -eq 1 ]] && ! release_deploy_lock; then
    echo "WARNING: 未能自动释放远端发布锁；租约过期后下次发布将安全回收" >&2
    if [[ "$status" -eq 0 ]]; then
      status=1
    fi
  fi
  if [[ -e "$LOCK_HEARTBEAT_FAILURE_FILE" ]]; then
    unlink "$LOCK_HEARTBEAT_FAILURE_FILE"
  fi
  exit "$status"
}
trap cleanup_deploy EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

echo "==> [2/6] 获取远端发布租约并准备原子发布目录"
lock_deadline=$((SECONDS + LOCK_WAIT_SECONDS))
while true; do
  if run_lock_helper acquire "$LOCK_STALE_SECONDS"; then
    break
  else
    lock_status=$?
  fi
  if [[ "$lock_status" -ne 75 ]] || (( SECONDS >= lock_deadline )); then
    echo "ERROR: 无法在 ${LOCK_WAIT_SECONDS}s 内取得远端发布锁" >&2
    exit "$lock_status"
  fi
  lock_remaining=$((lock_deadline - SECONDS))
  echo "==> 发布锁仍有有效租约；等待自动恢复（最多剩余 ${lock_remaining}s）"
  sleep "$LOCK_RETRY_SECONDS"
done
LOCK_ACQUIRED=1
start_deploy_lock_heartbeat

PREVIOUS_TARGET="$(
  ssh "$HOST" bash -s -- "$REMOTE_PATH" "$DEPLOY_TOKEN" <<'REMOTE'
set -euo pipefail
root="$1"
token="$2"
mkdir -p "$root/releases" "$root/vm-assets" "$root/artifacts"
test "$(cat "$root/.deploy-lock/owner")" = "$token"
if [ -L "$root/current" ]; then
  readlink "$root/current"
fi
REMOTE
)"
case "$PREVIOUS_TARGET" in
  ''|releases/*) ;;
  *) echo "ERROR: 远端 current 指向异常位置：$PREVIOUS_TARGET"; exit 1 ;;
esac

echo "==> [3/6] 同步共享 VM 资产组 ${VM_HASH} 与内容寻址下载样本"
# Shared content-addressed files may have been created by an earlier manual
# deployment account. Copy content and structure without attempting to set
# arbitrary historical mtimes, which Linux reserves for the file owner.
echo "    VM 资产体积 $(du -sh ./dist/vm-assets | cut -f1)；--checksum 去重后只传差异"
rsync -rlzh --checksum --info=progress2,name \
  ./dist/vm-assets/ \
  "${HOST}:${REMOTE_PATH}/vm-assets/"
echo "    下载样本体积 $(du -sh ./dist/artifacts | cut -f1)；旧 SHA-256 目录永久保留"
rsync -rlzh --checksum --info=progress2,name \
  ./dist/artifacts/ \
  "${HOST}:${REMOTE_PATH}/artifacts/"
assert_deploy_lock_heartbeat

echo "==> [4/6] 分片并行上传 release ${RELEASE_ID} 至持久传输缓存"
# 持久缓存 + 分片并行：同一文件内容只在首次上传时跨链路传输一次，
# 之后每次发布只传差异（--checksum 去重）。N 条独立 SSH 连接规避跨境
# 按流限速；严禁 ControlMaster 复用连接，否则并行收益归零。
# 缓存里残留的 rsync 临时文件与过期内容由 [5/6] 的 GC 定期回收。
work_dir="$(mktemp -d)"
manifest_file="$work_dir/manifest"
chunk_dir="$work_dir/chunks"
mkdir -p "$chunk_dir"

find ./dist -type f \
  ! -path './dist/vm-assets/*' \
  ! -path './dist/artifacts/*' \
  ! -name '.DS_Store' \
  ! -name '*.log' \
  -printf '%P\n' |
  LC_ALL=C sort -u > "$manifest_file"
total_files="$(wc -l < "$manifest_file")"
[[ "$total_files" -ge 1 ]] || { echo "ERROR: release 文件清单为空"; exit 1; }

chunk_count="$DEPLOY_PARALLELISM"
(( chunk_count = chunk_count > total_files ? total_files : chunk_count ))

# 按体积贪心分片，让各流负载接近
find ./dist -type f \
  ! -path './dist/vm-assets/*' \
  ! -path './dist/artifacts/*' \
  ! -name '.DS_Store' \
  ! -name '*.log' \
  -printf '%s\t%P\n' |
  LC_ALL=C sort -k1,1nr |
  awk -v n="$chunk_count" -v prefix="$chunk_dir/chunk." '
    BEGIN { for (i = 1; i <= n; i++) total[i] = 0 }
    {
      size = $1 + 0
      path = $0
      sub(/^[0-9]+\t/, "", path)
      best = 1
      for (i = 2; i <= n; i++) if (total[i] < total[best]) best = i
      total[best] += size
      print path >> (prefix best)
    }'

cache_dir="$REMOTE_PATH/.transfer-cache"
ssh "$HOST" mkdir -p "$cache_dir"
scp "$manifest_file" "$HOST:$cache_dir/.manifest-$RELEASE_ID"

echo "    release 共 ${total_files} 个文件、$(du -sh --exclude=vm-assets --exclude=artifacts ./dist | cut -f1)；"
echo "    ${chunk_count} 条并行流；单流最多重试 ${DEPLOY_UPLOAD_RETRIES} 次、间隔 ${DEPLOY_UPLOAD_RETRY_WAIT}s"

upload_chunk() {
  local chunk_file="$1"
  local attempt
  for ((attempt = 1; attempt <= DEPLOY_UPLOAD_RETRIES; attempt++)); do
    if rsync -azh --checksum --timeout=300 \
      --files-from="$chunk_file" \
      --info=progress2,name \
      ./dist/ \
      "${HOST}:${cache_dir}/"; then
      return 0
    fi
    if (( attempt < DEPLOY_UPLOAD_RETRIES )); then
      echo "WARNING: 分片 ${chunk_file##*/} 第 ${attempt} 次上传失败，${DEPLOY_UPLOAD_RETRY_WAIT}s 后重试" >&2
      sleep "$DEPLOY_UPLOAD_RETRY_WAIT"
    fi
  done
  echo "ERROR: 分片 ${chunk_file##*/} 重试 ${DEPLOY_UPLOAD_RETRIES} 次仍失败" >&2
  return 1
}

pids=()
for i in $(seq 1 "$chunk_count"); do
  upload_chunk "$chunk_dir/chunk.$i" &
  pids+=("$!")
done
upload_rc=0
for pid in "${pids[@]}"; do
  wait "$pid" || upload_rc=1
done
[[ "$upload_rc" -eq 0 ]] || { echo "ERROR: 并行上传存在失败分片" >&2; exit 1; }
assert_deploy_lock_heartbeat
rm -rf "$work_dir"

echo "==> [5/6] 组装 release、校验文件集、GC 缓存并原子切换 current"
{
  cat "$ARTIFACT_SNAPSHOT_HELPER"
  cat <<'REMOTE'
set -euo pipefail
root="$1"
release="$2"
vm_hash="$3"
token="$4"
manifest="$5"
upload="$root/releases/$release.upload"
final="$root/releases/$release"
cache="$root/.transfer-cache"

test "$(cat "$root/.deploy-lock/owner")" = "$token"
test -s "$manifest"

mkdir -p "$upload"

# 服务器本地组装（不跨链路），只取 manifest 列出的文件
rsync -a --files-from="$manifest" "$cache/" "$upload/"

# 组装结果必须与 manifest 完全一致：防缓存文件缺失或多余
assembled="$(find "$upload" -type f -printf '%P\n' | LC_ALL=C sort)"
expected="$(LC_ALL=C sort -u "$manifest")"
if [[ "$assembled" != "$expected" ]]; then
  echo "ERROR: 组装后的 release 文件集与 manifest 不一致" >&2
  exit 1
fi

snapshot_release_artifacts "$root/artifacts" "$upload/artifacts"

# 缓存 GC：删除超过 7 天且不属于当前 manifest 的文件，随后清空目录。
# release 普通文件不引用缓存；共享内容寻址目录独立持久化，因此缓存回收安全。
find "$cache" -type f -mtime +7 -printf '%P\n' |
  LC_ALL=C sort -u |
  LC_ALL=C comm -23 - <(LC_ALL=C sort -u "$manifest") |
  while IFS= read -r stale; do
    case "$stale" in
      *[!A-Za-z0-9._/-]*|''|/*|../*|*/../*) continue ;;
    esac
    rm -f -- "$cache/$stale"
  done
find "$cache" -mindepth 1 -type d -empty -delete 2>/dev/null || true

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
} | ssh "$HOST" bash -s -- \
  "$REMOTE_PATH" "$RELEASE_ID" "$VM_HASH" "$DEPLOY_TOKEN" \
  "$cache_dir/.manifest-$RELEASE_ID"


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
  "${DEPLOY_URL}/companion.html?source=${SOURCE_ID}" |
  cmp - dist/companion.html; then
  echo "ERROR: 线上 companion.html 不是本次 release 的入口" >&2
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

while IFS= read -r relative; do
  if [[ ! "$relative" =~ ^artifacts/[a-f0-9]{64}/[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    echo "ERROR: 本次构建包含非内容寻址 artifact：${relative}" >&2
    rollback
    exit 1
  fi
  artifact_sha="${relative#artifacts/}"
  artifact_sha="${artifact_sha%%/*}"
  if [[ "$(sha256sum "dist/${relative}" | cut -d ' ' -f1)" != "$artifact_sha" ]]; then
    echo "ERROR: 本次构建 artifact 路径与内容 SHA-256 不一致：${relative}" >&2
    rollback
    exit 1
  fi
  if ! curl -fsS --max-time 60 "${DEPLOY_URL}/${relative}" |
    cmp - "dist/${relative}"; then
    echo "ERROR: 线上 artifact 与本次构建不一致：${relative}" >&2
    rollback
    exit 1
  fi
done < <(find dist/artifacts -type f -printf 'artifacts/%P\n' | LC_ALL=C sort)
assert_deploy_lock_heartbeat

echo "==> 发布完成：${DEPLOY_URL}/"
echo "    release: ${RELEASE_ID}"
echo "    VM assets: ${VM_HASH}"
echo "    previous: ${PREVIOUS_TARGET:-无（首次发布）}"
