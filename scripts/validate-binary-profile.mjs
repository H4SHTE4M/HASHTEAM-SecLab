#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profilePath = path.join(root, 'vm/binary-profile/assets.json')
const profile = JSON.parse(readFileSync(profilePath, 'utf8'))

function fail(message) {
  throw new Error(`binary profile invalid: ${message}`)
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${field} must be a non-empty string`)
  return value
}

function projectPath(relativePath, field) {
  requireString(relativePath, field)
  if (path.isAbsolute(relativePath) || relativePath.includes('\\') || relativePath.split('/').includes('..')) {
    fail(`${field} must be a repository relative path`)
  }
  const absolute = path.resolve(root, relativePath)
  const relative = path.relative(root, absolute)
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail(`${field} escapes the repository`)
  return absolute
}

function requireFile(relativePath, field) {
  const absolute = projectPath(relativePath, field)
  const info = lstatSync(absolute)
  if (info.isSymbolicLink() || !info.isFile() || info.size === 0) fail(`${field} must be a regular non-empty file`)
  return { absolute, info }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function inspectElf(artifact, binary, field) {
  const bytes = readFileSync(binary.absolute)
  if (bytes.length < 52 || bytes.subarray(0, 4).toString('hex') !== '7f454c46') fail(`${field} is not an ELF`)
  if (bytes[4] !== 1 || bytes[5] !== 1) fail(`${field} must be ELF32 little endian`)
  if (bytes.readUInt16LE(16) !== 2 || bytes.readUInt16LE(18) !== 3) {
    fail(`${field} must be a fixed i386 executable`)
  }

  const programHeaderOffset = bytes.readUInt32LE(28)
  const programHeaderSize = bytes.readUInt16LE(42)
  const programHeaderCount = bytes.readUInt16LE(44)
  if (programHeaderSize < 32 || programHeaderOffset + programHeaderSize * programHeaderCount > bytes.length) {
    fail(`${field} program header table is invalid`)
  }
  let stackHeader = false
  let dynamicLoader = false
  let relroHeader = false
  for (let index = 0; index < programHeaderCount; index += 1) {
    const offset = programHeaderOffset + programHeaderSize * index
    const type = bytes.readUInt32LE(offset)
    const flags = bytes.readUInt32LE(offset + 24)
    if (type === 3) dynamicLoader = true
    if (type === 0x6474e551) {
      stackHeader = true
      if ((flags & 1) !== 0 || (flags & 6) !== 6) fail(`${field} GNU_STACK must be RW and non-executable`)
    }
    if (type === 0x6474e552) relroHeader = true
  }
  if (dynamicLoader) fail(`${field} dynamic loader is not allowed`)
  if (!stackHeader) fail(`${field} GNU_STACK program header is missing`)
  if (relroHeader) fail(`${field} expected no RELRO segment`)

  const binaryText = bytes.toString('latin1')
  for (const forbidden of ['__stack_chk_fail', 'execve', 'socket', 'setuid', 'setgid']) {
    if (binaryText.includes(forbidden)) fail(`${field} contains forbidden symbol or string: ${forbidden}`)
  }
  if (artifact.expected?.elfType !== 'EXEC' || artifact.expected?.nx !== true ||
      artifact.expected?.pie !== false || artifact.expected?.canary !== false ||
      artifact.expected?.relro !== 'none') {
    fail(`${field} protection state is not locked`)
  }
}

function validateArtifact(artifact, index) {
  const field = `artifacts[${index}]`
  if (typeof artifact !== 'object' || artifact === null || Array.isArray(artifact)) fail(`${field} must be an object`)
  const id = requireString(artifact.id, `${field}.id`)
  if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(`${field}.id is invalid`)
  const binary = requireFile(artifact.path, `${field}.path`)
  const source = requireFile(artifact.source, `${field}.source`)
  const buildScript = requireFile(artifact.buildScript, `${field}.buildScript`)
  requireFile(artifact.toolchainLock, `${field}.toolchainLock`)

  if (artifact.architecture !== 'i386' || artifact.endianness !== 'little') fail(`${field} must be little endian i386`)
  if (!Number.isInteger(artifact.size) || artifact.size !== binary.info.size) fail(`${field} size mismatch`)
  if (!/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')) fail(`${field} sha256 is not locked`)
  if (!/^[a-f0-9]{64}$/.test(artifact.sourceSha256 ?? '')) fail(`${field} source sha256 is not locked`)
  if (sha256(readFileSync(binary.absolute)) !== artifact.sha256) fail(`${field} sha256 mismatch`)
  if (sha256(readFileSync(source.absolute)) !== artifact.sourceSha256) fail(`${field} source sha256 mismatch`)
  if (artifact.profile !== profile.profileId) fail(`${field} profile does not match profileId`)
  requireString(artifact.license, `${field}.license`)
  requireString(artifact.purpose, `${field}.purpose`)
  if (typeof artifact.downloadable !== 'boolean') fail(`${field} downloadable must be boolean`)
  if ((buildScript.info.mode & 0o6000) !== 0) fail(`${field} build script must not be setuid/setgid`)
  inspectElf(artifact, binary, field)
  return artifact
}

function inspectToolElf(tool, binary, field) {
  const bytes = readFileSync(binary.absolute)
  if (bytes.length < 52 || bytes.subarray(0, 4).toString('hex') !== '7f454c46') fail(`${field} is not an ELF`)
  if (bytes[4] !== 1 || bytes[5] !== 1) fail(`${field} must be ELF32 little endian`)
  if (bytes.readUInt16LE(16) !== 2 || bytes.readUInt16LE(18) !== 3) {
    fail(`${field} must be a fixed i386 executable`)
  }

  const programHeaderOffset = bytes.readUInt32LE(28)
  const programHeaderSize = bytes.readUInt16LE(42)
  const programHeaderCount = bytes.readUInt16LE(44)
  if (programHeaderSize < 32 || programHeaderOffset + programHeaderSize * programHeaderCount > bytes.length) {
    fail(`${field} program header table is invalid`)
  }
  let stackHeader = false
  for (let index = 0; index < programHeaderCount; index += 1) {
    const offset = programHeaderOffset + programHeaderSize * index
    const type = bytes.readUInt32LE(offset)
    const flags = bytes.readUInt32LE(offset + 24)
    if (type === 3) fail(`${field} must not contain a dynamic loader`)
    if (type === 0x6474e551) {
      stackHeader = true
      if ((flags & 1) !== 0 || (flags & 6) !== 6) fail(`${field} GNU_STACK must be RW and non-executable`)
    }
  }
  if (!stackHeader) fail(`${field} GNU_STACK program header is missing`)

  const sectionHeaderOffset = bytes.readUInt32LE(32)
  const sectionHeaderSize = bytes.readUInt16LE(46)
  const sectionHeaderCount = bytes.readUInt16LE(48)
  const sectionNameIndex = bytes.readUInt16LE(50)
  if (sectionHeaderSize < 40 || sectionNameIndex >= sectionHeaderCount ||
      sectionHeaderOffset + sectionHeaderSize * sectionHeaderCount > bytes.length) {
    fail(`${field} section header table is invalid`)
  }
  const nameHeader = sectionHeaderOffset + sectionHeaderSize * sectionNameIndex
  const namesOffset = bytes.readUInt32LE(nameHeader + 16)
  const namesSize = bytes.readUInt32LE(nameHeader + 20)
  if (namesOffset + namesSize > bytes.length) fail(`${field} section name table is invalid`)
  const names = bytes.subarray(namesOffset, namesOffset + namesSize)
  const sectionNames = []
  for (let index = 0; index < sectionHeaderCount; index += 1) {
    const nameOffset = bytes.readUInt32LE(sectionHeaderOffset + sectionHeaderSize * index)
    if (nameOffset >= names.length) fail(`${field} section name offset is invalid`)
    const end = names.indexOf(0, nameOffset)
    if (end < 0) fail(`${field} section name is unterminated`)
    sectionNames.push(names.subarray(nameOffset, end).toString('ascii'))
  }
  if (sectionNames.includes('.symtab')) fail(`${field} must be stripped`)
  if (tool.static !== true || tool.stripped !== true) fail(`${field} static and stripped state must be locked`)
}

function validateTool(tool, index) {
  const field = `tools[${index}]`
  if (typeof tool !== 'object' || tool === null || Array.isArray(tool)) fail(`${field} must be an object`)
  const id = requireString(tool.id, `${field}.id`)
  const command = requireString(tool.command, `${field}.command`)
  if (!/^[a-z][a-z0-9-]*$/.test(id) || !/^[a-z][a-z0-9-]*$/.test(command)) {
    fail(`${field} id or command is invalid`)
  }
  if (tool.path !== `vm/binary-tools/staged/${command}`) {
    fail(`${field}.path must reference the staged locked tool`)
  }
  if (tool.installPath !== `/usr/local/bin/${command}`) {
    fail(`${field}.installPath must install the command in /usr/local/bin`)
  }
  const binary = requireFile(tool.path, `${field}.path`)
  const buildScript = requireFile(tool.buildScript, `${field}.buildScript`)
  const lock = requireFile(tool.toolchainLock, `${field}.toolchainLock`)
  if (tool.architecture !== 'i386' || tool.endianness !== 'little') fail(`${field} must be little endian i386`)
  if (!Number.isInteger(tool.size) || tool.size !== binary.info.size) fail(`${field} size mismatch`)
  if (!/^[a-f0-9]{64}$/.test(tool.sha256 ?? '') || sha256(readFileSync(binary.absolute)) !== tool.sha256) {
    fail(`${field} sha256 mismatch`)
  }
  if (!/^[a-f0-9]{64}$/.test(tool.sourceSha256 ?? '')) fail(`${field} source sha256 is not locked`)
  if (!/^https:\/\//.test(tool.sourceUrl ?? '')) fail(`${field} sourceUrl must use HTTPS`)
  if (tool.profile !== profile.profileId) fail(`${field} profile does not match profileId`)
  requireString(tool.upstreamVersion, `${field}.upstreamVersion`)
  requireString(tool.license, `${field}.license`)
  requireString(tool.purpose, `${field}.purpose`)
  if ((binary.info.mode & 0o6000) !== 0 || (buildScript.info.mode & 0o6000) !== 0) {
    fail(`${field} binary and build script must not be setuid/setgid`)
  }

  const lockText = readFileSync(lock.absolute, 'utf8')
  const lockValue = (name) => lockText.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]
  const versionKey = tool.lockVersionKey ?? 'binutils_version'
  const shaKey = tool.lockShaKey ?? `${command}_sha256`
  if (!/^[a-z][a-z0-9_]*$/.test(versionKey) || !/^[a-z][a-z0-9_]*$/.test(shaKey)) {
    fail(`${field} lock key is invalid`)
  }
  if (lockValue(versionKey) !== tool.upstreamVersion ||
      lockValue('source_url') !== tool.sourceUrl ||
      lockValue('source_sha256') !== tool.sourceSha256 ||
      lockValue(shaKey) !== tool.sha256) {
    fail(`${field} does not match its toolchain lock`)
  }
  inspectToolElf(tool, binary, field)
  return tool
}

function requiredArtifact(artifacts, id) {
  const artifact = artifacts.get(id)
  if (!artifact) fail(`${id} artifact is missing`)
  return artifact
}

function validateLabPackage(artifact, kind, label) {
  const labRoot = `vm/labs/pwnhub/${artifact.id}`
  const manifestInfo = requireFile(`${labRoot}/manifest.json`, `${label} manifest`)
  const manifest = JSON.parse(readFileSync(manifestInfo.absolute, 'utf8'))
  if (manifest.$schema !== '../course.schema.json' || manifest.schemaVersion !== 3) {
    fail(`${label} manifest must use the canonical v3 schema identifier`)
  }
  if (manifest.labId !== artifact.id || manifest.kind !== kind || manifest.environmentProfile !== 'binary') {
    fail(`${label} manifest does not identify the expected binary lab`)
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 1 ||
      manifest.artifacts[0].sha256 !== artifact.sha256) {
    fail(`${label} manifest artifact hash mismatch`)
  }
  for (const script of ['init.sh', 'reset.sh', 'check.sh']) {
    const scriptInfo = requireFile(`${labRoot}/${script}`, `${label} script ${script}`)
    if ((scriptInfo.info.mode & 0o6000) !== 0) fail(`${label} script ${script} must not be setuid/setgid`)
  }
  const homeFiles = requireFile(`${labRoot}/home-files`, `${label} home-files`)
  const entries = readFileSync(homeFiles.absolute, 'utf8')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '' && !entry.startsWith('#'))
  if (entries.length === 0) fail(`${label} home-files must list at least one file`)
  const seen = new Set()
  for (const filename of entries) {
    if (!/^[A-Za-z0-9._-]+$/.test(filename) || filename === '.' || filename === '..') {
      fail(`${label} home-files contains an unsafe filename: ${filename}`)
    }
    if (seen.has(filename)) fail(`${label} home-files contains a duplicate: ${filename}`)
    seen.add(filename)
    requireFile(`${labRoot}/${filename}`, `${label} HOME file ${filename}`)
  }
  return manifest
}

function validateAnswerHash(labId, label) {
  const answer = requireFile(`vm/labs/pwnhub/${labId}/answer.sha256`, `${label} answer hash`)
  if (!/^[a-f0-9]{64}\n?$/.test(readFileSync(answer.absolute, 'utf8'))) fail(`${label} answer hash is invalid`)
}

if (profile.version !== 1) fail('version must be 1')
if (profile.profileId !== 'binary-i386') fail('profileId must be binary-i386')
if (profile.status !== 'staged') fail('profile status must remain staged until the binary VM profile is shipped')
if (!/^[a-f0-9]{40}$/.test(profile.sourceCommit ?? '')) fail('sourceCommit must be a full Git SHA')
if (!Array.isArray(profile.artifacts) || profile.artifacts.length === 0) fail('at least one audited artifact is required')
if (!Array.isArray(profile.tools) || profile.tools.length === 0) fail('at least one audited binary tool is required')

const artifacts = new Map()
profile.artifacts.forEach((raw, index) => {
  const artifact = validateArtifact(raw, index)
  if (artifacts.has(artifact.id)) fail(`duplicate artifact id: ${artifact.id}`)
  artifacts.set(artifact.id, artifact)
})

const tools = new Map()
profile.tools.forEach((raw, index) => {
  const tool = validateTool(raw, index)
  if (tools.has(tool.command)) fail(`duplicate tool command: ${tool.command}`)
  tools.set(tool.command, tool)
})

const gdbTool = tools.get('gdb')
if (!gdbTool) fail('binary profile requires the native gdb fallback tool')
if (gdbTool.upstreamVersion !== '15.1' || gdbTool.lockVersionKey !== 'gdb_version' ||
    gdbTool.lockShaKey !== 'gdb_sha256') {
  fail('native gdb tool must use the audited gdb-15.1 lock keys')
}
requireFile('vm/binary-tools/staged/gdbinit', 'native gdb system init')

const ret2winArtifact = requiredArtifact(artifacts, 'pwn-ret2win-01')
validateLabPackage(ret2winArtifact, 'pwn', 'ret2win')

const memoryArtifact = requiredArtifact(artifacts, 'memory-addresses-01')
const memoryManifest = validateLabPackage(memoryArtifact, 'visual', 'memory')
if (!Array.isArray(memoryManifest.steps) || memoryManifest.steps.length !== 3) {
  fail('memory lab must have three focused steps')
}
const memoryVisual = memoryManifest.steps[0]
if (memoryVisual?.type !== 'visual-trace' || memoryVisual.initialTab !== 'bytes' ||
    memoryVisual.workbench?.bytes?.baseAddress !== 0x0804b140 ||
    JSON.stringify(memoryVisual.workbench?.bytes?.bytes) !== JSON.stringify([0x42, 0xde, 0xc0, 0xde])) {
  fail('memory BinaryWorkbench snapshot is not tied to the audited ELF')
}
if (memoryVisual.workbench?.memory?.cells?.find((cell) => cell.name === 'cell_pointer')?.targetAddress !== 0x0804b140) {
  fail('memory pointer relationship is not tied to the audited ELF')
}
validateAnswerHash(memoryArtifact.id, 'memory')

const memoryLayoutScript = requireFile(
  'vm/labs/pwnhub/memory-layout-01/inspect-memory-layout.sh',
  'memory layout observation script',
)
const memoryLayoutArtifact = {
  id: 'memory-layout-01',
  sha256: sha256(readFileSync(memoryLayoutScript.absolute)),
}
const memoryLayoutManifest = validateLabPackage(memoryLayoutArtifact, 'visual', 'memory layout')
if (JSON.stringify(memoryLayoutManifest.unlockAfter) !== JSON.stringify(['memory-addresses-01'])) {
  fail('memory layout manifest must depend on memory-addresses-01')
}
const memoryLayoutUnlockLabs = requireFile(
  'vm/labs/pwnhub/memory-layout-01/unlock-labs',
  'memory layout unlock-labs',
)
if (readFileSync(memoryLayoutUnlockLabs.absolute, 'utf8').trim() !== 'memory-addresses-01') {
  fail('memory layout VM prerequisite does not match the course manifest')
}
if (memoryLayoutManifest.artifacts[0]?.path !== '/opt/pwnhub/labs/memory-layout-01/inspect-memory-layout.sh' ||
    memoryLayoutManifest.artifacts[0]?.architecture !== 'any' ||
    !Array.isArray(memoryLayoutManifest.steps) || memoryLayoutManifest.steps.length !== 4 ||
    memoryLayoutManifest.steps[0]?.type !== 'concept' ||
    memoryLayoutManifest.steps[1]?.type !== 'prediction' ||
    memoryLayoutManifest.steps[1]?.question?.answer !== 'code' ||
    memoryLayoutManifest.steps[2]?.type !== 'terminal' ||
    memoryLayoutManifest.steps[2]?.autoRun !== true ||
    memoryLayoutManifest.steps[3]?.type !== 'prediction' ||
    memoryLayoutManifest.steps[3]?.question?.answer !== 'lower') {
  fail('memory layout lab must teach regions, rwx, real maps, and growth direction in order')
}

const memoryRegisterStackArtifact = requiredArtifact(artifacts, 'memory-register-stack-01')
const memoryRegisterStackManifest = validateLabPackage(
  memoryRegisterStackArtifact,
  'visual',
  'memory register stack',
)
if (JSON.stringify(memoryRegisterStackManifest.unlockAfter) !== JSON.stringify(['memory-layout-01'])) {
  fail('memory stack manifest must depend on memory-layout-01')
}
const memoryRegisterStackUnlockLabs = requireFile(
  'vm/labs/pwnhub/memory-register-stack-01/unlock-labs',
  'memory register stack unlock-labs',
)
if (readFileSync(memoryRegisterStackUnlockLabs.absolute, 'utf8').trim() !== 'memory-layout-01') {
  fail('memory stack VM prerequisite does not match the course manifest')
}
if (!Array.isArray(memoryRegisterStackManifest.steps) || memoryRegisterStackManifest.steps.length !== 4 ||
    memoryRegisterStackManifest.steps[0]?.type !== 'concept' ||
    memoryRegisterStackManifest.steps[1]?.type !== 'prediction' ||
    memoryRegisterStackManifest.steps[1]?.question?.answer !== 'second' ||
    memoryRegisterStackManifest.steps[2]?.type !== 'visual-trace' ||
    memoryRegisterStackManifest.steps[3]?.type !== 'terminal' ||
    memoryRegisterStackManifest.steps[3]?.autoRun !== true) {
  fail('memory stack lab must teach the LIFO sequence before replaying the ELF')
}
const memoryStackSnapshot = memoryRegisterStackManifest.steps[2]?.workbench
if (memoryRegisterStackManifest.steps[2]?.initialTab !== 'stack' ||
    memoryStackSnapshot?.memory !== undefined || memoryStackSnapshot?.registers !== undefined ||
    JSON.stringify(memoryStackSnapshot?.stack?.entries) !== JSON.stringify([
      { address: 0x0804c158, value: 0x22222222, label: '栈顶 · 后进入的 B', kind: 'stack-pointer' },
      { address: 0x0804c15c, value: 0x11111111, label: '先进入的 A', kind: 'stack-pointer' },
      { address: 0x0804c160, value: 0, label: '入栈前的边界', kind: 'stack-pointer' },
    ])) {
  fail('memory stack snapshot is not tied to the audited ELF')
}
const memoryStackCoreText = JSON.stringify({
  title: memoryRegisterStackManifest.title,
  summary: memoryRegisterStackManifest.summary,
  goals: memoryRegisterStackManifest.goals,
  prerequisites: memoryRegisterStackManifest.prerequisites,
  concepts: memoryRegisterStackManifest.concepts,
  steps: memoryRegisterStackManifest.steps,
  hints: memoryRegisterStackManifest.hints,
  verification: memoryRegisterStackManifest.verification,
})
if (/EAX|ESP|寄存器|值的复制|\bmov\b|\bpush\b|\bpop\b/.test(memoryStackCoreText)) {
  fail('memory stack teaching must not introduce registers, value copying, or assembly commands')
}
validateAnswerHash(memoryRegisterStackArtifact.id, 'memory register stack')

function validateAssemblyLab(id, prerequisite, label) {
  const artifact = requiredArtifact(artifacts, id)
  const manifest = validateLabPackage(artifact, 'visual', label)
  if (JSON.stringify(manifest.unlockAfter) !== JSON.stringify([prerequisite])) {
    fail(`${label} manifest must depend on ${prerequisite}`)
  }
  const unlock = requireFile(
    `vm/labs/pwnhub/${id}/unlock-labs`,
    `${label} unlock-labs`,
  )
  if (readFileSync(unlock.absolute, 'utf8').trim() !== prerequisite) {
    fail(`${label} VM prerequisite does not match the course manifest`)
  }
  return { artifact, manifest }
}

const { artifact: asmArtifact, manifest: asmManifest } = validateAssemblyLab(
  'asm-registers-01',
  'memory-register-stack-01',
  'asm registers',
)
if (!Array.isArray(asmManifest.steps) || asmManifest.steps.length !== 5 ||
    asmManifest.steps[0]?.type !== 'concept' ||
    asmManifest.steps[1]?.type !== 'prediction' ||
    asmManifest.steps[1]?.question?.answer !== 'copied' ||
    asmManifest.concepts?.map(({ term }) => term).join(',') !==
      '常见寄存器职责,mov 的值复制,lea 的地址计算') {
  fail('asm registers lab must teach register roles, mov, then lea')
}
const movSnapshot = asmManifest.steps[2]?.workbench?.registers
const leaSnapshot = asmManifest.steps[3]?.workbench?.registers
if (asmManifest.steps[2]?.initialTab !== 'registers' ||
    movSnapshot?.instruction !== 'mov eax, 0x11223344' ||
    JSON.stringify(movSnapshot?.registers) !== JSON.stringify([
      { name: 'eax', before: 0, after: 0x11223344 },
    ])) {
  fail('asm mov RegisterDiff snapshot is not tied to the audited ELF')
}
if (asmManifest.steps[3]?.initialTab !== 'registers' ||
    leaSnapshot?.instruction !== 'lea ecx, [ebx+0x0c]' ||
    JSON.stringify(leaSnapshot?.registers) !== JSON.stringify([
      { name: 'ebx', before: 0x1000, after: 0x1000 },
      { name: 'ecx', before: 0, after: 0x100c },
    ])) {
  fail('asm lea RegisterDiff snapshot is not tied to the audited ELF')
}
validateAnswerHash(asmArtifact.id, 'asm registers')

const { artifact: arithmeticArtifact, manifest: arithmeticManifest } = validateAssemblyLab(
  'asm-arithmetic-01',
  'asm-registers-01',
  'asm arithmetic',
)
if (!Array.isArray(arithmeticManifest.steps) || arithmeticManifest.steps.length !== 5 ||
    arithmeticManifest.steps[0]?.type !== 'prediction' ||
    arithmeticManifest.steps[0]?.question?.answer !== 'thirteen' ||
    arithmeticManifest.concepts?.map(({ term }) => term).join(',') !==
      'add 与 sub,imul 与 idiv,and、or 与 xor') {
  fail('asm arithmetic lab must separate add/sub, multiply/divide, and bitwise operations')
}
const divisionSnapshot = arithmeticManifest.steps[2]?.workbench?.registers
const bitwiseSnapshot = arithmeticManifest.steps[3]?.workbench?.registers
if (arithmeticManifest.steps[2]?.initialTab !== 'registers' ||
    divisionSnapshot?.instruction !== 'idiv ebx' ||
    JSON.stringify(divisionSnapshot?.registers) !== JSON.stringify([
      { name: 'eax', before: 43, after: 8 },
      { name: 'edx', before: 0, after: 3 },
    ])) {
  fail('asm division snapshot must expose quotient and remainder')
}
if (arithmeticManifest.steps[3]?.initialTab !== 'registers' ||
    bitwiseSnapshot?.instruction !== 'and; or; xor' ||
    JSON.stringify(bitwiseSnapshot?.registers) !== JSON.stringify([
      { name: 'eax', before: 0xf0, after: 0x22 },
    ])) {
  fail('asm bitwise snapshot is not tied to the audited ELF')
}
validateAnswerHash(arithmeticArtifact.id, 'asm arithmetic')

const { artifact: stackOpsArtifact, manifest: stackOpsManifest } = validateAssemblyLab(
  'asm-stack-ops-01',
  'asm-arithmetic-01',
  'asm stack ops',
)
if (!Array.isArray(stackOpsManifest.steps) || stackOpsManifest.steps.length !== 3 ||
    stackOpsManifest.steps[0]?.type !== 'prediction' ||
    stackOpsManifest.steps[0]?.question?.answer !== 'second' ||
    stackOpsManifest.steps[1]?.initialTab !== 'stack') {
  fail('asm stack ops lab must predict and trace the push/pop sequence')
}
if (JSON.stringify(stackOpsManifest.steps[1]?.workbench?.stack?.entries) !== JSON.stringify([
  { address: 0x0804c0d8, value: 0x22222222, label: 'ESP · 后 push 的值', kind: 'stack-pointer' },
  { address: 0x0804c0dc, value: 0x11111111, label: '先 push 的值', kind: 'stack-pointer' },
  { address: 0x0804c0e0, value: 0, label: '开始时的 ESP', kind: 'stack-pointer' },
])) {
  fail('asm stack ops snapshot is not tied to the audited ELF')
}
validateAnswerHash(stackOpsArtifact.id, 'asm stack ops')

const { artifact: branchesArtifact, manifest: branchesManifest } = validateAssemblyLab(
  'asm-branches-01',
  'asm-stack-ops-01',
  'asm branches',
)
if (!Array.isArray(branchesManifest.steps) || branchesManifest.steps.length !== 5 ||
    branchesManifest.steps[0]?.type !== 'prediction' ||
    branchesManifest.steps[0]?.question?.answer !== 'zero') {
  fail('asm branches lab must begin with an answer-backed test prediction')
}
const testSnapshot = branchesManifest.steps[1]?.workbench?.registers
const equalSnapshot = branchesManifest.steps[2]?.workbench?.registers
const greaterSnapshot = branchesManifest.steps[3]?.workbench?.registers
if (testSnapshot?.instruction !== 'test eax,eax; je zero_path' ||
    JSON.stringify(testSnapshot?.registers) !== JSON.stringify([
      { name: 'eax', before: 0, after: 0 },
    ]) || JSON.stringify(testSnapshot?.flagsAfter) !== JSON.stringify(['ZF'])) {
  fail('asm test snapshot is not tied to the audited ELF')
}
if (equalSnapshot?.instruction !== 'cmp eax,ebx; je equal_path' ||
    JSON.stringify(equalSnapshot?.registers) !== JSON.stringify([
      { name: 'eax', before: 7, after: 7 },
      { name: 'ebx', before: 7, after: 7 },
    ]) || JSON.stringify(equalSnapshot?.flagsAfter) !== JSON.stringify(['ZF'])) {
  fail('asm equal branch snapshot is not tied to the audited ELF')
}
if (greaterSnapshot?.instruction !== 'cmp eax,ebx; jg greater_path' ||
    JSON.stringify(greaterSnapshot?.registers) !== JSON.stringify([
      { name: 'eax', before: 9, after: 9 },
      { name: 'ebx', before: 3, after: 3 },
    ]) || JSON.stringify(greaterSnapshot?.flagsAfter) !== JSON.stringify([])) {
  fail('asm signed greater snapshot is not tied to the audited ELF')
}
validateAnswerHash(branchesArtifact.id, 'asm branches')

const { artifact: callStackArtifact, manifest: callStackManifest } = validateAssemblyLab(
  'asm-call-stack-01',
  'asm-branches-01',
  'asm call stack',
)
if (!Array.isArray(callStackManifest.steps) || callStackManifest.steps.length !== 5 ||
    callStackManifest.steps[0]?.type !== 'concept' ||
    callStackManifest.steps[1]?.type !== 'prediction' ||
    callStackManifest.steps[1]?.question?.answer !== 'argument-still') {
  fail('asm call stack lab must introduce cdecl before the ret prediction')
}
const stackSnapshot = callStackManifest.steps[2]?.workbench?.stack
const traceSnapshot = callStackManifest.steps[3]?.workbench?.trace
if (callStackManifest.steps[2]?.initialTab !== 'stack' ||
    JSON.stringify(stackSnapshot?.entries) !== JSON.stringify([
      { address: 0x0804c240, value: 0x0000002b, label: 'EBP-4 · local_value', kind: 'local' },
      { address: 0x0804c244, value: 0x00000000, label: 'EBP · saved EBP', kind: 'frame-pointer' },
      { address: 0x0804c248, value: 0x08049081, label: 'EBP+4 · return to caller', kind: 'return-address' },
      { address: 0x0804c24c, value: 0x00000015, label: 'EBP+8 · argument 21', kind: 'argument' },
    ])) {
  fail('asm call stack StackView snapshot is not tied to the audited ELF')
}
if (callStackManifest.steps[3]?.initialTab !== 'trace' ||
    JSON.stringify(traceSnapshot?.entries?.map(({ kind, stackPointer }) => ({ kind, stackPointer }))) !== JSON.stringify([
      { kind: 'call', stackPointer: 0x0804c24c },
      { kind: 'current', stackPointer: 0x0804c240 },
      { kind: 'return', stackPointer: 0x0804c24c },
    ]) ||
    !callStackManifest.steps[3]?.workbench?.registers?.registers?.some(
      ({ name, after }) => name === 'eax' && after === 0x2b,
    )) {
  fail('asm call stack trace must preserve the EAX return value')
}
validateAnswerHash(callStackArtifact.id, 'asm call stack')

const elfBytesArtifact = requiredArtifact(artifacts, 'elf-bytes-01')
const elfBytesManifest = validateLabPackage(elfBytesArtifact, 'elf', 'elf bytes')
if (JSON.stringify(elfBytesManifest.unlockAfter) !== JSON.stringify(['asm-call-stack-01'])) {
  fail('elf bytes manifest must depend on asm-call-stack-01')
}
const elfBytesUnlockLabs = requireFile(
  'vm/labs/pwnhub/elf-bytes-01/unlock-labs',
  'elf bytes unlock-labs',
)
if (readFileSync(elfBytesUnlockLabs.absolute, 'utf8').trim() !== 'asm-call-stack-01') {
  fail('elf bytes VM prerequisite does not match the course manifest')
}
if (!Array.isArray(elfBytesManifest.steps) || elfBytesManifest.steps.length !== 5 ||
    elfBytesManifest.steps[0]?.type !== 'prediction' ||
    elfBytesManifest.steps[0]?.question?.answer !== 'file' ||
    elfBytesManifest.steps[1]?.type !== 'observe' ||
    elfBytesManifest.steps[1]?.allowRun !== true ||
    elfBytesManifest.steps[1]?.command !== 'file ./elf-bytes' ||
    elfBytesManifest.steps[2]?.type !== 'observe' ||
    elfBytesManifest.steps[2]?.allowRun !== true ||
    elfBytesManifest.steps[2]?.command !== 'hexdump -C -n 16 ./elf-bytes') {
  fail('elf bytes lab must begin with file and hexdump observations')
}
const elfHeaderSnapshot = elfBytesManifest.steps[3]?.workbench?.bytes
if (elfBytesManifest.steps[3]?.type !== 'visual-trace' ||
    elfBytesManifest.steps[3]?.initialTab !== 'bytes' ||
    elfHeaderSnapshot?.baseAddress !== 0 ||
    JSON.stringify(elfHeaderSnapshot?.bytes) !== JSON.stringify([
      0x7f, 0x45, 0x4c, 0x46, 0x01, 0x01, 0x01, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]) ||
    elfHeaderSnapshot?.selectedOffset !== 0 ||
    elfHeaderSnapshot?.selectedLength !== 6) {
  fail('elf bytes ByteView snapshot is not tied to the audited ELF header')
}
if (elfBytesManifest.steps[4]?.type !== 'observe' ||
    elfBytesManifest.steps[4]?.allowRun !== true ||
    elfBytesManifest.steps[4]?.command !==
      "strings /opt/pwnhub/labs/elf-bytes-01/elf-bytes | grep '^PwnHub_ELF_marker:'") {
  fail('elf bytes lab must expose the bounded strings observation command')
}
requireFile('vm/labs/pwnhub/elf-bytes-01/inspect.sh', 'elf bytes inspect script')
validateAnswerHash(elfBytesArtifact.id, 'elf bytes')

const elfSectionsArtifact = requiredArtifact(artifacts, 'elf-sections-01')
const elfSectionsManifest = validateLabPackage(elfSectionsArtifact, 'elf', 'elf sections')
if (!tools.has('readelf')) fail('elf sections lab requires the audited readelf tool')
if (JSON.stringify(elfSectionsManifest.unlockAfter) !== JSON.stringify(['elf-bytes-01'])) {
  fail('elf sections manifest must depend on elf-bytes-01')
}
const elfSectionsUnlockLabs = requireFile(
  'vm/labs/pwnhub/elf-sections-01/unlock-labs',
  'elf sections unlock-labs',
)
if (readFileSync(elfSectionsUnlockLabs.absolute, 'utf8').trim() !== 'elf-bytes-01') {
  fail('elf sections VM prerequisite does not match the course manifest')
}
if (!Array.isArray(elfSectionsManifest.steps) || elfSectionsManifest.steps.length !== 5 ||
    elfSectionsManifest.steps[0]?.type !== 'prediction' ||
    elfSectionsManifest.steps[0]?.question?.answer !== 'readelf' ||
    elfSectionsManifest.steps[1]?.type !== 'observe' ||
    elfSectionsManifest.steps[1]?.command !== 'readelf -h ./elf-sections' ||
    elfSectionsManifest.steps[2]?.type !== 'concept' ||
    elfSectionsManifest.steps[3]?.type !== 'observe' ||
    elfSectionsManifest.steps[3]?.command !== 'readelf -SW ./elf-sections' ||
    elfSectionsManifest.steps[4]?.type !== 'prediction' ||
    elfSectionsManifest.steps[4]?.question?.answer !== 'bss') {
  fail('elf sections lab must teach entry point, section table, and NOBITS in order')
}
if (elfSectionsManifest.concepts?.map(({ term }) => term).join(',') !==
    '入口点,节表,常见节与标志') {
  fail('elf sections lab concepts are not focused on entry point and sections')
}
requireFile('vm/labs/pwnhub/elf-sections-01/inspect.sh', 'elf sections inspect script')
validateAnswerHash(elfSectionsArtifact.id, 'elf sections')

const elfSymbolsArtifact = requiredArtifact(artifacts, 'elf-symbols-01')
const elfSymbolsManifest = validateLabPackage(elfSymbolsArtifact, 'elf', 'elf symbols')
if (!tools.has('nm')) fail('elf symbols lab requires the audited nm tool')
if (JSON.stringify(elfSymbolsManifest.unlockAfter) !== JSON.stringify(['elf-sections-01'])) {
  fail('elf symbols manifest must depend on elf-sections-01')
}
const elfSymbolsUnlockLabs = requireFile(
  'vm/labs/pwnhub/elf-symbols-01/unlock-labs',
  'elf symbols unlock-labs',
)
if (readFileSync(elfSymbolsUnlockLabs.absolute, 'utf8').trim() !== 'elf-sections-01') {
  fail('elf symbols VM prerequisite does not match the course manifest')
}
if (!Array.isArray(elfSymbolsManifest.steps) || elfSymbolsManifest.steps.length !== 5 ||
    elfSymbolsManifest.steps[0]?.type !== 'prediction' ||
    elfSymbolsManifest.steps[0]?.question?.answer !== 'nm' ||
    elfSymbolsManifest.steps[1]?.type !== 'observe' ||
    elfSymbolsManifest.steps[1]?.command !== 'nm -n ./elf-symbols' ||
    elfSymbolsManifest.steps[2]?.type !== 'concept' ||
    elfSymbolsManifest.steps[3]?.type !== 'observe' ||
    !elfSymbolsManifest.steps[3]?.command?.includes('compute_total') ||
    elfSymbolsManifest.steps[4]?.type !== 'prediction' ||
    elfSymbolsManifest.steps[4]?.question?.answer !== 'compute') {
  fail('elf symbols lab must teach symbol rows, type letters, and visibility in order')
}
if (elfSymbolsManifest.concepts?.map(({ term }) => term).join(',') !==
    '符号表,符号地址,类型字母与大小写') {
  fail('elf symbols lab concepts are not focused on names, addresses, and types')
}
requireFile('vm/labs/pwnhub/elf-symbols-01/inspect.sh', 'elf symbols inspect script')
validateAnswerHash(elfSymbolsArtifact.id, 'elf symbols')

const elfDisassemblyArtifact = requiredArtifact(artifacts, 'elf-disassembly-01')
const elfDisassemblyManifest = validateLabPackage(elfDisassemblyArtifact, 'elf', 'elf disassembly')
if (!tools.has('objdump')) fail('elf disassembly lab requires the audited objdump tool')
if (JSON.stringify(elfDisassemblyManifest.unlockAfter) !== JSON.stringify(['elf-symbols-01'])) {
  fail('elf disassembly manifest must depend on elf-symbols-01')
}
const elfDisassemblyUnlockLabs = requireFile(
  'vm/labs/pwnhub/elf-disassembly-01/unlock-labs',
  'elf disassembly unlock-labs',
)
if (readFileSync(elfDisassemblyUnlockLabs.absolute, 'utf8').trim() !== 'elf-symbols-01') {
  fail('elf disassembly VM prerequisite does not match the course manifest')
}
if (!Array.isArray(elfDisassemblyManifest.steps) || elfDisassemblyManifest.steps.length !== 5 ||
    elfDisassemblyManifest.steps[0]?.type !== 'prediction' ||
    elfDisassemblyManifest.steps[0]?.question?.answer !== 'objdump' ||
    elfDisassemblyManifest.steps[1]?.type !== 'observe' ||
    elfDisassemblyManifest.steps[1]?.command !== 'objdump -d -M intel ./elf-disassembly' ||
    elfDisassemblyManifest.steps[2]?.type !== 'concept' ||
    elfDisassemblyManifest.steps[3]?.type !== 'observe' ||
    elfDisassemblyManifest.steps[3]?.command !==
      'objdump -d -M intel --disassemble=choose_path ./elf-disassembly' ||
    elfDisassemblyManifest.steps[4]?.type !== 'prediction' ||
    elfDisassemblyManifest.steps[4]?.question?.answer !== 'jne') {
  fail('elf disassembly lab must teach instruction rows, call, cmp, and conditional jumps in order')
}
if (elfDisassemblyManifest.concepts?.map(({ term }) => term).join(',') !==
    '反汇编,指令地址、机器字节与助记符,静态控制流') {
  fail('elf disassembly lab concepts are not focused on instructions and control flow')
}
requireFile('vm/labs/pwnhub/elf-disassembly-01/inspect.sh', 'elf disassembly inspect script')
validateAnswerHash(elfDisassemblyArtifact.id, 'elf disassembly')

const gdbLabDefinitions = [
  {
    id: 'gdb-breakpoints-01',
    prerequisite: 'elf-disassembly-01',
    steps: ['prediction', 'terminal', 'prediction', 'terminal'],
    requiredFiles: ['observe.sh', 'session.gdb'],
  },
  {
    id: 'gdb-register-memory-01',
    prerequisite: 'gdb-breakpoints-01',
    steps: ['prediction', 'terminal', 'terminal'],
    requiredFiles: ['observe.sh', 'session.gdb'],
  },
  {
    id: 'gdb-stack-frames-01',
    prerequisite: 'gdb-register-memory-01',
    steps: ['concept', 'terminal', 'prediction', 'terminal'],
    requiredFiles: ['observe.sh', 'session.gdb'],
  },
  {
    id: 'gdb-input-crash-01',
    prerequisite: 'gdb-stack-frames-01',
    steps: ['prediction', 'terminal', 'prediction', 'terminal'],
    requiredFiles: ['crash.txt', 'observe.sh', 'session.gdb'],
  },
]

const gdbSampleHashes = new Set()
const gdbSourceHashes = new Set()
for (const definition of gdbLabDefinitions) {
  const artifact = requiredArtifact(artifacts, definition.id)
  const manifest = validateLabPackage(artifact, 'gdb', definition.id)
  if (JSON.stringify(manifest.unlockAfter) !== JSON.stringify([definition.prerequisite])) {
    fail(`${definition.id} manifest must depend on ${definition.prerequisite}`)
  }
  const unlock = requireFile(
    `vm/labs/pwnhub/${definition.id}/unlock-labs`,
    `${definition.id} unlock-labs`,
  )
  if (readFileSync(unlock.absolute, 'utf8').trim() !== definition.prerequisite) {
    fail(`${definition.id} VM prerequisite does not match the course manifest`)
  }
  if (JSON.stringify(manifest.steps?.map(({ type }) => type)) !== JSON.stringify(definition.steps) ||
      manifest.steps?.filter(({ type }) => type === 'terminal').some(({ allowRun }) => allowRun !== false)) {
    fail(`${definition.id} must keep its focused GDB teaching sequence and manual interaction`)
  }
  if (manifest.verification?.type !== 'answer' || manifest.concepts?.length !== 3) {
    fail(`${definition.id} must use three focused concepts and real observation answers`)
  }
  for (const filename of definition.requiredFiles) {
    requireFile(`vm/labs/pwnhub/${definition.id}/${filename}`, `${definition.id} ${filename}`)
  }
  const homeSource = requireFile(
    `vm/labs/pwnhub/${definition.id}/gdb-runtime.c`,
    `${definition.id} HOME source`,
  )
  if (sha256(readFileSync(homeSource.absolute)) !== artifact.sourceSha256) {
    fail(`${definition.id} HOME source does not match the audited source`)
  }
  gdbSampleHashes.add(artifact.sha256)
  gdbSourceHashes.add(artifact.sourceSha256)
}
if (gdbSampleHashes.size !== 1 || gdbSourceHashes.size !== 1) {
  fail('GDB labs must share one audited runtime sample and source build')
}
if (!tools.has('gdb')) fail('GDB labs require the audited native gdb tool')

const reverseDefinitions = [
  {
    id: 'rev-strings-xrefs-01',
    prerequisite: 'gdb-input-crash-01',
    steps: ['prediction', 'external-tool', 'worksheet'],
    observationIds: ['marker-address', 'xref-function'],
  },
  {
    id: 'rev-functions-flow-01',
    prerequisite: 'rev-strings-xrefs-01',
    steps: ['concept', 'external-tool', 'worksheet'],
    observationIds: ['gate-address', 'gate-name', 'compare-value', 'false-jump'],
  },
]
const reverseHashes = new Set()
for (const definition of reverseDefinitions) {
  const artifact = requiredArtifact(artifacts, definition.id)
  const manifest = validateLabPackage(artifact, 'external-tool', definition.id)
  if (JSON.stringify(manifest.unlockAfter) !== JSON.stringify([definition.prerequisite])) {
    fail(`${definition.id} manifest must depend on ${definition.prerequisite}`)
  }
  const unlock = requireFile(
    `vm/labs/pwnhub/${definition.id}/unlock-labs`,
    `${definition.id} unlock-labs`,
  )
  if (readFileSync(unlock.absolute, 'utf8').trim() !== definition.prerequisite) {
    fail(`${definition.id} VM prerequisite does not match the course manifest`)
  }
  if (JSON.stringify(manifest.steps?.map(({ type }) => type)) !== JSON.stringify(definition.steps) ||
      manifest.concepts?.length !== 3 || manifest.verification?.type !== 'external-observation') {
    fail(`${definition.id} must keep its focused external analysis sequence`)
  }
  const externalStep = manifest.steps.find(({ type }) => type === 'external-tool')
  if (!externalStep || JSON.stringify(externalStep.companion?.observations.map(({ id }) => id)) !==
      JSON.stringify(definition.observationIds) ||
      JSON.stringify(externalStep.companion?.tools.map(({ tool }) => tool)) !==
      JSON.stringify(['ida', 'ghidra', 'objdump']) ||
      externalStep.companion?.artifact.sha256 !== artifact.sha256 ||
      externalStep.companion?.artifact.downloadUrl !== './artifacts/reverse-companion') {
    fail(`${definition.id} companion routes or typed observations are not locked`)
  }
  requireFile(`vm/labs/pwnhub/${definition.id}/inspect.sh`, `${definition.id} inspect script`)
  reverseHashes.add(artifact.sha256)
}
if (reverseHashes.size !== 1 || !tools.has('nm') || !tools.has('objdump')) {
  fail('external reverse labs must share one audited sample and locked nm/objdump tools')
}
function validateScriptTool(tool, index) {
  const field = `scriptTools[${index}]`
  if (typeof tool !== 'object' || tool === null || Array.isArray(tool)) fail(`${field} must be an object`)
  const command = requireString(tool.command, `${field}.command`)
  if (!/^[a-z][a-z0-9-]*$/.test(command)) fail(`${field}.command is invalid`)
  if (tool.path !== `vm/binary-tools/staged/${command}`) {
    fail(`${field}.path must reference the staged locked script`)
  }
  if (tool.installPath !== `/usr/local/bin/${command}`) {
    fail(`${field}.installPath must install the command in /usr/local/bin`)
  }
  const script = requireFile(tool.path, `${field}.path`)
  if (!Number.isInteger(tool.size) || tool.size !== script.info.size) fail(`${field} size mismatch`)
  if (!/^[a-f0-9]{64}$/.test(tool.sha256 ?? '') || sha256(readFileSync(script.absolute)) !== tool.sha256) {
    fail(`${field} sha256 mismatch`)
  }
  if (tool.size > 65536) fail(`${field} must stay below 64 KiB`)
  requireString(tool.interpreter, `${field}.interpreter`)
  requireString(tool.license, `${field}.license`)
  requireString(tool.purpose, `${field}.purpose`)
  if ((script.info.mode & 0o6000) !== 0) fail(`${field} must not be setuid/setgid`)
  const text = readFileSync(script.absolute, 'utf8')
  if (!text.startsWith(tool.interpreter)) fail(`${field} interpreter shebang mismatch`)
  for (const forbidden of ['curl', 'wget', 'nc ', 'telnet', 'socket', '/dev/tcp']) {
    if (text.includes(forbidden)) fail(`${field} must not use network primitives: ${forbidden}`)
  }
  if (/rm -rf --?\s+["'$`]?(\/|\$HOME["'`]?$)/.test(text)) fail(`${field} must not delete outside lab state`)
  return tool
}

function validatePwnLab(definition) {
  const artifact = requiredArtifact(artifacts, definition.id)
  const manifest = validateLabPackage(artifact, 'pwn', definition.id)
  if (JSON.stringify(manifest.unlockAfter) !== JSON.stringify([definition.prerequisite])) {
    fail(`${definition.id} manifest must depend on ${definition.prerequisite}`)
  }
  const unlock = requireFile(
    `vm/labs/pwnhub/${definition.id}/unlock-labs`,
    `${definition.id} unlock-labs`,
  )
  if (readFileSync(unlock.absolute, 'utf8').trim() !== definition.prerequisite) {
    fail(`${definition.id} VM prerequisite does not match the course manifest`)
  }
  if (JSON.stringify(manifest.steps?.map(({ type }) => type)) !== JSON.stringify(definition.steps)) {
    fail(`${definition.id} must keep its focused pwn teaching sequence`)
  }
  if (manifest.verification?.type !== 'payload-replay') {
    fail(`${definition.id} must use payload-replay verification`)
  }
  const builder = manifest.steps?.find(({ type }) => type === 'payload-builder')
  if (!builder || builder.evidence !== 'payload-replay') {
    fail(`${definition.id} must contain a payload-builder step with payload-replay evidence`)
  }
  const preset = builder.payload
  if (!preset || !Number.isInteger(preset.maxBytes) || preset.maxBytes < 1 || preset.maxBytes > 512) {
    fail(`${definition.id} payload preset must stay within the 512 byte replay limit`)
  }
  if (!Array.isArray(preset.segments) || preset.segments.length === 0 || preset.segments.length > 32) {
    fail(`${definition.id} payload preset must contain 1 to 32 segments`)
  }
  const segmentBytes = preset.segments.reduce((total, segment) => {
    if (segment.kind === 'padding' || segment.kind === 'cyclic') return total + (segment.length ?? 0)
    if (segment.kind === 'p32') return total + 4
    if (segment.kind === 'hex') return total + Math.floor((segment.value ?? '').replace(/\\x|0x|[\s,:]/g, '').length / 2)
    fail(`${definition.id} payload preset contains an unsupported segment kind: ${String(segment.kind)}`)
  }, 0)
  if (!Number.isInteger(segmentBytes) || segmentBytes < 1 || segmentBytes > preset.maxBytes) {
    fail(`${definition.id} payload preset must compose within maxBytes`)
  }
  const presetValues = preset.segments.filter((segment) => segment.kind === 'p32').map((segment) => segment.value)
  if (definition.presetGuard?.onlyCyclic) {
    if (preset.segments.length !== 1 || preset.segments[0].kind !== 'cyclic') {
      fail(`${definition.id} payload preset must start from a single cyclic probe`)
    }
  }
  for (const forbidden of definition.presetGuard?.forbiddenValues ?? []) {
    if (presetValues.includes(forbidden)) {
      fail(`${definition.id} payload preset must not pre-fill the target value ${forbidden}`)
    }
  }
  const structureHint = manifest.hints?.[2]?.text ?? ''
  for (const address of definition.targetAddresses ?? []) {
    if (structureHint.includes(address)) fail(`${definition.id} structure hint must not leak ${address}`)
  }
  return manifest
}

const pwnLabDefinitions = [
  {
    id: 'pwn-overflow-offset-01',
    prerequisite: 'rev-functions-flow-01',
    steps: ['concept', 'payload-builder', 'terminal'],
    presetGuard: { onlyCyclic: true },
    targetAddresses: [],
  },
  {
    id: 'pwn-ret2win-01',
    prerequisite: 'pwn-overflow-offset-01',
    steps: ['concept', 'payload-builder', 'terminal'],
    presetGuard: { forbiddenValues: ['0x08049020'] },
    targetAddresses: ['0x08049020'],
  },
  {
    id: 'pwn-ret2win-args-01',
    prerequisite: 'pwn-ret2win-01',
    steps: ['concept', 'prediction', 'payload-builder', 'terminal'],
    targetAddresses: ['0x08049020'],
  },
  {
    id: 'rop-gadget-stack-01',
    prerequisite: 'pwn-ret2win-args-01',
    steps: ['concept', 'prediction', 'payload-builder', 'terminal'],
    targetAddresses: ['0x08049020', '0x08049025'],
  },
  {
    id: 'rop-register-chain-01',
    prerequisite: 'rop-gadget-stack-01',
    steps: ['concept', 'prediction', 'payload-builder', 'terminal'],
    targetAddresses: ['0x08049020', '0x08049025', '0x0804902a'],
  },
  {
    id: 'rop-call-chain-01',
    prerequisite: 'rop-register-chain-01',
    steps: ['concept', 'prediction', 'payload-builder', 'terminal'],
    targetAddresses: ['0x08049020', '0x08049030', '0x0804904a'],
  },
]

for (const definition of pwnLabDefinitions) validatePwnLab(definition)

if (profile.scriptTools === undefined || !Array.isArray(profile.scriptTools)) {
  fail('scriptTools must be present to audit the restricted payload teaching tools')
}
const scriptTools = new Map()
profile.scriptTools.forEach((raw, index) => {
  const tool = validateScriptTool(raw, index)
  if (scriptTools.has(tool.command)) fail(`duplicate script tool command: ${tool.command}`)
  scriptTools.set(tool.command, tool)
})
for (const required of ['p32', 'hex2bin', 'cyclic', 'cyclic-find', 'payload-run']) {
  if (!scriptTools.has(required)) fail(`script tool ${required} is missing from the audit`)
}

const downloadSample = requireFile(
  'vm/labs/pwnhub/rev-strings-xrefs-01/reverse-companion',
  'staged external reverse download sample',
)
if (sha256(readFileSync(downloadSample.absolute)) !== [...reverseHashes][0]) {
  fail('staged external reverse download sample does not match the audited artifact')
}

console.log(
  `✓ binary profile ${profile.profileId}: ` +
  `${profile.artifacts.map((item) => `${item.id} ${item.sha256}`).join(', ')}; ` +
  `tools ${profile.tools.map((item) => `${item.command} ${item.sha256}`).join(', ')}`,
)
