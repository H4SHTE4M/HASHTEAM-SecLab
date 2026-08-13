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

function artifactRelativePath(artifact, source) {
  if (
    typeof artifact !== 'object' ||
    artifact === null ||
    Array.isArray(artifact) ||
    typeof artifact.path !== 'string' ||
    typeof artifact.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256)
  ) {
    fail(`${source} 包含无效的 downloadable artifact`)
  }
  const artifactName = path.posix.basename(artifact.path)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(artifactName)) {
    fail(`${source} 包含无法安全发布的 artifact 文件名`)
  }
  return `artifacts/${artifact.sha256}/${artifactName}`
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

async function verifyHtmlEntry(relativePath) {
  const html = (await requireFile(relativePath)).toString('utf8')
  const scriptPaths = [
    ...html.matchAll(/<script[^>]+src="\.\/([^"]+\.js)"/g),
  ].map((match) => match[1])
  const stylePaths = [
    ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\.\/([^"]+\.css)"[^>]*>/g),
  ].map((match) => match[1])
  const preloadPaths = [
    ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\.\/([^"]+\.js)"[^>]*>/g),
  ].map((match) => match[1])
  if (scriptPaths.length !== 1 || !/^assets\/[A-Za-z0-9_.-]+\.js$/.test(scriptPaths[0])) {
    fail(`生产 ${relativePath} 必须只有一个安全的相对路径 JavaScript 入口`)
  }
  if (
    stylePaths.length < 1 ||
    new Set(stylePaths).size !== stylePaths.length ||
    stylePaths.some((assetPath) => !/^assets\/[A-Za-z0-9_.-]+\.css$/.test(assetPath))
  ) {
    fail(`生产 ${relativePath} 必须引用至少一份且不重复的安全相对路径 CSS`)
  }
  if (
    new Set(preloadPaths).size !== preloadPaths.length ||
    preloadPaths.some((assetPath) => !/^assets\/[A-Za-z0-9_.-]+\.js$/.test(assetPath))
  ) {
    fail(`生产 ${relativePath} 包含不安全或重复的 modulepreload`)
  }
  await Promise.all([...stylePaths, ...preloadPaths].map(requireFile))
  return {
    html,
    script: (await requireFile(scriptPaths[0])).toString('utf8'),
  }
}

const indexEntry = await verifyHtmlEntry('index.html')
const companionEntry = await verifyHtmlEntry('companion.html')
const productionScripts = await Promise.all(
  (await readdir(path.join(dist, 'assets')))
    .filter((fileName) => /^[A-Za-z0-9_.-]+\.js$/.test(fileName))
    .map(async (fileName) => (await requireFile(`assets/${fileName}`)).toString('utf8')),
)
if (!productionScripts.some((script) => script.includes(manifest.base))) {
  fail('生产 JavaScript 没有引用清单中的内容寻址 VM 资产目录')
}
if (!productionScripts.some((script) => script.includes(manifest.sourceId))) {
  fail('生产 JavaScript 中的 Build ID 与 VM 资产清单不一致')
}
if (!companionEntry.html.includes('PwnHub Companion')) {
  fail('生产 companion.html 缺少伴侣入口标题')
}
await requireFile('favicon.svg')
const productionProfile = JSON.parse(
  await readFile(path.join(root, 'vm/profiles/production.json'), 'utf8'),
)
if (!Array.isArray(productionProfile.pwnhubLabs)) {
  fail('production profile 缺少 pwnhubLabs')
}
const expectedArtifactPaths = new Set()
const publishedLabIds = new Set()
for (const labId of productionProfile.pwnhubLabs) {
  if (typeof labId !== 'string' || !/^[a-z][a-z0-9-]*$/.test(labId)) {
    fail('production profile 包含非法 PwnHub labId')
  }
  if (publishedLabIds.has(labId)) {
    fail(`production profile 重复发布 PwnHub 实验：${labId}`)
  }
  publishedLabIds.add(labId)
  const labRoot = path.join(root, 'vm/labs/pwnhub', labId)
  const labManifest = JSON.parse(await readFile(path.join(labRoot, 'manifest.json'), 'utf8'))
  for (const artifact of labManifest.artifacts ?? []) {
    if (artifact.downloadable !== true) continue
    const relativePath = artifactRelativePath(artifact, labId)
    const artifactName = path.posix.basename(artifact.path)
    expectedArtifactPaths.add(relativePath)
    const packaged = await requireFile(relativePath)
    const source = await requireProjectFile(`vm/labs/pwnhub/${labId}/${artifactName}`)
    const actual = createHash('sha256').update(packaged).digest('hex')
    if (actual !== artifact.sha256 || !packaged.equals(source)) {
      fail(`生产 artifact、实验文件与 manifest 不一致：${labId}/${artifactName}`)
    }
  }
}

const pwnhubRoot = path.join(root, 'vm/labs/pwnhub')
for (const labEntry of await readdir(pwnhubRoot, { withFileTypes: true })) {
  if (!labEntry.isDirectory()) continue
  const labId = labEntry.name
  const labRoot = path.join(pwnhubRoot, labId)
  const labManifest = JSON.parse(await readFile(path.join(labRoot, 'manifest.json'), 'utf8'))
  const downloadableArtifacts = []
  for (const artifact of labManifest.artifacts ?? []) {
    if (artifact.downloadable !== true) continue
    artifactRelativePath(artifact, labId)
    downloadableArtifacts.push(artifact)
  }
  for (const step of labManifest.steps ?? []) {
    const companion = step?.companion
    if (typeof companion !== 'object' || companion === null || Array.isArray(companion)) {
      continue
    }
    const companionArtifact = companion.artifact
    if (
      companion.labId !== labId ||
      typeof companionArtifact !== 'object' ||
      companionArtifact === null ||
      Array.isArray(companionArtifact) ||
      typeof companionArtifact.name !== 'string' ||
      typeof companionArtifact.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(companionArtifact.sha256)
    ) {
      fail(`${labId} 包含无效的 companion artifact`)
    }
    const matchingArtifact = downloadableArtifacts.find(
      (artifact) =>
        path.posix.basename(artifact.path) === companionArtifact.name &&
        artifact.sha256 === companionArtifact.sha256,
    )
    if (matchingArtifact === undefined) {
      fail(`${labId} companion artifact 未绑定同实验的 downloadable artifact`)
    }
    const relativePath = artifactRelativePath(matchingArtifact, labId)
    if (companionArtifact.downloadUrl !== `/${relativePath}`) {
      fail(`${labId} companion downloadUrl 未使用 manifest SHA-256 内容寻址`)
    }
    const source = await requireProjectFile(
      `vm/labs/pwnhub/${labId}/${companionArtifact.name}`,
    )
    const actual = createHash('sha256').update(source).digest('hex')
    if (actual !== companionArtifact.sha256) {
      fail(`${labId} companion artifact 与 manifest SHA-256 不一致`)
    }
    if (publishedLabIds.has(labId) && !expectedArtifactPaths.has(relativePath)) {
      fail(`${labId} companion artifact 未进入生产构建输出`)
    }
  }
}

const actualArtifactPaths = []
async function collectPackagedArtifacts(directory = path.join(dist, 'artifacts')) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await collectPackagedArtifacts(absolute)
    } else if (entry.isFile()) {
      actualArtifactPaths.push(path.relative(dist, absolute).split(path.sep).join('/'))
    }
  }
}
await collectPackagedArtifacts()
if (
  JSON.stringify(actualArtifactPaths.sort()) !==
  JSON.stringify([...expectedArtifactPaths].sort())
) {
  fail('生产 artifacts 与当前 production profile 的 downloadable 清单不一致')
}
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
  'vm/toolchain-source/htcheck/toolchain.lock',
  'vm/binary-tools/build-binutils.sh',
  'vm/binary-tools/binutils-2.42.lock',
  'vm/binary-tools/build-gdb.sh',
  'vm/binary-tools/gdb-15.1.lock',
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
    'binutils-2.42.tar.xz',
    'f6e4d41fd5fc778b06b7891457b3620da5ecea1006c6a4a41ae998109f85a800',
    'https://ftp.gnu.org/gnu/binutils/binutils-2.42.tar.xz',
  ],
  [
    'gdb-15.1.tar.xz',
    '38254eacd4572134bca9c5a5aa4d4ca564cbbd30c369d881f733fb6b903354f2',
    'https://ftp.gnu.org/gnu/gdb/gdb-15.1.tar.xz',
  ],
  [
    'gcc-13_13.3.0.orig.tar.gz',
    '3b85d91bf38d1b858d9d01134f4046b3359731968ed4e6e912d29717a35d1a46',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gcc-13/13.3.0-6ubuntu2%7E24.04.1/gcc-13_13.3.0.orig.tar.gz',
  ],
  [
    'gcc-13_13.3.0-6ubuntu2~24.04.1.debian.tar.xz',
    '5523658f272ad6d15a83b6e26d178fbd5cb7709ec7ce2ca52b0c843e19c228e3',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gcc-13/13.3.0-6ubuntu2%7E24.04.1/gcc-13_13.3.0-6ubuntu2%7E24.04.1.debian.tar.xz',
  ],
  [
    'gcc-13_13.3.0-6ubuntu2~24.04.1.dsc',
    '86b4012c312ac13e3e092877719a62a5b5dbab082ae7e9680780a25c6a13ddc6',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gcc-13/13.3.0-6ubuntu2%7E24.04.1/gcc-13_13.3.0-6ubuntu2%7E24.04.1.dsc',
  ],
  [
    'gmp_6.3.0+dfsg.orig.tar.xz',
    'bd2966e6d277f79328e894a5a9f3ba3fbf2ed2be81def5f48623e30c23fb1572',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gmp/2%3A6.3.0%2Bdfsg-2ubuntu6.1/gmp_6.3.0%2Bdfsg.orig.tar.xz',
  ],
  [
    'gmp_6.3.0+dfsg-2ubuntu6.1.debian.tar.xz',
    '0a7592ee94876fcc0dba60c9a9fba806a72752c104c04d553803e1b7a97026a3',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gmp/2%3A6.3.0%2Bdfsg-2ubuntu6.1/gmp_6.3.0%2Bdfsg-2ubuntu6.1.debian.tar.xz',
  ],
  [
    'gmp_6.3.0+dfsg-2ubuntu6.1.dsc',
    '7fdd2464ee453296e33598dad6f84dd489640c08f50552389469bcf90537582e',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gmp/2%3A6.3.0%2Bdfsg-2ubuntu6.1/gmp_6.3.0%2Bdfsg-2ubuntu6.1.dsc',
  ],
  [
    'mpfr4_4.2.1.orig.tar.xz',
    '277807353a6726978996945af13e52829e3abd7a9a5b7fb2793894e18f1fcbb2',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/mpfr4/4.2.1-1build1.1/mpfr4_4.2.1.orig.tar.xz',
  ],
  [
    'mpfr4_4.2.1-1build1.1.debian.tar.xz',
    '55770c471715c710690129e45c627d77da05547a8f6faee81dd420a9b2b5fded',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/mpfr4/4.2.1-1build1.1/mpfr4_4.2.1-1build1.1.debian.tar.xz',
  ],
  [
    'mpfr4_4.2.1-1build1.1.dsc',
    '9adabba2fbe45f0705b630b9b225752d945718ed4742b1c5b9fb1aa0fbcd0766',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/mpfr4/4.2.1-1build1.1/mpfr4_4.2.1-1build1.1.dsc',
  ],
  [
    'expat_2.6.1.orig.tar.gz',
    '14113ed69357172a0bf5a268793c8b5b01afc77c7a2e5fb8dd0b06cb87c02c4a',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/expat/2.6.1-2ubuntu0.4/expat_2.6.1.orig.tar.gz',
  ],
  [
    'expat_2.6.1-2ubuntu0.4.debian.tar.xz',
    '8a24bd6c87fe292a2f00a2df71f7d2bbe3713fa63b1952c8552cdac4288d10fd',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/expat/2.6.1-2ubuntu0.4/expat_2.6.1-2ubuntu0.4.debian.tar.xz',
  ],
  [
    'expat_2.6.1-2ubuntu0.4.dsc',
    'a25d3fde103454ad5d34d4770bd5adb60bb5872da775df74cad193b5c4de1dff',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/expat/2.6.1-2ubuntu0.4/expat_2.6.1-2ubuntu0.4.dsc',
  ],
  [
    'ncurses_6.4+20240113.orig.tar.gz',
    '37a12a0f8ae2605012c9a164dd286b0cfa02b51b5055836d09eb3d597fc351b1',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/ncurses/6.4%2B20240113-1ubuntu2.1/ncurses_6.4%2B20240113.orig.tar.gz',
  ],
  [
    'ncurses_6.4+20240113-1ubuntu2.1.debian.tar.xz',
    '5d86811c8c9c3fab79c9d644a00ee31b4113b969d32b0bb05b5d3e7c2bcea9ac',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/ncurses/6.4%2B20240113-1ubuntu2.1/ncurses_6.4%2B20240113-1ubuntu2.1.debian.tar.xz',
  ],
  [
    'ncurses_6.4+20240113-1ubuntu2.1.dsc',
    '87d71c553da108e83c4985e0bca8b944db2dd7931105e511a61e77faf1b415b7',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/ncurses/6.4%2B20240113-1ubuntu2.1/ncurses_6.4%2B20240113-1ubuntu2.1.dsc',
  ],
  [
    'zlib_1.3.dfsg.orig.tar.xz',
    '5eea0322c1c21c75cad3b607ac1c43ff5c71e014b8ac4a34300b5e2b80d02e70',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/zlib/1%3A1.3.dfsg-3.1ubuntu2.1/zlib_1.3.dfsg.orig.tar.xz',
  ],
  [
    'zlib_1.3.dfsg-3.1ubuntu2.1.debian.tar.xz',
    '958c7031c02f894516492954153c8d760d94e20a4039e48ca7231880b913ae26',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/zlib/1%3A1.3.dfsg-3.1ubuntu2.1/zlib_1.3.dfsg-3.1ubuntu2.1.debian.tar.xz',
  ],
  [
    'zlib_1.3.dfsg-3.1ubuntu2.1.dsc',
    'd083d6e1eb6f7f0dc5b107b0cc6b898f097947e1317769553f1c5c5d71ea5073',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/zlib/1%3A1.3.dfsg-3.1ubuntu2.1/zlib_1.3.dfsg-3.1ubuntu2.1.dsc',
  ],
  [
    'glibc_2.39.orig.tar.xz',
    'f77bd47cf8170c57365ae7bf86696c118adb3b120d3259c64c502d3dc1e2d926',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/glibc/2.39-0ubuntu8/glibc_2.39.orig.tar.xz',
  ],
  [
    'glibc_2.39-0ubuntu8.debian.tar.xz',
    '24d8627f34850f05554158b085499d255c67af27be9762d6a911b168852c1dd2',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/glibc/2.39-0ubuntu8/glibc_2.39-0ubuntu8.debian.tar.xz',
  ],
  [
    'glibc_2.39-0ubuntu8.dsc',
    'af44b50b4aba75916f920337523d89698c465fafb720268bb87b2555000bea7a',
    'https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/glibc/2.39-0ubuntu8/glibc_2.39-0ubuntu8.dsc',
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
  'vm/toolchain-source/htcheck/toolchain.lock',
  'scripts/pack-initramfs.py',
  'vm/binary-tools/build-binutils.sh',
  'vm/binary-tools/binutils-2.42.lock',
  'vm/binary-tools/build-gdb.sh',
  'vm/binary-tools/gdb-15.1.lock',
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
for (const source of ['/', '/index.html', '/companion.html', '/vm-assets.json', '/legal/*']) {
  if (!configuredHeader(source, 'Cache-Control', 'no-store')) {
    fail(`edgeone.json 缺少禁止缓存规则：${source}`)
  }
}
for (const source of ['/assets/*', '/vm-assets/*', '/artifacts/*']) {
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
