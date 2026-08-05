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

/**
 * 步骤类型 → 完成证据的固定映射（与 scripts/validate-challenges.mjs 一致）。
 * 运行时同样强制，防止绕过构建期校验的畸形清单进入 UI。
 */
const COMPLETION_BY_TYPE: Record<LearningStepType, StepCompletion> = {
  explain: 'acknowledge',
  observe: 'run',
  'partial-command': 'input',
  'manual-command': 'input',
  question: 'answer',
  checkpoint: 'confirm',
  reflection: 'acknowledge',
}
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

    // 类型 ↔ completion 固定映射与类型专属约束（与 validate-challenges.mjs 同则）
    const type = step.type as LearningStepType
    const completion = step.completion as StepCompletion
    if (COMPLETION_BY_TYPE[type] !== completion) {
      fail(itemSource, `${type} 步骤必须使用 completion=${COMPLETION_BY_TYPE[type]}`)
    }
    const allowRun = step.allowRun as boolean
    if (allowRun && (step.command === undefined || completion !== 'run')) {
      fail(itemSource, '允许一键运行的步骤必须提供 command，并以 run 作为完成证据')
    }
    if (step.command !== undefined && !allowRun) {
      fail(itemSource, 'command 只能出现在 allowRun=true 的观察步骤')
    }
    if ((type === 'observe' || type === 'checkpoint') && step.observation === undefined) {
      fail(itemSource, `${type} 必须说明需要观察什么`)
    }
    if (type === 'partial-command') {
      if (allowRun) fail(itemSource, 'partial-command 不允许一键运行')
      if (step.commandTemplate === undefined) {
        fail(itemSource, 'partial-command 必须提供 commandTemplate')
      }
      if (step.fields === undefined) fail(itemSource, 'partial-command 必须提供 fields')
    }
    if (type === 'manual-command') {
      if (allowRun) fail(itemSource, 'manual-command 不允许一键运行')
      if (
        step.command !== undefined ||
        step.commandTemplate !== undefined ||
        step.fields !== undefined
      ) {
        fail(itemSource, 'manual-command 不能预置命令、模板或字段')
      }
    }
    if (type === 'question' && step.question === undefined) {
      fail(itemSource, 'question 步骤必须提供 question 对象')
    }

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

    const commandTemplate = readOptionalString(step, 'commandTemplate', itemSource)
    const fields = readFields(step.fields, `${itemSource}#fields`)
    if (type === 'partial-command' && commandTemplate !== undefined && fields !== undefined) {
      // 模板空位 {{field-id}} 与 fields 声明必须一一对应（集合语义）
      const used = [
        ...new Set(
          [...commandTemplate.matchAll(/\{\{([a-z][a-z0-9-]*)\}\}/g)].map((match) => match[1]),
        ),
      ].sort()
      const declared = [...new Set(fields.map((field) => field.id))].sort()
      if (JSON.stringify(declared) !== JSON.stringify(used)) {
        fail(
          itemSource,
          `commandTemplate 空位 ${used.join(', ')} 与 fields ${declared.join(', ')} 不一致`,
        )
      }
    }

    return {
      id: step.id as number,
      type,
      title: readNonEmptyString(step, 'title', itemSource),
      objective: readNonEmptyString(step, 'objective', itemSource),
      instruction: readNonEmptyString(step, 'instruction', itemSource),
      completion,
      allowRun,
      introduces,
      uses,
      command: readOptionalString(step, 'command', itemSource),
      commandTemplate,
      fields,
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
  const usage = readNonEmptyString(value, 'usage', source)
  if (!Array.isArray(value.placeholders)) fail(source, 'verification.placeholders 必须是数组')
  const placeholders: VerificationPlaceholder[] = value.placeholders.map((item, index) => {
    const itemSource = `${source}#verification.placeholders[${index}]`
    const placeholder = expectRecord(item, itemSource)
    assertAllowedFields(placeholder, ['token', 'meaning'], itemSource)
    const token = readNonEmptyString(placeholder, 'token', itemSource)
    if (!/^<[^<>\n]+>$/.test(token)) fail(itemSource, 'token 必须是 <占位符> 形式')
    return {
      token,
      meaning: readNonEmptyString(placeholder, 'meaning', itemSource),
    }
  })
  // usage 中出现的每个 <占位符> 都必须有解释（与 validate-challenges.mjs 同则）
  const described = placeholders.map((item) => item.token).sort()
  const used = [...usage.matchAll(/<[^<>\n]+>/g)].map((match) => match[0]).sort()
  if (JSON.stringify(described) !== JSON.stringify(used)) {
    fail(source, `验证命令占位符 ${used.join(', ')} 必须逐一提供解释`)
  }
  const feedback = expectRecord(value.feedback, `${source}#verification.feedback`)
  assertAllowedFields(feedback, ['empty', 'incorrect', 'success'], `${source}#verification.feedback`)
  return {
    usage,
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

/** 加载全部 manifest，保证编号连续、slug 唯一，并校验跨关卡概念时序。 */
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

  // 概念时序（与 validate-challenges.mjs 的 validateConceptTiming 同则）：
  // 概念 id 全局唯一、按关卡顺序累积；uses 不得引用尚未介绍的概念；
  // 单关新增概念不超过 3 个，且 newConcepts 必须与步骤实际引入的概念一致。
  const knownConcepts = new Set<string>()
  for (const level of levels) {
    const introducedTerms: string[] = []
    const introducedHere = new Set<string>()
    level.steps.forEach((step, index) => {
      const stepSource = `level-${level.id}#steps[${index}]`
      for (const concept of step.introduces ?? []) {
        if (knownConcepts.has(concept.id) || introducedHere.has(concept.id)) {
          fail(stepSource, `概念 id ${concept.id} 重复定义`)
        }
        knownConcepts.add(concept.id)
        introducedHere.add(concept.id)
        introducedTerms.push(concept.term)
      }
      for (const conceptId of step.uses ?? []) {
        if (!knownConcepts.has(conceptId)) {
          fail(stepSource, `概念 ${conceptId} 在首次解释前被使用`)
        }
      }
    })
    if (introducedTerms.length > 3) fail(`level-${level.id}`, '单关主要新增概念不能超过 3 个')
    if (
      JSON.stringify([...introducedTerms].sort()) !==
      JSON.stringify([...level.newConcepts].sort())
    ) {
      fail(`level-${level.id}`, 'newConcepts 必须与步骤中实际首次出现的概念一致')
    }
  }

  return levels
}
