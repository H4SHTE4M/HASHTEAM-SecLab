#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
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
if (
  sourceNotice.includes('{{SOURCE_ID}}') ||
  thirdPartyNotice.includes('{{SOURCE_ID}}') ||
  !sourceNotice.includes(`SHA256SUMS-${manifest.sourceId}`) ||
  !sourceNotice.includes(`hashteam-seclab-project-source-${manifest.sourceId}.tar.gz`)
) {
  fail('生产法律声明没有指向本 release 的版本化对应源码')
}
const combinedNotices = `${sourceNotice}\n${thirdPartyNotice}`
for (const requiredSourceReference of [
  'glibc_2.42.orig.tar.xz',
  'glibc_2.42-17.debian.tar.xz',
  'glibc_2.42-17.dsc',
  'glibc-2.42.tar.xz',
  'vm/toolchain-source/aosc-glibc32/',
]) {
  if (!combinedNotices.includes(requiredSourceReference)) {
    fail(`生产法律声明缺少静态链接 glibc 对应源码：${requiredSourceReference}`)
  }
}
for (const legacyPath of ['vm/rootfs.cpio.gz', 'vm/bzImage', 'v86/v86.wasm']) {
  const legacy = await stat(path.join(dist, legacyPath)).catch(() => null)
  if (legacy !== null) fail(`生产包仍包含固定文件名 VM 资源：dist/${legacyPath}`)
}

console.log(`✓ 生产产物：VM 资源组 ${manifest.hash} 内容寻址完整，固定文件名副本不存在`)
