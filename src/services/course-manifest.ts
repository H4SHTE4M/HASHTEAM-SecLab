import type {
  Concept,
  CourseLabManifest,
  CourseStep,
  EnvironmentProfile,
  GeneralCourseStep,
  HintLayer,
  LabArtifact,
  LabKind,
  LabVerification,
  StepChoice,
  StepCompletion,
  StepQuestion,
  VerificationType,
} from '../types/lab'
import type {
  BinaryWorkbenchSnapshot,
  BinaryWorkbenchTab,
  MemoryCellKind,
  PayloadSegmentDefinition,
  PayloadWorkbenchPreset,
} from '../types/binary'
import { parseChallengeManifest } from './challenge-manifest'
import { parseCompanionDefinition } from './companion'
import {
  DEFAULT_PAYLOAD_LIMIT,
  composePayload,
  parseHexBytes,
  parseUint32,
  validatePayloadPath,
} from './payload'

const LAB_KINDS = new Set<LabKind>([
  'terminal',
  'visual',
  'elf',
  'gdb',
  'external-tool',
  'pwn',
])
const PROFILES = new Set<EnvironmentProfile>(['base', 'binary'])
const VERIFICATION_TYPES = new Set<VerificationType>([
  'terminal-state',
  'answer',
  'payload-replay',
  'external-observation',
  'debugger-state',
])
const EXTENDED_STEP_TYPES = new Set([
  'concept',
  'terminal',
  'prediction',
  'visual-trace',
  'external-tool',
  'worksheet',
  'payload-builder',
])
const STEP_EVIDENCE = new Set(['observation', 'prediction', 'answer', 'external-observation', 'payload-replay'])
const STEP_TOOLS = new Set(['gdb', 'pwndbg', 'ida', 'ghidra', 'elf', 'shell'])
const STACK_KINDS = new Set(['stack-pointer', 'frame-pointer', 'return-address', 'local', 'argument', 'payload'])
const MEMORY_KINDS = new Set(['value', 'pointer', 'signed'])
const TRACE_KINDS = new Set(['call', 'current', 'return'])
const PROTECTION_NAMES = new Set(['architecture', 'nx', 'pie', 'canary', 'relro', 'symbols'])
const PROTECTION_STATES = new Set(['enabled', 'disabled', 'partial', 'present', 'stripped', 'unknown'])
const VISUAL_TABS = new Set<BinaryWorkbenchTab>(['bytes', 'memory', 'registers', 'stack', 'trace', 'protections'])

type RecordValue = Record<string, unknown>

function fail(source: string, message: string): never {
  throw new Error(`课程实验配置无效（${source}）：${message}`)
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown, source: string): RecordValue {
  if (!isRecord(value)) fail(source, '必须是对象')
  return value
}

function nonEmpty(value: unknown, field: string, source: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(source, `${field} 必须是非空字符串`)
  return value
}

function stringList(value: unknown, field: string, source: string, allowEmpty = false): string[] {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.some((item) => typeof item !== 'string' || item.trim().length === 0)
  ) {
    fail(source, `${field} 必须是${allowEmpty ? '' : '至少一项的'}字符串数组`)
  }
  return [...value] as string[]
}

function integer(value: unknown, field: string, source: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    fail(source, `${field} 必须是 ${min} 到 ${max} 之间的整数`)
  }
  return value as number
}

function optionalText(value: unknown, field: string, source: string): string | undefined {
  return value === undefined ? undefined : nonEmpty(value, field, source)
}

function estimatedMinutes(value: unknown, source: string): { min: number; max: number } {
  const item = record(value, `${source}#estimatedMinutes`)
  const min = item.min
  const max = item.max
  if (
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    (min as number) < 1 ||
    (max as number) < (min as number)
  ) {
    fail(source, 'estimatedMinutes 必须是正整数范围')
  }
  return { min: min as number, max: max as number }
}

function readArtifacts(value: unknown, source: string): LabArtifact[] {
  if (!Array.isArray(value)) fail(source, 'artifacts 必须是数组')
  return value.map((raw, index) => {
    const itemSource = `${source}#artifacts[${index}]`
    const item = record(raw, itemSource)
    const architecture = item.architecture
    if (architecture !== 'i386' && architecture !== 'x86_64' && architecture !== 'any') {
      fail(itemSource, 'architecture 不受支持')
    }
    const sha256 = nonEmpty(item.sha256, 'sha256', itemSource)
    if (!/^[a-f0-9]{64}$/.test(sha256)) fail(itemSource, 'sha256 必须是 64 位小写十六进制')
    if (typeof item.downloadable !== 'boolean') fail(itemSource, 'downloadable 必须是布尔值')
    return {
      path: nonEmpty(item.path, 'path', itemSource),
      architecture,
      sha256,
      purpose: nonEmpty(item.purpose, 'purpose', itemSource),
      downloadable: item.downloadable,
    } as LabArtifact
  })
}

function readConcepts(value: unknown, source: string): Concept[] {
  if (!Array.isArray(value)) fail(source, 'concepts 必须是数组')
  return value.map((raw, index) => {
    const itemSource = `${source}#concepts[${index}]`
    const item = record(raw, itemSource)
    const id = nonEmpty(item.id, 'id', itemSource)
    if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(itemSource, 'id 格式不合法')
    return {
      id,
      term: nonEmpty(item.term, 'term', itemSource),
      explanation: nonEmpty(item.explanation, 'explanation', itemSource),
    }
  })
}

function readQuestion(value: unknown, source: string): StepQuestion | undefined {
  if (value === undefined) return undefined
  const item = record(value, source)
  if (!Array.isArray(item.choices) || item.choices.length < 2) {
    fail(source, 'choices 必须至少包含两个选项')
  }
  const choices: StepChoice[] = item.choices.map((raw, index) => {
    const choiceSource = `${source}#choices[${index}]`
    const choice = record(raw, choiceSource)
    const id = nonEmpty(choice.id, 'id', choiceSource)
    if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(choiceSource, 'id 格式不合法')
    return { id, label: nonEmpty(choice.label, 'label', choiceSource) }
  })
  const answer = nonEmpty(item.answer, 'answer', source)
  if (!choices.some((choice) => choice.id === answer)) {
    fail(source, 'answer 必须对应一个 choices.id')
  }
  return {
    prompt: nonEmpty(item.prompt, 'prompt', source),
    choices,
    answer,
    success: nonEmpty(item.success, 'success', source),
  }
}

function readWorkbench(value: unknown, source: string): BinaryWorkbenchSnapshot {
  const item = record(value, `${source}#workbench`)
  const snapshot: BinaryWorkbenchSnapshot = {}

  if (item.bytes !== undefined) {
    const bytesItem = record(item.bytes, `${source}#workbench.bytes`)
    if (!Array.isArray(bytesItem.bytes) || bytesItem.bytes.length === 0 || bytesItem.bytes.length > DEFAULT_PAYLOAD_LIMIT) {
      fail(source, `workbench.bytes.bytes 必须包含 1 到 ${DEFAULT_PAYLOAD_LIMIT} 个字节`)
    }
    const bytes = bytesItem.bytes.map((byte, index) =>
      integer(byte, `bytes[${index}]`, `${source}#workbench.bytes`, 0, 0xff),
    )
    if (bytesItem.endian !== 'little' && bytesItem.endian !== 'big') {
      fail(source, 'workbench.bytes.endian 必须是 little 或 big')
    }
    const selectedOffset = bytesItem.selectedOffset === undefined
      ? undefined
      : integer(bytesItem.selectedOffset, 'selectedOffset', `${source}#workbench.bytes`, 0, Math.max(bytes.length - 1, 0))
    const selectedLength = bytesItem.selectedLength === undefined
      ? undefined
      : integer(bytesItem.selectedLength, 'selectedLength', `${source}#workbench.bytes`, 1, Math.max(bytes.length, 1))
    snapshot.bytes = {
      baseAddress: integer(bytesItem.baseAddress, 'baseAddress', `${source}#workbench.bytes`, 0, 0xffffffff),
      bytes,
      endian: bytesItem.endian,
      selectedOffset,
      selectedLength,
    }
  }

  if (item.memory !== undefined) {
    const memoryItem = record(item.memory, `${source}#workbench.memory`)
    if (memoryItem.endian !== 'little' && memoryItem.endian !== 'big') {
      fail(source, 'workbench.memory.endian 必须是 little 或 big')
    }
    if (!Array.isArray(memoryItem.cells)) fail(source, 'workbench.memory.cells 必须是数组')
    snapshot.memory = {
      endian: memoryItem.endian,
      cells: memoryItem.cells.map((raw, index) => {
        const cellSource = `${source}#workbench.memory.cells[${index}]`
        const cell = record(raw, cellSource)
        const kind = nonEmpty(cell.kind, 'kind', cellSource)
        if (!MEMORY_KINDS.has(kind)) fail(cellSource, `memory kind ${kind} 不受支持`)
        const targetAddress = cell.targetAddress === undefined
          ? undefined
          : integer(cell.targetAddress, 'targetAddress', cellSource, 0, 0xffffffff)
        return {
          address: integer(cell.address, 'address', cellSource, 0, 0xffffffff),
          name: nonEmpty(cell.name, 'name', cellSource),
          value: integer(cell.value, 'value', cellSource, 0, 0xffffffff),
          kind: kind as MemoryCellKind,
          meaning: nonEmpty(cell.meaning, 'meaning', cellSource),
          targetAddress,
          targetName: optionalText(cell.targetName, 'targetName', cellSource),
        }
      }),
    }
  }

  if (item.registers !== undefined) {
    const registerItem = record(item.registers, `${source}#workbench.registers`)
    if (!Array.isArray(registerItem.registers)) fail(source, 'workbench.registers.registers 必须是数组')
    snapshot.registers = {
      instruction: optionalText(registerItem.instruction, 'instruction', `${source}#workbench.registers`),
      registers: registerItem.registers.map((raw, index) => {
        const entry = record(raw, `${source}#workbench.registers[${index}]`)
        const name = nonEmpty(entry.name, 'name', `${source}#workbench.registers[${index}]`)
        if (!/^[a-z][a-z0-9]*$/i.test(name)) fail(source, `寄存器名 ${name} 格式不合法`)
        return {
          name,
          before: integer(entry.before, 'before', source, 0, 0xffffffff),
          after: integer(entry.after, 'after', source, 0, 0xffffffff),
        }
      }),
      flagsBefore: registerItem.flagsBefore === undefined
        ? undefined
        : stringList(registerItem.flagsBefore, 'flagsBefore', source, true),
      flagsAfter: registerItem.flagsAfter === undefined
        ? undefined
        : stringList(registerItem.flagsAfter, 'flagsAfter', source, true),
    }
  }

  if (item.stack !== undefined) {
    const stackItem = record(item.stack, `${source}#workbench.stack`)
    if (!Array.isArray(stackItem.entries)) fail(source, 'workbench.stack.entries 必须是数组')
    snapshot.stack = {
      entries: stackItem.entries.map((raw, index) => {
        const entry = record(raw, `${source}#workbench.stack.entries[${index}]`)
        const kind = nonEmpty(entry.kind, 'kind', source)
        if (!STACK_KINDS.has(kind)) fail(source, `stack kind ${kind} 不受支持`)
        return {
          address: integer(entry.address, 'address', source, 0, 0xffffffff),
          value: integer(entry.value, 'value', source, 0, 0xffffffff),
          label: nonEmpty(entry.label, 'label', source),
          kind: kind as NonNullable<BinaryWorkbenchSnapshot['stack']>['entries'][number]['kind'],
        }
      }),
    }
  }

  if (item.trace !== undefined) {
    const traceItem = record(item.trace, `${source}#workbench.trace`)
    if (!Array.isArray(traceItem.entries)) fail(source, 'workbench.trace.entries 必须是数组')
    snapshot.trace = {
      entries: traceItem.entries.map((raw, index) => {
        const entry = record(raw, `${source}#workbench.trace.entries[${index}]`)
        const kind = nonEmpty(entry.kind, 'kind', source)
        if (!TRACE_KINDS.has(kind)) fail(source, `trace kind ${kind} 不受支持`)
        return {
          id: nonEmpty(entry.id, 'id', source),
          kind: kind as NonNullable<BinaryWorkbenchSnapshot['trace']>['entries'][number]['kind'],
          functionName: nonEmpty(entry.functionName, 'functionName', source),
          instruction: nonEmpty(entry.instruction, 'instruction', source),
          stackPointer: integer(entry.stackPointer, 'stackPointer', source, 0, 0xffffffff),
        }
      }),
    }
  }

  if (item.protections !== undefined) {
    const protectionItem = record(item.protections, `${source}#workbench.protections`)
    if (!Array.isArray(protectionItem.entries)) fail(source, 'workbench.protections.entries 必须是数组')
    snapshot.protections = {
      entries: protectionItem.entries.map((raw, index) => {
        const entry = record(raw, `${source}#workbench.protections.entries[${index}]`)
        const name = nonEmpty(entry.name, 'name', source)
        const state = nonEmpty(entry.state, 'state', source)
        if (!PROTECTION_NAMES.has(name)) fail(source, `protection name ${name} 不受支持`)
        if (!PROTECTION_STATES.has(state)) fail(source, `protection state ${state} 不受支持`)
        return {
          name: name as NonNullable<BinaryWorkbenchSnapshot['protections']>['entries'][number]['name'],
          state: state as NonNullable<BinaryWorkbenchSnapshot['protections']>['entries'][number]['state'],
          evidence: nonEmpty(entry.evidence, 'evidence', source),
        }
      }),
    }
  }

  if (item.assemblyTui !== undefined) {
    snapshot.assemblyTui = readAssemblyTui(item.assemblyTui, `${source}#workbench.assemblyTui`)
  }

  if (Object.keys(snapshot).length === 0) fail(source, 'workbench 至少需要一种真实观察数据')
  return snapshot
}

function readAssemblyTui(value: unknown, source: string): NonNullable<BinaryWorkbenchSnapshot['assemblyTui']> {
  const item = record(value, source)
  const title = optionalText(item.title, 'title', source)
  if (!Array.isArray(item.states) || item.states.length === 0) fail(source, 'states 必须是非空数组')

  const states = item.states.map((raw, index) => {
    const stateSource = `${source}#states[${index}]`
    const state = record(raw, stateSource)
    const id = nonEmpty(state.id, 'id', stateSource)
    if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(stateSource, 'id 格式不合法')

    const stateWorkbench: RecordValue = {}
    for (const key of ['registers', 'stack', 'trace'] as const) {
      if (state[key] !== undefined) stateWorkbench[key] = state[key]
    }
    const parsed = readWorkbench(stateWorkbench, stateSource)
    return {
      id,
      title: nonEmpty(state.title, 'title', stateSource),
      instruction: nonEmpty(state.instruction, 'instruction', stateSource),
      explanation: nonEmpty(state.explanation, 'explanation', stateSource),
      registers: parsed.registers,
      stack: parsed.stack,
      trace: parsed.trace,
    }
  })

  return { title, states }
}

function readPayloadPreset(value: unknown, source: string): PayloadWorkbenchPreset {
  const item = record(value, `${source}#payload`)
  const maxBytes = integer(item.maxBytes, 'maxBytes', `${source}#payload`, 1, DEFAULT_PAYLOAD_LIMIT)
  if (!Array.isArray(item.segments) || item.segments.length === 0) {
    fail(source, 'payload.segments 必须是非空数组')
  }
  const seen = new Set<string>()
  const segments = item.segments.map((raw, index): PayloadSegmentDefinition => {
    const entrySource = `${source}#payload.segments[${index}]`
    const entry = record(raw, entrySource)
    const id = nonEmpty(entry.id, 'id', entrySource)
    if (!/^[a-z][a-z0-9-]*$/.test(id) || seen.has(id)) fail(entrySource, 'id 必须合法且不能重复')
    seen.add(id)
    const label = nonEmpty(entry.label, 'label', entrySource)
    if (entry.kind === 'padding') {
      return {
        id,
        label,
        kind: 'padding',
        byte: integer(entry.byte, 'byte', entrySource, 0, 0xff),
        length: integer(entry.length, 'length', entrySource, 0, maxBytes),
      }
    }
    if (entry.kind === 'p32') {
      const segment = { id, label, kind: 'p32' as const, value: nonEmpty(entry.value, 'value', entrySource) }
      try { parseUint32(segment.value) } catch (error) {
        fail(entrySource, error instanceof Error ? error.message : 'p32 数值无效')
      }
      return segment
    }
    if (entry.kind === 'hex') {
      const segment = { id, label, kind: 'hex' as const, value: nonEmpty(entry.value, 'value', entrySource) }
      try { parseHexBytes(segment.value) } catch (error) {
        fail(entrySource, error instanceof Error ? error.message : '十六进制字节无效')
      }
      return segment
    }
    if (entry.kind === 'text') {
      return { id, label, kind: 'text', value: nonEmpty(entry.value, 'value', entrySource) }
    }
    if (entry.kind === 'cyclic') {
      return {
        id,
        label,
        kind: 'cyclic',
        length: integer(entry.length, 'length', entrySource, 0, maxBytes),
      }
    }
    fail(entrySource, 'kind 不受支持')
  })
  let outputPath: string
  try { outputPath = validatePayloadPath(nonEmpty(item.outputPath, 'outputPath', `${source}#payload`)) } catch (error) {
    fail(source, error instanceof Error ? error.message : 'payload.outputPath 无效')
  }
  try { composePayload(segments, maxBytes) } catch (error) {
    fail(source, error instanceof Error ? error.message : 'payload 分段无效')
  }
  return { outputPath, maxBytes, segments }
}

function readSteps(value: unknown, source: string, labId: string): CourseStep[] {
  if (!Array.isArray(value) || value.length === 0) fail(source, 'steps 必须是非空数组')
  return value.map((raw, index) => {
    const itemSource = `${source}#steps[${index}]`
    const item = record(raw, itemSource)
    const type = nonEmpty(item.type, 'type', itemSource)
    if (!Number.isInteger(item.id) || item.id !== index + 1) fail(itemSource, 'id 必须连续')
    if (!EXTENDED_STEP_TYPES.has(type)) {
      // 旧 v2 步骤交给成熟解析器校验全部字段和完成证据映射。
      // v2 解析器看到的是只含一个步骤的临时 manifest，因此先把局部 id
      // 归一化为 1；返回时恢复它在 v3 实验中的真实连续 id。
      const legacy = parseChallengeManifest(
        {
          $schema: '../challenge.schema.json',
          schemaVersion: 2,
          id: 1,
          slug: 'course-step',
          name: 'step',
          tagline: 'step',
          storySummary: 'step',
          story: 'step',
          goals: ['step'],
          prerequisites: [],
          newConcepts: Array.isArray(item.introduces)
            ? item.introduces.map((concept) => (concept as RecordValue).term)
            : [],
          steps: [{ ...item, id: 1 }],
          hints: [
            { level: 1, kind: 'direction', text: 'observe' },
            { level: 2, kind: 'tool', text: 'tool' },
            { level: 3, kind: 'structure', text: 'structure' },
          ],
          verification: {
            usage: 'check <value>',
            instruction: 'value',
            placeholders: [{ token: '<value>', meaning: 'value' }],
            feedback: { empty: 'empty', incorrect: 'incorrect', success: 'success' },
          },
          completionSummary: { solved: 'solved', mastered: ['mastered'], next: 'next' },
        },
        `${source}#steps[${index}]`,
      )
      return { ...legacy.steps[0], id: item.id as number } as CourseStep
    }
    if (typeof item.allowRun !== 'boolean') fail(itemSource, 'allowRun 必须是布尔值')
    if (item.autoRun !== undefined && typeof item.autoRun !== 'boolean') {
      fail(itemSource, 'autoRun 必须是布尔值')
    }
    if (item.autoRun === true && type !== 'terminal') {
      fail(itemSource, 'autoRun 只能用于 terminal 步骤')
    }
    const completion = nonEmpty(item.completion, 'completion', itemSource)
    if (!['acknowledge', 'run', 'input', 'answer', 'confirm'].includes(completion)) {
      fail(itemSource, 'completion 不受支持')
    }
    const evidence = item.evidence === undefined ? undefined : nonEmpty(item.evidence, 'evidence', itemSource)
    const tool = item.tool === undefined ? undefined : nonEmpty(item.tool, 'tool', itemSource)
    if (evidence !== undefined && !STEP_EVIDENCE.has(evidence)) fail(itemSource, 'evidence 不受支持')
    if (tool !== undefined && !STEP_TOOLS.has(tool)) fail(itemSource, 'tool 不受支持')
    const introduces = item.introduces === undefined
      ? undefined
      : readConcepts(item.introduces, `${itemSource}#introduces`)
    const uses = item.uses === undefined
      ? undefined
      : stringList(item.uses, 'uses', itemSource, true)
    const question = readQuestion(item.question, `${itemSource}#question`)
    if (type === 'prediction' && (completion !== 'answer' || question === undefined)) {
      fail(itemSource, 'prediction 步骤必须提供 question 并使用 completion=answer')
    }
    const common = {
      id: item.id as number,
      title: nonEmpty(item.title, 'title', itemSource),
      objective: nonEmpty(item.objective, 'objective', itemSource),
      instruction: nonEmpty(item.instruction, 'instruction', itemSource),
      completion: completion as StepCompletion,
      allowRun: item.allowRun,
      autoRun: item.autoRun as boolean | undefined,
      introduces,
      uses,
      evidence: evidence as GeneralCourseStep['evidence'],
      tool: tool as GeneralCourseStep['tool'],
      command: optionalText(item.command, 'command', itemSource),
      observation: optionalText(item.observation, 'observation', itemSource),
      question,
      commonErrors: item.commonErrors === undefined
        ? undefined
        : stringList(item.commonErrors, 'commonErrors', itemSource),
      reinforcement: optionalText(item.reinforcement, 'reinforcement', itemSource),
    }
    if (type === 'visual-trace') {
      const initialTab = item.initialTab === undefined ? undefined : nonEmpty(item.initialTab, 'initialTab', itemSource)
      if (initialTab !== undefined && !VISUAL_TABS.has(initialTab as BinaryWorkbenchTab)) {
        fail(itemSource, 'initialTab 不受支持')
      }
      return {
        ...common,
        type: 'visual-trace',
        workbench: readWorkbench(item.workbench, itemSource),
        initialTab: initialTab as Exclude<BinaryWorkbenchTab, 'payload'> | undefined,
      }
    }
    if (type === 'payload-builder') {
      if (evidence !== 'payload-replay') fail(itemSource, 'payload-builder 的 evidence 必须是 payload-replay')
      return {
        ...common,
        type: 'payload-builder',
        evidence: 'payload-replay',
        payload: readPayloadPreset(item.payload, itemSource),
      }
    }
    if (type === 'external-tool') {
      if (evidence !== 'external-observation') {
        fail(itemSource, 'external-tool 的 evidence 必须是 external-observation')
      }
      const companion = parseCompanionDefinition(item.companion, `${itemSource}#companion`)
      if (companion.labId !== labId) fail(itemSource, 'companion.labId 必须与实验 labId 一致')
      return {
        ...common,
        type: 'external-tool',
        evidence: 'external-observation',
        companion,
      }
    }
    return { ...common, type: type as GeneralCourseStep['type'] }
  })
}

function readVerification(value: unknown, source: string): LabVerification {
  const item = record(value, `${source}#verification`)
  const type = nonEmpty(item.type, 'type', `${source}#verification`)
  if (!VERIFICATION_TYPES.has(type as VerificationType)) fail(source, 'verification.type 不受支持')
  const legacyVerification = {
    usage: item.usage,
    instruction: item.instruction,
    placeholders: item.placeholders,
    feedback: item.feedback,
  }
  const legacy = parseChallengeManifest({
    $schema: '../challenge.schema.json',
    schemaVersion: 2,
    id: 1,
    slug: 'course-verification',
    name: 'verification',
    tagline: 'verification',
    storySummary: 'verification',
    story: 'verification',
    goals: ['verification'],
    prerequisites: [],
    newConcepts: ['验证证据'],
    steps: [
      {
        id: 1,
        type: 'explain',
        title: 'verification',
        objective: 'verification',
        instruction: 'verification',
        completion: 'acknowledge',
        allowRun: false,
        introduces: [
          {
            id: 'verification-evidence',
            term: '验证证据',
            explanation: '用于校验 v3 验证结构的内部占位概念。',
          },
        ],
      },
    ],
    hints: [
      { level: 1, kind: 'direction', text: 'observe' },
      { level: 2, kind: 'tool', text: 'tool' },
      { level: 3, kind: 'structure', text: 'structure' },
    ],
    verification: legacyVerification,
    completionSummary: { solved: 'solved', mastered: ['mastered'], next: 'next' },
  })
  const debuggerCheckpoint = optionalText(
    item.debuggerCheckpoint,
    'debuggerCheckpoint',
    `${source}#verification`,
  )
  if (type === 'debugger-state') {
    if (debuggerCheckpoint === undefined || !/^[A-Za-z_.$][A-Za-z0-9_.$@]*$/.test(debuggerCheckpoint)) {
      fail(source, 'debugger-state verification 必须提供合法的 debuggerCheckpoint')
    }
  } else if (debuggerCheckpoint !== undefined) {
    fail(source, '只有 debugger-state verification 可以提供 debuggerCheckpoint')
  }
  return {
    type: type as VerificationType,
    ...legacy.verification,
    ...(debuggerCheckpoint === undefined ? {} : { debuggerCheckpoint }),
  }
}

export function parseCourseLabManifest(raw: unknown, source = 'unknown'): CourseLabManifest {
  const item = record(raw, source)
  if (item.$schema !== '../course.schema.json') fail(source, '$schema 必须指向 ../course.schema.json')
  if (item.schemaVersion !== 3) fail(source, 'schemaVersion 必须为 3')
  const kind = nonEmpty(item.kind, 'kind', source)
  if (!LAB_KINDS.has(kind as LabKind)) fail(source, 'kind 不受支持')
  const environmentProfile = nonEmpty(item.environmentProfile, 'environmentProfile', source)
  if (!PROFILES.has(environmentProfile as EnvironmentProfile)) fail(source, 'environmentProfile 不受支持')
  const parsedMinutes = estimatedMinutes(item.estimatedMinutes, source)
  const labId = nonEmpty(item.labId, 'labId', source)
  const parsedArtifacts = readArtifacts(item.artifacts, source)
  const parsedConcepts = readConcepts(item.concepts, source)
  const completion = item.completionSummary
  const verificationRecord = record(item.verification, `${source}#verification`)
  const rawSteps = Array.isArray(item.steps) ? item.steps : []
  const hasExtendedSteps = rawSteps.some((rawStep) => {
    const step = record(rawStep, `${source}#steps`)
    return EXTENDED_STEP_TYPES.has(step.type as string)
  })
  const legacySteps = rawSteps.map((rawStep, index) => {
    const step = record(rawStep, `${source}#steps`)
    if (!EXTENDED_STEP_TYPES.has(step.type as string)) return step
    return {
      id: step.id,
      type: 'explain',
      title: step.title,
      objective: step.objective,
      instruction: step.instruction,
      completion: 'acknowledge',
      allowRun: false,
      introduces: index === 0 && parsedConcepts.length > 0 ? parsedConcepts : undefined,
    }
  })
  const legacyNewConcepts = hasExtendedSteps
    ? parsedConcepts.map((concept) => concept.term)
    : rawSteps.flatMap((rawStep) => {
        const step = record(rawStep, `${source}#steps`)
        return Array.isArray(step.introduces)
          ? step.introduces.map((concept) => (record(concept, `${source}#concept`).term as string))
          : []
      })
  const legacy = parseChallengeManifest({
    $schema: '../challenge.schema.json',
    schemaVersion: 2,
    id: 1,
    slug: 'course-lab',
    name: item.title,
    tagline: item.summary,
    storySummary: item.summary,
    story: item.summary,
    goals: item.goals,
    prerequisites: item.prerequisites,
    newConcepts: legacyNewConcepts,
    steps: legacySteps,
    hints: item.hints,
    verification: {
      usage: verificationRecord.usage,
      instruction: verificationRecord.instruction,
      placeholders: verificationRecord.placeholders,
      feedback: verificationRecord.feedback,
    },
    completionSummary: completion,
  })
  return {
    $schema: '../course.schema.json',
    schemaVersion: 3,
    courseId: nonEmpty(item.courseId, 'courseId', source),
    chapterId: nonEmpty(item.chapterId, 'chapterId', source),
    labId,
    title: nonEmpty(item.title, 'title', source),
    summary: nonEmpty(item.summary, 'summary', source),
    story: item.story === undefined ? undefined : nonEmpty(item.story, 'story', source),
    goals: stringList(item.goals, 'goals', source),
    prerequisites: stringList(item.prerequisites, 'prerequisites', source, true),
    kind: kind as LabKind,
    environmentProfile: environmentProfile as EnvironmentProfile,
    estimatedMinutes: parsedMinutes,
    unlockAfter: stringList(item.unlockAfter, 'unlockAfter', source, true),
    artifacts: parsedArtifacts,
    concepts: parsedConcepts,
    steps: readSteps(item.steps, source, labId),
    hints: legacy.hints as HintLayer[],
    verification: readVerification(item.verification, source),
    completionSummary: legacy.completionSummary,
  }
}
