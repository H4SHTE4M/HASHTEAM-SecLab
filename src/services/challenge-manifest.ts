import type {
  ChallengeManifest,
  CommandField,
  CompletionSummary,
  Concept,
  HintLayer,
  LearningStep,
  LearningStepType,
  StepChoice,
  StepCompletion,
  StepQuestion,
  VerificationDef,
  VerificationPlaceholder,
} from '../types/lab'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ID_PATTERN = /^[a-z][a-z0-9-]*$/
const STEP_TYPES = new Set<LearningStepType>([
  'explain',
  'observe',
  'partial-command',
  'manual-command',
  'question',
  'checkpoint',
  'reflection',
])
const STEP_COMPLETIONS = new Set<StepCompletion>([
  'acknowledge',
  'run',
  'input',
  'answer',
  'confirm',
])
const HINT_KINDS = ['direction', 'tool', 'structure'] as const
const ALLOWED_FIELDS = new Set([
  '$schema',
  'schemaVersion',
  'id',
  'slug',
  'name',
  'tagline',
  'storySummary',
  'story',
  'goals',
  'prerequisites',
  'newConcepts',
  'steps',
  'hints',
  'verification',
  'completionSummary',
])

type UnknownRecord = Record<string, unknown>

function fail(source: string, message: string): never {
  throw new Error(`关卡配置无效（${source}）：${message}`)
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function expectRecord(value: unknown, source: string): UnknownRecord {
  if (!isRecord(value)) fail(source, '必须是对象')
  return value
}

function assertAllowedFields(
  record: UnknownRecord,
  allowed: readonly string[],
  source: string,
): void {
  const allowedSet = new Set(allowed)
  const unknown = Object.keys(record).filter((field) => !allowedSet.has(field))
  if (unknown.length > 0) fail(source, `包含未知字段：${unknown.join(', ')}`)
}

function readNonEmptyString(record: UnknownRecord, field: string, source: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(source, `${field} 必须是非空字符串`)
  }
  return value
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

function readStringList(
  record: UnknownRecord,
  field: string,
  source: string,
  allowEmpty = false,
): string[] {
  const value = record[field]
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.some((item) => typeof item !== 'string' || item.trim().length === 0)
  ) {
    fail(source, `${field} 必须是${allowEmpty ? '' : '至少包含一项的'}非空字符串数组`)
  }
  return [...value] as string[]
}

function readConcept(value: unknown, source: string): Concept {
  const record = expectRecord(value, source)
  assertAllowedFields(record, ['id', 'term', 'explanation'], source)
  const id = readNonEmptyString(record, 'id', source)
  if (!ID_PATTERN.test(id)) fail(source, 'id 必须是小写字母开头的短横线标识')
  return {
    id,
    term: readNonEmptyString(record, 'term', source),
    explanation: readNonEmptyString(record, 'explanation', source),
  }
}

function readFields(value: unknown, source: string): CommandField[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0) fail(source, 'fields 存在时必须是非空数组')
  return value.map((item, index) => {
    const itemSource = `${source}[${index}]`
    const record = expectRecord(item, itemSource)
    assertAllowedFields(record, ['id', 'label', 'placeholder'], itemSource)
    const id = readNonEmptyString(record, 'id', itemSource)
    if (!ID_PATTERN.test(id)) fail(itemSource, 'id 必须是小写字母开头的短横线标识')
    return {
      id,
      label: readNonEmptyString(record, 'label', itemSource),
      placeholder: readNonEmptyString(record, 'placeholder', itemSource),
    }
  })
}

function readQuestion(value: unknown, source: string): StepQuestion | undefined {
  if (value === undefined) return undefined
  const record = expectRecord(value, source)
  assertAllowedFields(record, ['prompt', 'choices', 'answer', 'success'], source)
  const choicesValue = record.choices
  if (!Array.isArray(choicesValue) || choicesValue.length < 2) {
    fail(source, 'choices 必须至少包含两个选项')
  }
  const choices: StepChoice[] = choicesValue.map((item, index) => {
    const itemSource = `${source}#choices[${index}]`
    const choice = expectRecord(item, itemSource)
    assertAllowedFields(choice, ['id', 'label'], itemSource)
    return {
      id: readNonEmptyString(choice, 'id', itemSource),
      label: readNonEmptyString(choice, 'label', itemSource),
    }
  })
  const answer = readNonEmptyString(record, 'answer', source)
  if (!choices.some((choice) => choice.id === answer)) {
    fail(source, 'answer 必须对应一个 choices.id')
  }
  return {
    prompt: readNonEmptyString(record, 'prompt', source),
    choices,
    answer,
    success: readNonEmptyString(record, 'success', source),
  }
}

function readSteps(record: UnknownRecord, source: string): LearningStep[] {
  const value = record.steps
  if (!Array.isArray(value) || value.length === 0) fail(source, 'steps 必须是非空数组')

  return value.map((item, index) => {
    const itemSource = `${source}#steps[${index}]`
    const step = expectRecord(item, itemSource)
    assertAllowedFields(
      step,
      [
        'id',
        'type',
        'title',
        'objective',
        'instruction',
        'completion',
        'allowRun',
        'introduces',
        'uses',
        'command',
        'commandTemplate',
        'fields',
        'observation',
        'question',
        'commonErrors',
        'reinforcement',
      ],
      itemSource,
    )
    if (!Number.isInteger(step.id) || step.id !== index + 1) {
      fail(itemSource, `id 必须连续，当前位置应为 ${index + 1}`)
    }
    if (typeof step.type !== 'string' || !STEP_TYPES.has(step.type as LearningStepType)) {
      fail(itemSource, 'type 不受支持')
    }
    if (
      typeof step.completion !== 'string' ||
      !STEP_COMPLETIONS.has(step.completion as StepCompletion)
    ) {
      fail(itemSource, 'completion 不受支持')
    }
    if (typeof step.allowRun !== 'boolean') fail(itemSource, 'allowRun 必须是布尔值')

    const introducesValue = step.introduces
    let introduces: Concept[] | undefined
    if (introducesValue !== undefined) {
      if (!Array.isArray(introducesValue) || introducesValue.length === 0) {
        fail(itemSource, 'introduces 存在时必须是非空数组')
      }
      introduces = introducesValue.map((concept, conceptIndex) =>
        readConcept(concept, `${itemSource}#introduces[${conceptIndex}]`),
      )
    }

    const uses = step.uses === undefined ? undefined : readStringList(step, 'uses', itemSource)
    const commonErrors =
      step.commonErrors === undefined
        ? undefined
        : readStringList(step, 'commonErrors', itemSource)

    return {
      id: step.id as number,
      type: step.type as LearningStepType,
      title: readNonEmptyString(step, 'title', itemSource),
      objective: readNonEmptyString(step, 'objective', itemSource),
      instruction: readNonEmptyString(step, 'instruction', itemSource),
      completion: step.completion as StepCompletion,
      allowRun: step.allowRun,
      introduces,
      uses,
      command: readOptionalString(step, 'command', itemSource),
      commandTemplate: readOptionalString(step, 'commandTemplate', itemSource),
      fields: readFields(step.fields, `${itemSource}#fields`),
      observation: readOptionalString(step, 'observation', itemSource),
      question: readQuestion(step.question, `${itemSource}#question`),
      commonErrors,
      reinforcement: readOptionalString(step, 'reinforcement', itemSource),
    }
  })
}

function readHints(record: UnknownRecord, source: string): HintLayer[] {
  const value = record.hints
  if (!Array.isArray(value) || value.length !== 3) fail(source, 'hints 必须恰好包含三层')
  return value.map((item, index) => {
    const itemSource = `${source}#hints[${index}]`
    const hint = expectRecord(item, itemSource)
    assertAllowedFields(hint, ['level', 'kind', 'text'], itemSource)
    if (hint.level !== index + 1) fail(itemSource, `level 必须为 ${index + 1}`)
    if (hint.kind !== HINT_KINDS[index]) {
      fail(itemSource, `kind 必须为 ${HINT_KINDS[index]}`)
    }
    return {
      level: (index + 1) as 1 | 2 | 3,
      kind: HINT_KINDS[index],
      text: readNonEmptyString(hint, 'text', itemSource),
    }
  })
}

function readVerification(record: UnknownRecord, source: string): VerificationDef {
  const value = expectRecord(record.verification, `${source}#verification`)
  assertAllowedFields(value, ['usage', 'instruction', 'placeholders', 'feedback'], source)
  if (!Array.isArray(value.placeholders)) fail(source, 'verification.placeholders 必须是数组')
  const placeholders: VerificationPlaceholder[] = value.placeholders.map((item, index) => {
    const itemSource = `${source}#verification.placeholders[${index}]`
    const placeholder = expectRecord(item, itemSource)
    assertAllowedFields(placeholder, ['token', 'meaning'], itemSource)
    return {
      token: readNonEmptyString(placeholder, 'token', itemSource),
      meaning: readNonEmptyString(placeholder, 'meaning', itemSource),
    }
  })
  const feedback = expectRecord(value.feedback, `${source}#verification.feedback`)
  assertAllowedFields(feedback, ['empty', 'incorrect', 'success'], `${source}#verification.feedback`)
  return {
    usage: readNonEmptyString(value, 'usage', source),
    instruction: readNonEmptyString(value, 'instruction', source),
    placeholders,
    feedback: {
      empty: readNonEmptyString(feedback, 'empty', source),
      incorrect: readNonEmptyString(feedback, 'incorrect', source),
      success: readNonEmptyString(feedback, 'success', source),
    },
  }
}

function readCompletionSummary(record: UnknownRecord, source: string): CompletionSummary {
  const value = expectRecord(record.completionSummary, `${source}#completionSummary`)
  assertAllowedFields(value, ['solved', 'mastered', 'next'], `${source}#completionSummary`)
  return {
    solved: readNonEmptyString(value, 'solved', source),
    mastered: readStringList(value, 'mastered', source),
    next: readNonEmptyString(value, 'next', source),
  }
}

/** 把不可信 JSON 转换为前端可以安全消费的关卡定义。 */
export function parseChallengeManifest(raw: unknown, source = 'unknown'): ChallengeManifest {
  if (!isRecord(raw)) fail(source, '顶层必须是对象')
  const unknownFields = Object.keys(raw).filter((field) => !ALLOWED_FIELDS.has(field))
  if (unknownFields.length > 0) fail(source, `包含未知字段：${unknownFields.join(', ')}`)
  if (raw.$schema !== '../challenge.schema.json') {
    fail(source, '$schema 必须指向 ../challenge.schema.json')
  }
  if (raw.schemaVersion !== 2) fail(source, 'schemaVersion 必须为 2')
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
    schemaVersion: 2,
    id: raw.id as number,
    slug,
    name: readNonEmptyString(raw, 'name', source),
    tagline: readNonEmptyString(raw, 'tagline', source),
    storySummary: readNonEmptyString(raw, 'storySummary', source),
    story: readNonEmptyString(raw, 'story', source),
    goals: readStringList(raw, 'goals', source),
    prerequisites: readStringList(raw, 'prerequisites', source, true),
    newConcepts: readStringList(raw, 'newConcepts', source),
    steps: readSteps(raw, source),
    hints: readHints(raw, source),
    verification: readVerification(raw, source),
    completionSummary: readCompletionSummary(raw, source),
  }
}

/** 加载全部 manifest，并保证编号连续、slug 唯一。 */
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
