import type { ChallengeManifest, Concept, GuideStep } from '../types/lab'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ALLOWED_FIELDS = new Set([
  '$schema',
  'schemaVersion',
  'id',
  'slug',
  'name',
  'tagline',
  'story',
  'goals',
  'suggestedCommands',
  'guide',
  'concepts',
  'takeaway',
  'hints',
  'teaches',
  'checkUsage',
])

type UnknownRecord = Record<string, unknown>

function fail(source: string, message: string): never {
  throw new Error(`关卡配置无效（${source}）：${message}`)
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNonEmptyString(record: UnknownRecord, field: string, source: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(source, `${field} 必须是非空字符串`)
  }
  return value
}

function readStringList(record: UnknownRecord, field: string, source: string): string[] {
  const value = record[field]
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== 'string' || item.trim().length === 0)
  ) {
    fail(source, `${field} 必须是至少包含一项的非空字符串数组`)
  }
  return [...value] as string[]
}

function readGuide(record: UnknownRecord, source: string): GuideStep[] | undefined {
  const value = record.guide
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0) {
    fail(source, 'guide 存在时必须是非空数组')
  }

  return value.map((item, index) => {
    const itemSource = `${source}#guide[${index}]`
    if (!isRecord(item)) fail(itemSource, '每一步必须是对象')
    const note = readNonEmptyString(item, 'note', itemSource)
    const command = item.command
    if (command !== undefined && (typeof command !== 'string' || command.trim().length === 0)) {
      fail(itemSource, 'command 存在时必须是非空字符串')
    }
    return command === undefined ? { note } : { command, note }
  })
}

function readConcepts(record: UnknownRecord, source: string): Concept[] | undefined {
  const value = record.concepts
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0) {
    fail(source, 'concepts 存在时必须是非空数组')
  }

  return value.map((item, index) => {
    const itemSource = `${source}#concepts[${index}]`
    if (!isRecord(item)) fail(itemSource, '每个概念必须是对象')
    return {
      term: readNonEmptyString(item, 'term', itemSource),
      explanation: readNonEmptyString(item, 'explanation', itemSource),
    }
  })
}

function readOptionalString(
  record: UnknownRecord,
  field: string,
  source: string,
): string | undefined {
  const value = record[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(source, `${field} 存在时必须是非空字符串`)
  }
  return value
}

/** 把不可信 JSON 转换为前端可以安全消费的关卡定义。 */
export function parseChallengeManifest(raw: unknown, source = 'unknown'): ChallengeManifest {
  if (!isRecord(raw)) fail(source, '顶层必须是对象')
  const unknownFields = Object.keys(raw).filter((field) => !ALLOWED_FIELDS.has(field))
  if (unknownFields.length > 0) fail(source, `包含未知字段：${unknownFields.join(', ')}`)
  if (raw.$schema !== '../challenge.schema.json') {
    fail(source, '$schema 必须指向 ../challenge.schema.json')
  }
  if (raw.schemaVersion !== 1) fail(source, 'schemaVersion 必须为 1')
  if (!Number.isInteger(raw.id) || (raw.id as number) < 1) {
    fail(source, 'id 必须是从 1 开始的正整数')
  }

  const slug = readNonEmptyString(raw, 'slug', source)
  if (!SLUG_PATTERN.test(slug)) {
    fail(source, 'slug 只能包含小写字母、数字和单个连字符')
  }

  const directoryMatch = source.replace(/\\/g, '/').match(/\/level-(\d+)\/challenge\.json$/)
  if (directoryMatch !== null && Number(directoryMatch[1]) !== raw.id) {
    fail(source, `id ${String(raw.id)} 与目录 level-${directoryMatch[1]} 不一致`)
  }

  return {
    schemaVersion: 1,
    id: raw.id as number,
    slug,
    name: readNonEmptyString(raw, 'name', source),
    tagline: readNonEmptyString(raw, 'tagline', source),
    story: readNonEmptyString(raw, 'story', source),
    goals: readStringList(raw, 'goals', source),
    suggestedCommands: readStringList(raw, 'suggestedCommands', source),
    guide: readGuide(raw, source),
    concepts: readConcepts(raw, source),
    takeaway: readOptionalString(raw, 'takeaway', source),
    hints: readStringList(raw, 'hints', source),
    teaches: readStringList(raw, 'teaches', source),
    checkUsage: readNonEmptyString(raw, 'checkUsage', source),
  }
}

/**
 * 加载 Vite glob 得到的全部 manifest，并保证编号连续、slug 唯一。
 * 这样缺文件、重复编号或跳号会在应用初始化时直接暴露，而不会产生半可用关卡。
 */
export function loadChallengeManifests(modules: Record<string, unknown>): ChallengeManifest[] {
  const levels = Object.entries(modules)
    .map(([source, raw]) => parseChallengeManifest(raw, source))
    .sort((left, right) => left.id - right.id)

  if (levels.length === 0) fail('manifest glob', '至少需要一个关卡')

  const slugs = new Set<string>()
  levels.forEach((level, index) => {
    const expectedId = index + 1
    if (level.id !== expectedId) {
      fail(`level-${level.id}`, `关卡编号必须连续，当前位置应为 ${expectedId}`)
    }
    if (slugs.has(level.slug)) fail(`level-${level.id}`, `slug ${level.slug} 重复`)
    slugs.add(level.slug)
  })

  return levels
}
