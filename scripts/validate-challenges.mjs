#!/usr/bin/env node
/**
 * 构建前校验所有关卡目录：
 * - challenge.json 可解析且符合 manifest v1 的必要约束
 * - 关卡编号连续，并与 level-N 目录一致
 * - slug 唯一
 * - init.sh / check.sh 同目录存在
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const levelsRoot = path.join(root, 'vm/rootfs-overlay/opt/hashteam/levels')
const requiredStrings = ['slug', 'name', 'tagline', 'story', 'checkUsage']
const requiredLists = ['goals', 'suggestedCommands', 'hints', 'teaches']
const allowedFields = new Set([
  '$schema',
  'schemaVersion',
  'id',
  ...requiredStrings,
  ...requiredLists,
  'guide',
  'concepts',
  'takeaway',
])
const errors = []

function report(source, message) {
  errors.push(`${source}: ${message}`)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function validateStringList(manifest, field, source) {
  const value = manifest[field]
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !isNonEmptyString(item))) {
    report(source, `${field} 必须是至少包含一项的非空字符串数组`)
  }
}

function validateGuide(value, source) {
  if (value === undefined) return
  if (!Array.isArray(value) || value.length === 0) {
    report(source, 'guide 存在时必须是非空数组')
    return
  }
  value.forEach((step, index) => {
    const stepSource = `${source}#guide[${index}]`
    if (!isRecord(step)) {
      report(stepSource, '必须是对象')
      return
    }
    const unknown = Object.keys(step).filter((field) => field !== 'command' && field !== 'note')
    if (unknown.length > 0) report(stepSource, `未知字段：${unknown.join(', ')}`)
    if (!isNonEmptyString(step.note)) report(stepSource, 'note 必须是非空字符串')
    if (step.command !== undefined && !isNonEmptyString(step.command)) {
      report(stepSource, 'command 存在时必须是非空字符串')
    }
  })
}

function validateConcepts(value, source) {
  if (value === undefined) return
  if (!Array.isArray(value) || value.length === 0) {
    report(source, 'concepts 存在时必须是非空数组')
    return
  }
  value.forEach((concept, index) => {
    const conceptSource = `${source}#concepts[${index}]`
    if (!isRecord(concept)) {
      report(conceptSource, '必须是对象')
      return
    }
    const unknown = Object.keys(concept).filter(
      (field) => field !== 'term' && field !== 'explanation',
    )
    if (unknown.length > 0) report(conceptSource, `未知字段：${unknown.join(', ')}`)
    if (!isNonEmptyString(concept.term)) report(conceptSource, 'term 必须是非空字符串')
    if (!isNonEmptyString(concept.explanation)) {
      report(conceptSource, 'explanation 必须是非空字符串')
    }
  })
}

function validateManifest(manifest, directoryId, source) {
  if (!isRecord(manifest)) {
    report(source, '顶层必须是对象')
    return null
  }

  const unknown = Object.keys(manifest).filter((field) => !allowedFields.has(field))
  if (unknown.length > 0) report(source, `未知字段：${unknown.join(', ')}`)
  if (manifest.$schema !== '../challenge.schema.json') {
    report(source, '$schema 必须指向 ../challenge.schema.json')
  }
  if (manifest.schemaVersion !== 1) report(source, 'schemaVersion 必须为 1')
  if (!Number.isInteger(manifest.id) || manifest.id < 1) {
    report(source, 'id 必须是从 1 开始的正整数')
  } else if (manifest.id !== directoryId) {
    report(source, `id ${manifest.id} 与目录 level-${directoryId} 不一致`)
  }

  requiredStrings.forEach((field) => {
    if (!isNonEmptyString(manifest[field])) report(source, `${field} 必须是非空字符串`)
  })
  if (isNonEmptyString(manifest.slug) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.slug)) {
    report(source, 'slug 只能包含小写字母、数字和单个连字符')
  }
  requiredLists.forEach((field) => validateStringList(manifest, field, source))
  validateGuide(manifest.guide, source)
  validateConcepts(manifest.concepts, source)
  if (manifest.takeaway !== undefined && !isNonEmptyString(manifest.takeaway)) {
    report(source, 'takeaway 存在时必须是非空字符串')
  }
  return manifest
}

function requireFile(directory, filename) {
  const file = path.join(directory, filename)
  try {
    if (!statSync(file).isFile() || readFileSync(file).length === 0) {
      report(path.relative(root, file), '必须是非空文件')
    }
  } catch {
    report(path.relative(root, file), '文件不存在')
  }
}

const schemaFile = path.join(levelsRoot, 'challenge.schema.json')
try {
  JSON.parse(readFileSync(schemaFile, 'utf8'))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  report(path.relative(root, schemaFile), `无法解析 JSON Schema：${message}`)
}

const levelDirectories = readdirSync(levelsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^level-\d+$/.test(entry.name))
  .map((entry) => ({
    name: entry.name,
    id: Number(entry.name.slice('level-'.length)),
    directory: path.join(levelsRoot, entry.name),
  }))
  .sort((left, right) => left.id - right.id)

if (levelDirectories.length === 0) report(path.relative(root, levelsRoot), '至少需要一个 level-N 目录')

const manifests = []
for (const level of levelDirectories) {
  requireFile(level.directory, 'init.sh')
  requireFile(level.directory, 'check.sh')

  const manifestFile = path.join(level.directory, 'challenge.json')
  let raw
  try {
    raw = JSON.parse(readFileSync(manifestFile, 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    report(path.relative(root, manifestFile), `无法解析 JSON：${message}`)
    continue
  }

  const source = path.relative(root, manifestFile)
  const manifest = validateManifest(raw, level.id, source)
  if (manifest !== null) manifests.push({ source, manifest })
}

const slugs = new Set()
manifests.forEach(({ source, manifest }, index) => {
  const expectedId = index + 1
  if (manifest.id !== expectedId) {
    report(source, `关卡编号必须连续，当前位置应为 ${expectedId}`)
  }
  if (slugs.has(manifest.slug)) report(source, `slug ${manifest.slug} 重复`)
  slugs.add(manifest.slug)
})

if (errors.length > 0) {
  console.error(`关卡配置校验失败（${errors.length} 项）：`)
  errors.forEach((message) => console.error(`  ✗ ${message}`))
  process.exit(1)
}

console.log(`✓ ${manifests.length} 个关卡 manifest 校验通过，编号连续且脚本完整`)
