#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const expectedAssets = {
  libv86: 'v86/libv86.js',
  wasm: 'v86/v86.wasm',
  wasmFallback: 'v86/v86-fallback.wasm',
  bios: 'v86/bios/seabios-256k.bin',
  bzimage: 'vm/bzImage',
  initrd: 'vm/rootfs.cpio.gz',
}
const MAX_MAKERS_FILES = 20_000
const MAX_MAKERS_FILE_SIZE = 25 * 1024 * 1024

function fail(message) {
  throw new Error(message)
}

async function requireFile(relativePath) {
  const absolutePath = path.join(dist, relativePath)
  const info = await stat(absolutePath).catch(() => null)
  if (info === null || !info.isFile() || info.size === 0) {
    fail(`生产产物缺失或为空：dist/${relativePath}`)
  }
  return readFile(absolutePath)
}

async function requireProjectFile(relativePath) {
  const absolutePath = path.join(root, relativePath)
  const info = await stat(absolutePath).catch(() => null)
  if (info === null || !info.isFile() || info.size === 0) {
    fail(`仓库缺少对应源码或构建材料：${relativePath}`)
  }
  return readFile(absolutePath)
}

let distFileCount = 0
async function verifyDistTree(directory = dist) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    const relativePath = path.relative(dist, absolutePath)
    const info = await lstat(absolutePath)
    if (info.isSymbolicLink()) {
      fail(`生产产物不允许包含符号链接：dist/${relativePath}`)
    }
    if (info.isDirectory()) {
      await verifyDistTree(absolutePath)
      continue
    }
    if (!info.isFile()) {
      fail(`生产产物包含不支持的文件类型：dist/${relativePath}`)
    }
    distFileCount += 1
    if (distFileCount > MAX_MAKERS_FILES) {
      fail(`生产产物超过 Makers 的 ${MAX_MAKERS_FILES} 个文件限制`)
    }
    if (info.size > MAX_MAKERS_FILE_SIZE) {
      fail(`生产产物单文件超过 Makers 的 25 MiB 限制：dist/${relativePath}`)
    }
  }
}

await verifyDistTree()

const manifest = JSON.parse(await readFile(path.join(dist, 'vm-assets.json'), 'utf8'))
if (manifest.version !== 1 || !/^[a-f0-9]{64}$/.test(manifest.hash)) {
  fail('dist/vm-assets.json 的版本或组哈希无效')
}
if (!/^[a-f0-9]{40}(?:-dirty)?$/.test(manifest.sourceId ?? '')) {
  fail('dist/vm-assets.json 缺少可追溯的完整 Git source ID')
}
if (manifest.base !== `vm-assets/${manifest.hash}/`) {
  fail('dist/vm-assets.json 的内容寻址目录与组哈希不一致')
}

const requiredKeys = Object.keys(expectedAssets)
const actualAssetKeys = Object.keys(manifest.assets ?? {}).sort()
const actualChecksumKeys = Object.keys(manifest.sha256 ?? {}).sort()
const expectedAssetKeys = [...requiredKeys].sort()
const expectedChecksumKeys = Object.values(expectedAssets).sort()
if (JSON.stringify(actualAssetKeys) !== JSON.stringify(expectedAssetKeys)) {
  fail('VM 资产清单包含缺失或未审核的资产键')
}
if (JSON.stringify(actualChecksumKeys) !== JSON.stringify(expectedChecksumKeys)) {
  fail('VM 资产清单包含缺失或未审核的校验项')
}
const groupHash = createHash('sha256')
for (const key of requiredKeys) {
  const relativePath = manifest.assets?.[key]
  const expected = manifest.sha256?.[relativePath]
  if (relativePath !== expectedAssets[key]) {
    fail(`VM 资产清单中的 ${key} 路径不符合发布约定`)
  }
  if (typeof relativePath !== 'string' || !/^[a-f0-9]{64}$/.test(expected ?? '')) {
    fail(`VM 资产清单缺少 ${key}`)
  }
  const source = await requireFile(`${manifest.base}${relativePath}`)
  const actual = createHash('sha256').update(source).digest('hex')
  if (actual !== expected) fail(`VM 资产哈希不匹配：${relativePath}`)
  if (key === 'wasm' || key === 'wasmFallback') {
    try {
      await WebAssembly.compile(source)
    } catch {
      fail(`VM WebAssembly 资产无法编译：${relativePath}`)
    }
  }
  groupHash.update(relativePath)
  groupHash.update(source)
}
if (groupHash.digest('hex') !== manifest.hash) {
  fail('VM 资产目录名不是清单内容计算出的组哈希')
}

const index = (await requireFile('index.html')).toString('utf8')
const scriptPaths = [
  ...index.matchAll(/<script[^>]+src="\.\/([^"]+\.js)"/g),
].map((match) => match[1])
const stylePaths = [
  ...index.matchAll(/<link[^>]+href="\.\/([^"]+\.css)"[^>]*>/g),
].map((match) => match[1])
if (scriptPaths.length !== 1 || !/^assets\/[A-Za-z0-9_.-]+\.js$/.test(scriptPaths[0])) {
  fail('生产 index.html 必须只有一个安全的相对路径 JavaScript 入口')
}
if (stylePaths.length !== 1 || !/^assets\/[A-Za-z0-9_.-]+\.css$/.test(stylePaths[0])) {
  fail('生产 index.html 必须只有一个安全的相对路径 CSS 入口')
}
const scriptPath = scriptPaths[0]
const appScript = (await requireFile(scriptPath)).toString('utf8')
await requireFile(stylePaths[0])
if (!appScript.includes(manifest.base)) {
  fail('生产 JavaScript 没有引用清单中的内容寻址 VM 资产目录')
}
if (!appScript.includes(manifest.sourceId)) {
  fail('生产 JavaScript 中的 Build ID 与 VM 资产清单不一致')
}
await requireFile('favicon.svg')
const sourceNotice = (await requireFile('legal/SOURCE_CODE.md')).toString('utf8')
const thirdPartyNotice = (await requireFile('legal/THIRD_PARTY_NOTICES.md')).toString('utf8')
const releaseSourceUrl =
  `https://github.com/H4SHTE4M/HASHTEAM-SecLab/tree/${manifest.sourceId}`
const releaseArchiveUrl =
  `https://github.com/H4SHTE4M/HASHTEAM-SecLab/archive/${manifest.sourceId}.tar.gz`
if (
  sourceNotice.includes('{{SOURCE_ID}}') ||
  thirdPartyNotice.includes('{{SOURCE_ID}}') ||
  !sourceNotice.includes(releaseSourceUrl) ||
  !sourceNotice.includes(releaseArchiveUrl) ||
  !thirdPartyNotice.includes(releaseSourceUrl)
) {
  fail('生产法律声明没有指向本 release 的固定 Git 对应源码')
}
const combinedNotices = `${sourceNotice}\n${thirdPartyNotice}`
for (const requiredSourceReference of [
  'scripts/prepare-corresponding-source.sh',
  'vm/busybox-suid.config',
  'vm/busybox-suid.sha256',
  'vm/build.sh',
  'vm/suid-toolchain.lock',
  'vm/toolchain-source/aosc-glibc32/',
  'vm/toolchain-source/aosc-glibc32/SHA256SUMS',
]) {
  if (!combinedNotices.includes(requiredSourceReference)) {
    fail(`生产法律声明缺少对应源码引用：${requiredSourceReference}`)
  }
}
const correspondingSources = [
  [
    'linux-6.12.98.tar.xz',
    'a62b6a2d207ff72510e5f47156b7078e1e71797357412411b8e4fff97fc8f4c7',
    'https://mirrors.aliyun.com/linux-kernel/v6.x/linux-6.12.98.tar.xz',
  ],
  [
    'busybox_1.38.0.orig.tar.bz2',
    '34f9ea6ff8636f2c9241153b9114eefa9e65674a45318ae1ef95bb5f31c53bb2',
    'https://deb.debian.org/debian/pool/main/b/busybox/busybox_1.38.0.orig.tar.bz2',
  ],
  [
    'busybox_1.38.0-3.debian.tar.xz',
    '9493090e7456abb7707a356ab71a810065b555fdeddc6f71d4dd1dc09ebc342f',
    'https://deb.debian.org/debian/pool/main/b/busybox/busybox_1.38.0-3.debian.tar.xz',
  ],
  [
    'busybox_1.38.0-3.dsc',
    '7c3b52b1dd3792b57681b26adfdaefab77de25f1d453e8ffb78187624a3bc57c',
    'https://deb.debian.org/debian/pool/main/b/busybox/busybox_1.38.0-3.dsc',
  ],
  [
    'glibc_2.42.orig.tar.xz',
    '69c1e915c8edd75981cbfc6b7654e8fc4e52a48d06b9f706f463492749a9b6fb',
    'https://deb.debian.org/debian/pool/main/g/glibc/glibc_2.42.orig.tar.xz',
  ],
  [
    'glibc_2.42-17.debian.tar.xz',
    '89b79a67661b89a4160ef1b2f01a1eb7b428c686f18de463581b408ba9765e62',
    'https://deb.debian.org/debian/pool/main/g/glibc/glibc_2.42-17.debian.tar.xz',
  ],
  [
    'glibc_2.42-17.dsc',
    'd004ab83368dec1f86aec110d13d1eaf21b261416e5f7c74f18c8b9ce2d02b79',
    'https://deb.debian.org/debian/pool/main/g/glibc/glibc_2.42-17.dsc',
  ],
  [
    'glibc-2.42.tar.xz',
    'd1775e32e4628e64ef930f435b67bb63af7599acb6be2b335b9f19f16509f17f',
    'https://ftp.gnu.org/gnu/glibc/glibc-2.42.tar.xz',
  ],
  [
    'seabios_1.16.3.orig.tar.gz',
    '374dd8f6938e1673b084de4b2964514f7f9fd1b60eca1c12066c484d26286272',
    'https://deb.debian.org/debian/pool/main/s/seabios/seabios_1.16.3.orig.tar.gz',
  ],
  [
    'seabios_1.16.3-2.debian.tar.xz',
    '237583c39828f9f5f7bb6f40ba2321f632911ea9891ddc79f54d5e4f0c7b726d',
    'https://deb.debian.org/debian/pool/main/s/seabios/seabios_1.16.3-2.debian.tar.xz',
  ],
  [
    'seabios_1.16.3-2.dsc',
    '1a95960c0f7e5c5a4c04bed1b5c3359b7518099b15a4ab8e8d37f50b8c3f6b36',
    'https://deb.debian.org/debian/pool/main/s/seabios/seabios_1.16.3-2.dsc',
  ],
]
const sourcePreparationScript = (
  await requireProjectFile('scripts/prepare-corresponding-source.sh')
).toString('utf8')
for (const [fileName, sha256, upstreamUrl] of correspondingSources) {
  if (
    !sourceNotice.includes(fileName) ||
    !sourceNotice.includes(sha256) ||
    !sourceNotice.includes(upstreamUrl)
  ) {
    fail(`生产源码声明缺少固定文件名、SHA-256 或上游 URL：${fileName}`)
  }
  if (
    !sourcePreparationScript.includes(fileName) ||
    !sourcePreparationScript.includes(sha256) ||
    !sourcePreparationScript.includes(upstreamUrl)
  ) {
    fail(`对应源码下载脚本与法律声明不一致：${fileName}`)
  }
}

for (const projectMaterial of [
  'vm/busybox-suid.config',
  'vm/busybox-suid.sha256',
  'vm/build.sh',
  'vm/suid-toolchain.lock',
  'scripts/pack-initramfs.py',
  'vm/toolchain-source/aosc-glibc32/SHA256SUMS',
]) {
  await requireProjectFile(projectMaterial)
}
const recipeRoot = path.join(root, 'vm/toolchain-source/aosc-glibc32')
const recipeChecksumList = (
  await requireProjectFile('vm/toolchain-source/aosc-glibc32/SHA256SUMS')
)
  .toString('utf8')
  .trim()
  .split('\n')
if (recipeChecksumList.length !== 13) {
  fail('AOSC glibc+32 配方校验清单条目数量异常')
}
for (const checksumLine of recipeChecksumList) {
  const match = checksumLine.match(/^([a-f0-9]{64})  ([A-Za-z0-9._/-]+)$/)
  if (!match || match[2].split('/').includes('..')) {
    fail('AOSC glibc+32 配方校验清单包含非法条目')
  }
  const recipeFile = await readFile(path.join(recipeRoot, match[2])).catch(
    () => null,
  )
  if (
    recipeFile === null ||
    createHash('sha256').update(recipeFile).digest('hex') !== match[1]
  ) {
    fail(`AOSC glibc+32 配方文件校验失败：${match[2]}`)
  }
}

const sourceDirectory = await stat(path.join(dist, 'sources')).catch(() => null)
if (sourceDirectory !== null) {
  fail('生产包不应携带 sources/；对应源码必须指向固定 Git release')
}

const edgeOneConfig = await requireFile('edgeone.json')
const trackedEdgeOneConfig = await readFile(path.join(root, 'edgeone.json'))
if (!edgeOneConfig.equals(trackedEdgeOneConfig)) {
  fail('dist/edgeone.json 与受版本控制的配置不一致')
}
const parsedEdgeOneConfig = JSON.parse(edgeOneConfig.toString('utf8'))
if (
  JSON.stringify(Object.keys(parsedEdgeOneConfig).sort()) !==
  JSON.stringify(['headers'])
) {
  fail('edgeone.json 只能包含已审核的 headers 配置')
}
const edgeOneHeaderRules = parsedEdgeOneConfig.headers
if (!Array.isArray(edgeOneHeaderRules)) {
  fail('edgeone.json 缺少 headers 规则')
}
const totalEdgeOneHeaders = edgeOneHeaderRules.reduce(
  (count, rule) => count + (Array.isArray(rule.headers) ? rule.headers.length : 0),
  0,
)
if (totalEdgeOneHeaders > 30) {
  fail('edgeone.json 超过 Makers 的 30 个 header 限制')
}
function configuredHeader(source, key, value) {
  return edgeOneHeaderRules.some(
    (rule) =>
      rule.source === source &&
      Array.isArray(rule.headers) &&
      rule.headers.some((header) => header.key === key && header.value === value),
  )
}
for (const [key, value] of [
  ['Strict-Transport-Security', 'max-age=31536000'],
  [
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  ],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'no-referrer'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'],
  ['X-Frame-Options', 'DENY'],
  ['Cross-Origin-Opener-Policy', 'same-origin'],
  ['Cross-Origin-Resource-Policy', 'same-origin'],
]) {
  if (!configuredHeader('/*', key, value)) {
    fail(`edgeone.json 缺少全站安全头：${key}`)
  }
}
for (const source of ['/', '/index.html', '/vm-assets.json', '/legal/*']) {
  if (!configuredHeader(source, 'Cache-Control', 'no-store')) {
    fail(`edgeone.json 缺少禁止缓存规则：${source}`)
  }
}
for (const source of ['/assets/*', '/vm-assets/*']) {
  if (
    !configuredHeader(
      source,
      'Cache-Control',
      'public, max-age=31536000, immutable',
    )
  ) {
    fail(`edgeone.json 缺少不可变缓存规则：${source}`)
  }
}
for (const legacyPath of ['vm/rootfs.cpio.gz', 'vm/bzImage', 'v86/v86.wasm']) {
  const legacy = await stat(path.join(dist, legacyPath)).catch(() => null)
  if (legacy !== null) fail(`生产包仍包含固定文件名 VM 资源：dist/${legacyPath}`)
}

// 验证 EdgeOne Makers Edge Functions 已输出到 dist/ 且与受版本控制源码一致
const edgeFunctionsRoot = path.join(root, 'edge-functions')
const trackedEdgeFunctions = []
async function collectEdgeFunctions(dir, base) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectEdgeFunctions(absolute, base)
    } else if (entry.isFile()) {
      trackedEdgeFunctions.push(path.relative(base, absolute).split(path.sep).join('/'))
    }
  }
}
await collectEdgeFunctions(edgeFunctionsRoot, edgeFunctionsRoot)
if (trackedEdgeFunctions.length === 0) {
  fail('edge-functions/ 目录为空，缺少 Edge Function 源码')
}
for (const relativePath of trackedEdgeFunctions) {
  const distSource = await requireFile(`edge-functions/${relativePath}`)
  const trackedSource = await readFile(path.join(edgeFunctionsRoot, relativePath))
  if (!distSource.equals(trackedSource)) {
    fail(`dist/edge-functions/${relativePath} 与受版本控制源码不一致`)
  }
}
console.log(
  `✓ 生产产物：${distFileCount} 个常规文件，VM 资源组 ${manifest.hash} 内容寻址完整`,
)
