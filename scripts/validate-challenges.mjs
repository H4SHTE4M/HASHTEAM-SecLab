#!/usr/bin/env node
/**
 * 构建前校验关卡结构与教学质量。
 *
 * 这里刻意只检查可以结构化判断的退化：步骤/提示顺序、独立操作、
 * 命令模板、概念时机、占位符说明、答案泄露和明显失真的规模描述。
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const levelsRoot = path.join(root, 'vm/rootfs-overlay/opt/hashteam/levels')
const answersFixture = path.join(root, 'tests/fixtures/level-answers.json')
// 明文答案仅存于测试夹具；VM 镜像内是对应的加盐 SHA-256（scripts/hash-answer.sh 生成）。
const testAnswers = JSON.parse(readFileSync(answersFixture, 'utf8'))
const errors = []
const allowedTypes = new Set([
  'explain',
  'observe',
  'partial-command',
  'manual-command',
  'question',
  'checkpoint',
  'reflection',
])
const allowedCompletions = new Set(['acknowledge', 'run', 'input', 'answer', 'confirm'])
const completionByType = {
  explain: 'acknowledge',
  observe: 'run',
  'partial-command': 'input',
  'manual-command': 'input',
  question: 'answer',
  checkpoint: 'confirm',
  reflection: 'acknowledge',
}
const topFields = new Set([
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
const stepFields = new Set([
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
])
const guardedDiscoveries = new Map([
  [8, ['31337']],
  [9, ['/debug', 'backup.txt', 'dbg-token-8848']],
  [10, ['debug=false', 'allow_guest=false', 'listen=127.0.0.1']],
])

function report(source, message) {
  errors.push(`${source}: ${message}`)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function stringList(value, source, field, { allowEmpty = false } = {}) {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.some((item) => !isNonEmptyString(item))
  ) {
    report(source, `${field} 必须是${allowEmpty ? '' : '至少包含一项的'}非空字符串数组`)
    return []
  }
  return value
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

function validateConcept(concept, source) {
  if (!isRecord(concept)) {
    report(source, '概念必须是对象')
    return null
  }
  const unknown = Object.keys(concept).filter(
    (field) => !['id', 'term', 'explanation'].includes(field),
  )
  if (unknown.length > 0) report(source, `未知字段：${unknown.join(', ')}`)
  if (!/^[a-z][a-z0-9-]*$/.test(concept.id ?? '')) report(source, 'id 格式不合法')
  if (!isNonEmptyString(concept.term)) report(source, 'term 必须是非空字符串')
  if (!isNonEmptyString(concept.explanation)) report(source, 'explanation 必须是非空字符串')
  return concept
}

function validateTemplate(step, source) {
  const placeholders = [...(step.commandTemplate ?? '').matchAll(/\{\{([a-z][a-z0-9-]*)\}\}/g)].map(
    (match) => match[1],
  )
  if (!Array.isArray(step.fields) || step.fields.length === 0) {
    report(source, 'partial-command 必须提供 fields')
    return
  }
  const fieldIds = []
  step.fields.forEach((field, index) => {
    const fieldSource = `${source}#fields[${index}]`
    if (!isRecord(field)) {
      report(fieldSource, '必须是对象')
      return
    }
    const unknown = Object.keys(field).filter(
      (key) => !['id', 'label', 'placeholder'].includes(key),
    )
    if (unknown.length > 0) report(fieldSource, `未知字段：${unknown.join(', ')}`)
    if (!/^[a-z][a-z0-9-]*$/.test(field.id ?? '')) report(fieldSource, 'id 格式不合法')
    if (!isNonEmptyString(field.label)) report(fieldSource, 'label 必须是非空字符串')
    if (!isNonEmptyString(field.placeholder)) report(fieldSource, 'placeholder 必须是非空字符串')
    fieldIds.push(field.id)
  })
  const declared = [...new Set(fieldIds)].sort()
  const used = [...new Set(placeholders)].sort()
  if (JSON.stringify(declared) !== JSON.stringify(used)) {
    report(source, `commandTemplate 空位 ${used.join(', ')} 与 fields ${declared.join(', ')} 不一致`)
  }
}

function validateQuestion(question, source) {
  if (!isRecord(question)) {
    report(source, 'question 步骤必须提供 question 对象')
    return
  }
  if (!isNonEmptyString(question.prompt)) report(source, 'prompt 必须是非空字符串')
  if (!isNonEmptyString(question.success)) report(source, 'success 必须是非空字符串')
  if (!Array.isArray(question.choices) || question.choices.length < 2) {
    report(source, 'choices 至少需要两个选项')
    return
  }
  const ids = question.choices.map((choice) => choice?.id)
  if (!ids.includes(question.answer)) report(source, 'answer 必须对应 choices.id')
}

function validateStep(step, index, source) {
  const stepSource = `${source}#steps[${index}]`
  if (!isRecord(step)) {
    report(stepSource, '必须是对象')
    return
  }
  const unknown = Object.keys(step).filter((field) => !stepFields.has(field))
  if (unknown.length > 0) report(stepSource, `未知字段：${unknown.join(', ')}`)
  if (step.id !== index + 1) report(stepSource, `id 必须连续，当前位置应为 ${index + 1}`)
  if (!allowedTypes.has(step.type)) report(stepSource, `步骤类型 ${String(step.type)} 不合法`)
  if (!allowedCompletions.has(step.completion)) {
    report(stepSource, `completion ${String(step.completion)} 不合法`)
  } else if (completionByType[step.type] !== step.completion) {
    report(stepSource, `${step.type} 步骤必须使用 completion=${completionByType[step.type]}`)
  }
  for (const field of ['title', 'objective', 'instruction']) {
    if (!isNonEmptyString(step[field])) report(stepSource, `${field} 必须是非空字符串`)
  }
  if (typeof step.allowRun !== 'boolean') report(stepSource, 'allowRun 必须是布尔值')
  if (step.allowRun && (!isNonEmptyString(step.command) || step.completion !== 'run')) {
    report(stepSource, '允许一键运行的步骤必须提供 command，并以 run 作为完成证据')
  }
  if (step.command !== undefined && !step.allowRun) {
    report(stepSource, 'command 只能出现在 allowRun=true 的观察步骤')
  }
  if (step.type === 'observe' && !isNonEmptyString(step.observation)) {
    report(stepSource, 'observe 必须说明需要观察什么')
  }
  if (step.type === 'partial-command') {
    if (step.allowRun) report(stepSource, 'partial-command 不允许一键运行')
    if (!isNonEmptyString(step.commandTemplate)) report(stepSource, '必须提供 commandTemplate')
    validateTemplate(step, stepSource)
  }
  if (step.type === 'manual-command') {
    if (step.allowRun) report(stepSource, 'manual-command 不允许一键运行')
    if (step.command !== undefined || step.commandTemplate !== undefined || step.fields !== undefined) {
      report(stepSource, 'manual-command 不能预置命令、模板或字段')
    }
  }
  if (step.type === 'question') validateQuestion(step.question, `${stepSource}#question`)
  if (step.type === 'checkpoint' && !isNonEmptyString(step.observation)) {
    report(stepSource, 'checkpoint 必须说明要确认的中间结果')
  }
  if (step.uses !== undefined) stringList(step.uses, stepSource, 'uses')
  if (step.commonErrors !== undefined) stringList(step.commonErrors, stepSource, 'commonErrors')
  if (step.introduces !== undefined) {
    if (!Array.isArray(step.introduces) || step.introduces.length === 0) {
      report(stepSource, 'introduces 存在时必须是非空数组')
    } else {
      step.introduces.forEach((concept, conceptIndex) =>
        validateConcept(concept, `${stepSource}#introduces[${conceptIndex}]`),
      )
    }
  }
}

function validateHints(hints, source) {
  const expectedKinds = ['direction', 'tool', 'structure']
  if (!Array.isArray(hints) || hints.length !== 3) {
    report(source, 'hints 必须恰好包含由弱到强的三层')
    return
  }
  hints.forEach((hint, index) => {
    const hintSource = `${source}#hints[${index}]`
    if (!isRecord(hint)) {
      report(hintSource, '必须是对象')
      return
    }
    if (hint.level !== index + 1) report(hintSource, `level 必须为 ${index + 1}`)
    if (hint.kind !== expectedKinds[index]) {
      report(hintSource, `kind 必须按 direction → tool → structure 排列`)
    }
    if (!isNonEmptyString(hint.text)) report(hintSource, 'text 必须是非空字符串')
  })
}

function validateVerification(verification, source) {
  if (!isRecord(verification)) {
    report(source, 'verification 必须是对象')
    return
  }
  if (!isNonEmptyString(verification.usage)) report(source, 'verification.usage 不能为空')
  if (!isNonEmptyString(verification.instruction)) {
    report(source, 'verification.instruction 不能为空')
  }
  if (!Array.isArray(verification.placeholders)) {
    report(source, 'verification.placeholders 必须是数组')
    return
  }
  const described = verification.placeholders.map((item) => item?.token).sort()
  const used = [...(verification.usage ?? '').matchAll(/<[^<>\n]+>/g)].map((match) => match[0]).sort()
  if (JSON.stringify(described) !== JSON.stringify(used)) {
    report(source, `验证命令占位符 ${used.join(', ')} 必须逐一提供解释`)
  }
  verification.placeholders.forEach((item, index) => {
    if (!isRecord(item) || !/^<[^<>\n]+>$/.test(item.token ?? '') || !isNonEmptyString(item.meaning)) {
      report(`${source}#verification.placeholders[${index}]`, 'token 或 meaning 不合法')
    }
  })
  const feedback = verification.feedback
  if (!isRecord(feedback) || ['empty', 'incorrect', 'success'].some((key) => !isNonEmptyString(feedback[key]))) {
    report(source, 'verification.feedback 必须区分 empty、incorrect 和 success')
  }
}

function preCompletionText(manifest) {
  return [
    manifest.storySummary,
    manifest.story,
    ...(manifest.goals ?? []),
    ...(manifest.hints ?? []).map((hint) => hint?.text),
    ...(manifest.steps ?? []).flatMap((step) => [
      step?.title,
      step?.objective,
      step?.instruction,
      step?.command,
      step?.commandTemplate,
      step?.observation,
    ]),
  ]
    .filter(isNonEmptyString)
    .join('\n')
}

function validateManifest(manifest, directoryId, source) {
  if (!isRecord(manifest)) {
    report(source, '顶层必须是对象')
    return null
  }
  const unknown = Object.keys(manifest).filter((field) => !topFields.has(field))
  if (unknown.length > 0) report(source, `未知字段：${unknown.join(', ')}`)
  if (manifest.$schema !== '../challenge.schema.json') {
    report(source, '$schema 必须指向 ../challenge.schema.json')
  }
  if (manifest.schemaVersion !== 2) report(source, 'schemaVersion 必须为 2')
  if (!Number.isInteger(manifest.id) || manifest.id !== directoryId) {
    report(source, `id 必须与目录 level-${directoryId} 一致`)
  }
  for (const field of ['slug', 'name', 'tagline', 'storySummary', 'story']) {
    if (!isNonEmptyString(manifest[field])) report(source, `${field} 必须是非空字符串`)
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.slug ?? '')) {
    report(source, 'slug 格式不合法')
  }
  stringList(manifest.goals, source, 'goals')
  stringList(manifest.prerequisites, source, 'prerequisites', { allowEmpty: true })
  stringList(manifest.newConcepts, source, 'newConcepts')
  if (!Array.isArray(manifest.steps) || manifest.steps.length === 0) {
    report(source, 'steps 必须是非空数组')
  } else {
    manifest.steps.forEach((step, index) => validateStep(step, index, source))
    if (!manifest.steps.some((step) => ['input', 'answer'].includes(step?.completion))) {
      report(source, '每关至少要有一次独立填写、手动输入或判断')
    }
    if (manifest.steps.every((step) => step?.allowRun === true)) {
      report(source, '全关不能全部依赖一键运行')
    }
  }
  validateHints(manifest.hints, source)
  validateVerification(manifest.verification, source)
  if (!isRecord(manifest.completionSummary)) {
    report(source, 'completionSummary 必须是对象')
  } else {
    if (!isNonEmptyString(manifest.completionSummary.solved)) {
      report(source, 'completionSummary.solved 不能为空')
    }
    stringList(manifest.completionSummary.mastered, source, 'completionSummary.mastered')
    if (!isNonEmptyString(manifest.completionSummary.next)) {
      report(source, 'completionSummary.next 不能为空')
    }
  }

  const early = preCompletionText(manifest)
  if (/见下方概念|通关后(?:再|才)/.test(early)) {
    report(source, '通关前内容不能引用通关后或尚不可见的概念')
  }
  if (/几百行|成千上万行|上千行/.test(early)) {
    report(source, '日志规模描述与当前 84 行训练数据不一致')
  }
  const answer = testAnswers[String(directoryId)]?.trim()
  if (answer !== undefined) {
    if (answer.length >= 3 && early.includes(answer)) report(source, `通关答案 ${answer} 在通关前内容中泄露`)
    const hashFile = path.join(levelsRoot, `level-${directoryId}`, 'answer.sha256')
    let storedHash = null
    try {
      storedHash = readFileSync(hashFile, 'utf8').trim()
    } catch {
      report(source, `存在测试答案但缺少 answer.sha256（用 scripts/hash-answer.sh 生成）`)
    }
    if (storedHash !== null) {
      const expectedHash = createHash('sha256')
        .update(`hashteam-lab answer v1 level-${directoryId}:${answer}`)
        .digest('hex')
      if (storedHash !== expectedHash) {
        report(source, 'answer.sha256 与测试答案夹具不一致（用 scripts/hash-answer.sh 重新生成）')
      }
    }
  }
  if (existsSync(path.join(levelsRoot, `level-${directoryId}`, 'answer'))) {
    report(source, '明文 answer 文件不得进入镜像；答案改用 answer.sha256 + 测试夹具')
  }
  for (const discovery of guardedDiscoveries.get(directoryId) ?? []) {
    if (early.includes(discovery)) report(source, `关键发现 ${discovery} 在初始教学内容中泄露`)
  }
  return manifest
}

function validateConceptTiming(manifests) {
  const known = new Set()
  for (const { source, manifest } of manifests) {
    const introducedTerms = []
    const introducedHere = new Set()
    for (const [index, step] of manifest.steps.entries()) {
      const stepSource = `${source}#steps[${index}]`
      for (const concept of step.introduces ?? []) {
        if (known.has(concept.id) || introducedHere.has(concept.id)) {
          report(stepSource, `概念 id ${concept.id} 重复定义`)
        }
        known.add(concept.id)
        introducedHere.add(concept.id)
        introducedTerms.push(concept.term)
      }
      for (const conceptId of step.uses ?? []) {
        if (!known.has(conceptId)) {
          report(stepSource, `概念 ${conceptId} 在首次解释前被使用`)
        }
      }
    }
    if (introducedTerms.length > 3) report(source, '单关主要新增概念不能超过 3 个')
    if (
      JSON.stringify([...introducedTerms].sort()) !==
      JSON.stringify([...(manifest.newConcepts ?? [])].sort())
    ) {
      report(source, 'newConcepts 必须与步骤中实际首次出现的概念一致')
    }
  }
}

const schemaFile = path.join(levelsRoot, 'challenge.schema.json')
try {
  JSON.parse(readFileSync(schemaFile, 'utf8'))
} catch (error) {
  report(path.relative(root, schemaFile), `无法解析 JSON Schema：${String(error)}`)
}

const levelDirectories = readdirSync(levelsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^level-\d+$/.test(entry.name))
  .map((entry) => ({
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
    report(path.relative(root, manifestFile), `无法解析 JSON：${String(error)}`)
    continue
  }
  const source = path.relative(root, manifestFile)
  const manifest = validateManifest(raw, level.id, source)
  if (manifest !== null) manifests.push({ source, manifest })
}

const slugs = new Set()
manifests.forEach(({ source, manifest }, index) => {
  if (manifest.id !== index + 1) report(source, `关卡编号必须连续，当前位置应为 ${index + 1}`)
  if (slugs.has(manifest.slug)) report(source, `slug ${manifest.slug} 重复`)
  slugs.add(manifest.slug)
})
validateConceptTiming(manifests)

if (errors.length > 0) {
  console.error(`关卡配置校验失败（${errors.length} 项）：`)
  errors.forEach((message) => console.error(`  ✗ ${message}`))
  process.exit(1)
}

console.log(
  `✓ ${manifests.length} 个关卡通过结构、概念时机、独立操作、分层提示与答案泄露校验`,
)
