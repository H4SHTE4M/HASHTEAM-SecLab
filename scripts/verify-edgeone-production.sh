#!/usr/bin/env bash
#
# EdgeOne CLI 返回成功后，对固定自定义域名执行 release 收敛与逐字节验收。
# 此脚本不调用未公开的回滚 API；失败时输出 Makers 控制台人工恢复提示。
set -euo pipefail

DEPLOY_URL="${EDGEONE_DEPLOY_URL:-}"
SOURCE_ID="${EXPECTED_SOURCE_ID:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

[[ "$DEPLOY_URL" =~ ^https://[A-Za-z0-9.-]+$ ]] || {
  echo "ERROR: EDGEONE_DEPLOY_URL 必须是无路径、无尾斜杠的 HTTPS 地址" >&2
  exit 2
}
[[ "$SOURCE_ID" =~ ^[a-f0-9]{40}$ ]] || {
  echo "ERROR: EXPECTED_SOURCE_ID 必须是完整 Git SHA" >&2
  exit 2
}
for required_command in \
  curl cmp node awk grep tail find unlink rmdir mktemp seq sleep wc; do
  command -v "$required_command" >/dev/null || {
    echo "ERROR: 缺少 EdgeOne 验收命令：${required_command}" >&2
    exit 1
  }
done

temporary_dir="$(mktemp -d)"
cleanup_and_report() {
  status=$?
  trap - EXIT
  if [[ -d "$temporary_dir" ]]; then
    find "$temporary_dir" -type f -exec unlink {} \; || true
    rmdir "$temporary_dir" || true
  fi
  if [[ "$status" -ne 0 ]]; then
    echo "ERROR: EdgeOne Production 发布或验收失败。" >&2
    echo "恢复：打开 EdgeOne Makers 控制台，在 seclabtest 项目的 Production 部署记录中手工重部署上一成功版本。" >&2
    echo "现有 Nginx 主站未由此 job 修改，可继续作为过渡期入口。" >&2
  fi
  exit "$status"
}
trap cleanup_and_report EXIT

cd "$PROJECT_DIR"
node scripts/verify-dist.mjs
dist_source_id="$(
  node -e "const m=require('./dist/vm-assets.json'); process.stdout.write(m.sourceId)"
)"
[[ "$dist_source_id" == "$SOURCE_ID" ]] || {
  echo "ERROR: dist source ID 与待验收提交不一致" >&2
  exit 1
}
VM_HASH="$(
  node -e "const m=require('./dist/vm-assets.json'); process.stdout.write(m.hash)"
)"
[[ "$VM_HASH" =~ ^[a-f0-9]{64}$ ]] || {
  echo "ERROR: VM 资产组哈希无效" >&2
  exit 1
}

fetch_and_compare() {
  local request_path="$1"
  local local_file="$2"
  local timeout="${3:-30}"
  local output_file="$temporary_dir/download"
  curl -fsS --max-time "$timeout" \
    -H 'Cache-Control: no-cache' \
    "${DEPLOY_URL}${request_path}" \
    -o "$output_file"
  if ! cmp "$output_file" "$local_file"; then
    echo "ERROR: EdgeOne 线上文件与 release 不一致：${request_path}" >&2
    return 1
  fi
}

header_value() {
  local header_file="$1"
  local requested_name="$2"
  awk -F ':' -v requested_name="$requested_name" '
    tolower($1) == tolower(requested_name) {
      sub(/^[^:]*:[[:space:]]*/, "")
      sub(/\r$/, "")
      print
    }
  ' "$header_file" | tail -n 1
}

require_header() {
  local header_file="$1"
  local name="$2"
  local expected="$3"
  local actual
  actual="$(header_value "$header_file" "$name")"
  if [[ "$actual" != "$expected" ]]; then
    echo "ERROR: ${name} 响应头不匹配；期望 '${expected}'，实际 '${actual:-missing}'" >&2
    return 1
  fi
}

require_security_headers() {
  local header_file="$1"
  require_header "$header_file" Strict-Transport-Security 'max-age=31536000'
  require_header "$header_file" Content-Security-Policy \
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  require_header "$header_file" X-Content-Type-Options nosniff
  require_header "$header_file" Referrer-Policy no-referrer
  require_header "$header_file" Permissions-Policy \
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  require_header "$header_file" X-Frame-Options DENY
  require_header "$header_file" Cross-Origin-Opener-Policy same-origin
  require_header "$header_file" Cross-Origin-Resource-Policy same-origin
}

echo "==> 等待 EdgeOne 自定义域名收敛到 ${SOURCE_ID}"
release_ready=0
for attempt in $(seq 1 30); do
  manifest_probe="$temporary_dir/manifest-probe"
  if curl -fsS --max-time 20 \
    -H 'Cache-Control: no-cache' \
    "${DEPLOY_URL}/vm-assets.json?release=${SOURCE_ID}&attempt=${attempt}" \
    -o "$manifest_probe" &&
    node -e "
      const fs = require('node:fs')
      const manifest = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'))
      process.exit(manifest.sourceId === process.argv[2] ? 0 : 1)
    " "$manifest_probe" "$SOURCE_ID"; then
    release_ready=1
    break
  fi
  if [[ "$attempt" -lt 30 ]]; then
    echo "    尚未收敛（${attempt}/30），10 秒后重试"
    sleep 10
  fi
done
if [[ "$release_ready" -ne 1 ]]; then
  echo "ERROR: EdgeOne 自定义域名在 5 分钟内未收敛到本次提交" >&2
  exit 1
fi

echo "==> 逐字节核对首页、清单、法律声明和六个 VM 文件"
fetch_and_compare "/?release=${SOURCE_ID}" dist/index.html
fetch_and_compare "/index.html?release=${SOURCE_ID}" dist/index.html
fetch_and_compare "/vm-assets.json?release=${SOURCE_ID}" dist/vm-assets.json
for legal_file in SOURCE_CODE.md THIRD_PARTY_NOTICES.md; do
  fetch_and_compare \
    "/legal/${legal_file}?release=${SOURCE_ID}" \
    "dist/legal/${legal_file}"
done
for relative_path in \
  v86/libv86.js \
  v86/v86.wasm \
  v86/v86-fallback.wasm \
  v86/bios/seabios-256k.bin \
  vm/bzImage \
  vm/rootfs.cpio.gz; do
  fetch_and_compare \
    "/vm-assets/${VM_HASH}/${relative_path}" \
    "dist/vm-assets/${VM_HASH}/${relative_path}" \
    60
done

echo "==> 验证安全头、缓存、WASM MIME 与 Range"
root_headers="$temporary_dir/root.headers"
curl -fsSI --max-time 20 "${DEPLOY_URL}/" -o "$root_headers"
grep -Eq '^HTTP/[0-9.]+ 200([[:space:]]|$)' "$root_headers" || {
  echo "ERROR: EdgeOne 首页没有直接返回 HTTP 200" >&2
  exit 1
}
require_security_headers "$root_headers"
require_header "$root_headers" Cache-Control no-store

for no_store_path in index.html vm-assets.json legal/SOURCE_CODE.md legal/THIRD_PARTY_NOTICES.md; do
  no_store_headers="$temporary_dir/no-store.headers"
  curl -fsSI --max-time 20 "${DEPLOY_URL}/${no_store_path}" \
    -o "$no_store_headers"
  require_header "$no_store_headers" Cache-Control no-store
done

app_asset="$(
  node -e "
    const fs = require('node:fs')
    const html = fs.readFileSync('dist/index.html', 'utf8')
    const match = html.match(/<script[^>]+src=\"\\.\\/(assets\\/[^\\\"]+\\.js)\"/)
    if (!match) process.exit(1)
    process.stdout.write(match[1])
  "
)"
app_headers="$temporary_dir/app.headers"
curl -fsSI --max-time 20 "${DEPLOY_URL}/${app_asset}" -o "$app_headers"
require_header "$app_headers" Cache-Control \
  'public, max-age=31536000, immutable'

wasm_path="/vm-assets/${VM_HASH}/v86/v86.wasm"
wasm_headers="$temporary_dir/wasm.headers"
curl -fsSI --max-time 20 "${DEPLOY_URL}${wasm_path}" -o "$wasm_headers"
require_security_headers "$wasm_headers"
require_header "$wasm_headers" Cache-Control \
  'public, max-age=31536000, immutable'
wasm_content_type="$(header_value "$wasm_headers" Content-Type)"
if [[ "$wasm_content_type" != 'application/wasm' &&
  "$wasm_content_type" != 'application/wasm; charset=utf-8' ]]; then
  echo "ERROR: WASM Content-Type 无效：${wasm_content_type:-missing}" >&2
  exit 1
fi

range_headers="$temporary_dir/range.headers"
range_body="$temporary_dir/range.body"
curl -fsS --max-time 20 \
  --range 0-0 \
  -D "$range_headers" \
  "${DEPLOY_URL}${wasm_path}" \
  -o "$range_body"
grep -Eq '^HTTP/[0-9.]+ 206([[:space:]]|$)' "$range_headers" || {
  echo "ERROR: WASM Range 请求没有返回 HTTP 206" >&2
  exit 1
}
# 206、精确 Content-Range 和单字节响应体是 Range 能力的直接证明。
# Accept-Ranges 只是能力提示，EdgeOne 新版本收敛期间可能暂时不返回它。
grep -Eqi '^content-range:[[:space:]]*bytes 0-0/[1-9][0-9]*[[:space:]]*$' \
  "$range_headers" || {
  echo "ERROR: WASM Content-Range 响应无效" >&2
  exit 1
}
[[ "$(wc -c < "$range_body")" -eq 1 ]] || {
  echo "ERROR: WASM Range 响应体不是一个字节" >&2
  exit 1
}

echo "==> 验证法律声明中的固定 Git commit 可访问"
curl -fsSL --max-time 30 \
  -o /dev/null \
  "https://github.com/H4SHTE4M/HASHTEAM-SecLab/tree/${SOURCE_ID}"

echo "✓ EdgeOne Production 验收完成：${DEPLOY_URL}/ (${SOURCE_ID})"
