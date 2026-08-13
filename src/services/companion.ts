import { normalizeAnswer } from './answer-normalize'
import { createSafeStorage, type StorageLike } from './progress-store'
import type {
  CompanionMessage,
  CompanionMessagePayload,
  CompanionObservationField,
  CompanionObservationKind,
  CompanionSessionState,
  CompanionToolRoute,
  ExternalCompanionDefinition,
  ExternalToolId,
} from '../types/companion'

export const COMPANION_CHANNEL_NAME = 'pwnhub-companion-v1'
export const COMPANION_DEFINITION_PREFIX = 'pwnhub-companion-definition-v1:'
export const COMPANION_SESSION_PREFIX = 'pwnhub-companion-session-v1:'
export const COMPANION_MESSAGE_PREFIX = 'pwnhub-companion-message-v1:'

const TOOL_IDS = new Set<ExternalToolId>(['ida', 'ghidra', 'objdump'])
const OBSERVATION_KINDS = new Set<CompanionObservationKind>(['address', 'function-name', 'integer', 'text'])
const MESSAGE_SENDER_ID = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2)
let messageCounter = 0

type RecordValue = Record<string, unknown>

export interface BroadcastChannelLike {
  postMessage(message: unknown): void
  close(): void
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void
}

export interface StorageEventTargetLike {
  addEventListener(type: 'storage', listener: (event: StorageEvent) => void): void
  removeEventListener(type: 'storage', listener: (event: StorageEvent) => void): void
}

export interface CompanionSyncOptions {
  storage?: StorageLike
  channelFactory?: ((name: string) => BroadcastChannelLike) | null
  eventTarget?: StorageEventTargetLike | null
  now?: () => number
}

export interface CompanionSync {
  publish(payload: CompanionMessagePayload): void
  dispose(): void
}

export function createCompanionUrl(
  currentLocation: string,
  labId: string,
  sourceId: string = __SOURCE_ID__,
): URL {
  const url = new URL('companion.html', currentLocation)
  url.searchParams.set('lab', labId)
  url.searchParams.set('source', sourceId)
  return url
}

function fail(source: string, message: string): never {
  throw new Error(`外部工具伴侣配置无效（${source}）：${message}`)
}

function record(value: unknown, source: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(source, '必须是对象')
  return value as RecordValue
}

function text(value: unknown, field: string, source: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(source, `${field} 必须是非空字符串`)
  return value.trim()
}

function stableId(value: unknown, field: string, source: string): string {
  const id = text(value, field, source)
  if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(source, `${field} 格式不合法`)
  return id
}

function uniqueIds(values: string[], source: string): void {
  if (new Set(values).size !== values.length) fail(source, '稳定 ID 不能重复')
}

function textArray(value: unknown, field: string, source: string): string[] {
  if (!Array.isArray(value) || value.length === 0) fail(source, `${field} 必须是非空字符串数组`)
  return value.map((item, index) => text(item, `${field}[${index}]`, source))
}

function safeDownloadUrl(value: unknown, source: string): string {
  const url = text(value, 'downloadUrl', source)
  const path = url.startsWith('./') ? url.slice(2) : url.startsWith('/') ? url.slice(1) : url
  if (
    url.startsWith('//') ||
    (!url.startsWith('./') && !url.startsWith('/')) ||
    url.includes('\\') ||
    path.split('/').some((part) => part.length === 0 || part === '.' || part === '..')
  ) {
    fail(source, 'downloadUrl 必须是同源安全相对路径')
  }
  return url
}

function readTools(value: unknown, source: string): CompanionToolRoute[] {
  if (!Array.isArray(value) || value.length < 2) fail(source, 'tools 至少需要两条等价路线')
  const tools = value.map((raw, index) => {
    const itemSource = `${source}#tools[${index}]`
    const item = record(raw, itemSource)
    const tool = text(item.tool, 'tool', itemSource)
    if (!TOOL_IDS.has(tool as ExternalToolId)) fail(itemSource, 'tool 不受支持')
    return {
      tool: tool as ExternalToolId,
      label: text(item.label, 'label', itemSource),
      versionNote: text(item.versionNote, 'versionNote', itemSource),
      installNote: text(item.installNote, 'installNote', itemSource),
      steps: textArray(item.steps, 'steps', itemSource),
    }
  })
  uniqueIds(tools.map((route) => route.tool), source)
  if (!tools.some((route) => route.tool === 'ida')) fail(source, 'tools 必须包含 IDA 路线')
  if (!tools.some((route) => route.tool === 'ghidra' || route.tool === 'objdump')) {
    fail(source, 'tools 必须包含 Ghidra 或 objdump 替代路线')
  }
  return tools
}

function readObservations(value: unknown, source: string): CompanionObservationField[] {
  if (!Array.isArray(value) || value.length === 0) fail(source, 'observations 必须是非空数组')
  const fields = value.map((raw, index) => {
    const itemSource = `${source}#observations[${index}]`
    const item = record(raw, itemSource)
    const kind = text(item.kind, 'kind', itemSource)
    if (!OBSERVATION_KINDS.has(kind as CompanionObservationKind)) fail(itemSource, 'kind 不受支持')
    if (typeof item.required !== 'boolean') fail(itemSource, 'required 必须是布尔值')
    return {
      id: stableId(item.id, 'id', itemSource),
      label: text(item.label, 'label', itemSource),
      kind: kind as CompanionObservationKind,
      placeholder: text(item.placeholder, 'placeholder', itemSource),
      required: item.required,
    }
  })
  uniqueIds(fields.map((field) => field.id), source)
  return fields
}

export function parseCompanionDefinition(raw: unknown, source = 'unknown'): ExternalCompanionDefinition {
  const item = record(raw, source)
  const artifactItem = record(item.artifact, `${source}#artifact`)
  const architecture = text(artifactItem.architecture, 'architecture', `${source}#artifact`)
  if (architecture !== 'i386' && architecture !== 'x86_64') fail(source, 'artifact.architecture 不受支持')
  const sha256 = text(artifactItem.sha256, 'sha256', `${source}#artifact`)
  if (!/^[a-f0-9]{64}$/.test(sha256)) fail(source, 'artifact.sha256 必须是 64 位小写十六进制')

  if (!Array.isArray(item.tasks) || item.tasks.length === 0) fail(source, 'tasks 必须是非空数组')
  const tasks = item.tasks.map((rawTask, index) => {
    const taskSource = `${source}#tasks[${index}]`
    const task = record(rawTask, taskSource)
    return {
      id: stableId(task.id, 'id', taskSource),
      title: text(task.title, 'title', taskSource),
      description: text(task.description, 'description', taskSource),
    }
  })
  uniqueIds(tasks.map((task) => task.id), source)
  const observations = readObservations(item.observations, source)
  const verificationCommandTemplate = normalizeAnswer(
    text(item.verificationCommandTemplate, 'verificationCommandTemplate', source),
  )
  if (!/^check(?:\s+\{\{[a-z][a-z0-9-]*\}\})+$/.test(verificationCommandTemplate)) {
    fail(source, 'verificationCommandTemplate 只允许 check 后跟字段占位符')
  }
  const placeholders = [...verificationCommandTemplate.matchAll(/\{\{([a-z][a-z0-9-]*)\}\}/g)]
    .map((match) => match[1])
  const fieldIds = new Set(observations.map((field) => field.id))
  if (placeholders.some((id) => !fieldIds.has(id))) fail(source, '验证命令引用了未知观察字段')
  if (observations.some((field) => field.required && !placeholders.includes(field.id))) {
    fail(source, '验证命令必须引用所有必填观察字段')
  }

  return {
    labId: stableId(item.labId, 'labId', source),
    title: text(item.title, 'title', source),
    artifact: {
      name: text(artifactItem.name, 'name', `${source}#artifact`),
      downloadUrl: safeDownloadUrl(artifactItem.downloadUrl, `${source}#artifact`),
      architecture,
      sha256,
      purpose: text(artifactItem.purpose, 'purpose', `${source}#artifact`),
    },
    tools: readTools(item.tools, source),
    tasks,
    observations,
    verificationCommandTemplate,
  }
}

export function normalizeCompanionObservation(kind: CompanionObservationKind, raw: string): string {
  const value = normalizeAnswer(raw)
  if (value.length === 0) throw new Error('观察值不能为空')
  if (kind === 'address') {
    if (!/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)) throw new Error('地址应为十进制或 0x 开头的十六进制')
    const parsed = BigInt(value)
    if (parsed < 0n || parsed > 0xffffffffffffffffn) throw new Error('地址超出 64 位范围')
    return `0x${parsed.toString(16)}`
  }
  if (kind === 'integer') {
    if (!/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)) throw new Error('常量应为十进制或 0x 开头的十六进制')
    return BigInt(value).toString(10)
  }
  if (kind === 'function-name') {
    if (!/^[a-z_.$?@][a-z0-9_.$?@-]*$/i.test(value)) throw new Error('函数名包含不支持的字符')
    return value
  }
  return value
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

export function buildCompanionVerificationCommand(
  definition: ExternalCompanionDefinition,
  values: Record<string, string>,
): { command: string; values: Record<string, string> } {
  const normalized: Record<string, string> = {}
  for (const field of definition.observations) {
    const raw = values[field.id] ?? ''
    if (!field.required && normalizeAnswer(raw).length === 0) continue
    normalized[field.id] = normalizeCompanionObservation(field.kind, raw)
  }
  const missing = definition.observations.find((field) => field.required && normalized[field.id] === undefined)
  if (missing) throw new Error(`请填写“${missing.label}”`)
  const command = definition.verificationCommandTemplate.replace(
    /\{\{([a-z][a-z0-9-]*)\}\}/g,
    (_, id: string) => shellQuote(normalized[id] ?? ''),
  )
  if (/\{\{[^{}]+\}\}/.test(command)) throw new Error('验证命令仍有未替换字段')
  return { command, values: normalized }
}

function definitionKey(labId: string): string {
  return `${COMPANION_DEFINITION_PREFIX}${labId}`
}

function sessionKey(labId: string): string {
  return `${COMPANION_SESSION_PREFIX}${labId}`
}

function messageKey(labId: string): string {
  return `${COMPANION_MESSAGE_PREFIX}${labId}`
}

export function saveCompanionDefinition(
  definition: ExternalCompanionDefinition,
  storage: StorageLike = createSafeStorage(),
): void {
  storage.setItem(definitionKey(definition.labId), JSON.stringify(definition))
}

export function loadCompanionDefinition(
  labId: string,
  storage: StorageLike = createSafeStorage(),
): ExternalCompanionDefinition | null {
  const raw = storage.getItem(definitionKey(labId))
  if (raw === null) return null
  try {
    return parseCompanionDefinition(JSON.parse(raw), `LocalStorage:${labId}`)
  } catch {
    return null
  }
}

export function createDefaultCompanionState(
  definition: ExternalCompanionDefinition,
  now = Date.now(),
): CompanionSessionState {
  return {
    schemaVersion: 1,
    labId: definition.labId,
    selectedTool: definition.tools[0].tool,
    completedTaskIds: [],
    observations: {},
    updatedAt: now,
  }
}

export function loadCompanionState(
  definition: ExternalCompanionDefinition,
  storage: StorageLike = createSafeStorage(),
): CompanionSessionState {
  const raw = storage.getItem(sessionKey(definition.labId))
  if (raw === null) return createDefaultCompanionState(definition)
  try {
    const value = JSON.parse(raw) as Partial<CompanionSessionState>
    const taskIds = new Set(definition.tasks.map((task) => task.id))
    const fieldIds = new Set(definition.observations.map((field) => field.id))
    if (
      value.schemaVersion !== 1 ||
      value.labId !== definition.labId ||
      !TOOL_IDS.has(value.selectedTool as ExternalToolId) ||
      !definition.tools.some((route) => route.tool === value.selectedTool) ||
      !Array.isArray(value.completedTaskIds) ||
      value.completedTaskIds.some((id) => typeof id !== 'string' || !taskIds.has(id)) ||
      new Set(value.completedTaskIds).size !== value.completedTaskIds.length ||
      typeof value.observations !== 'object' ||
      value.observations === null ||
      Object.entries(value.observations).some(([id, observation]) => !fieldIds.has(id) || typeof observation !== 'string') ||
      typeof value.updatedAt !== 'number' ||
      !Number.isFinite(value.updatedAt)
    ) {
      return createDefaultCompanionState(definition)
    }
    return value as CompanionSessionState
  } catch {
    return createDefaultCompanionState(definition)
  }
}

export function saveCompanionState(
  state: CompanionSessionState,
  storage: StorageLike = createSafeStorage(),
): void {
  storage.setItem(sessionKey(state.labId), JSON.stringify(state))
}

function isCompanionMessage(value: unknown, labId: string): value is CompanionMessage {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Partial<CompanionMessage>
  if (
    typeof message.messageId !== 'string' ||
    message.labId !== labId ||
    typeof message.updatedAt !== 'number' ||
    !Number.isFinite(message.updatedAt)
  ) return false
  if (message.type === 'companion-ready') return true
  if (message.type === 'observation') return typeof message.field === 'string' && typeof message.value === 'string'
  if (message.type === 'companion-progress') return typeof message.stepId === 'string' && typeof message.completed === 'boolean'
  if (message.type === 'tool-selected') return TOOL_IDS.has(message.tool as ExternalToolId)
  return false
}

function defaultChannelFactory(name: string): BroadcastChannelLike {
  return new BroadcastChannel(name)
}

export function createCompanionSync(
  labId: string,
  onMessage: (message: CompanionMessage) => void,
  options: CompanionSyncOptions = {},
): CompanionSync {
  const storage = options.storage ?? createSafeStorage()
  const now = options.now ?? Date.now
  const channelFactory = options.channelFactory === undefined
    ? (typeof BroadcastChannel === 'function' ? defaultChannelFactory : null)
    : options.channelFactory
  const eventTarget: StorageEventTargetLike | null = options.eventTarget === undefined
    ? (typeof window === 'undefined' ? null : window as unknown as StorageEventTargetLike)
    : options.eventTarget
  let channel: BroadcastChannelLike | null = null
  try {
    channel = channelFactory?.(COMPANION_CHANNEL_NAME) ?? null
  } catch {
    // 某些隐私模式暴露构造器但拒绝创建频道，LocalStorage 仍可保留与同步进度。
    channel = null
  }
  const seen = new Set<string>()

  function deliver(value: unknown): void {
    if (!isCompanionMessage(value, labId) || seen.has(value.messageId)) return
    seen.add(value.messageId)
    if (seen.size > 256) seen.delete(seen.values().next().value ?? '')
    onMessage(value)
  }

  const channelListener = (event: MessageEvent): void => deliver(event.data)
  const storageListener = (event: StorageEvent): void => {
    if (event.key !== messageKey(labId) || event.newValue === null) return
    try { deliver(JSON.parse(event.newValue)) } catch { /* 忽略损坏的跨窗口消息。 */ }
  }
  channel?.addEventListener('message', channelListener)
  eventTarget?.addEventListener('storage', storageListener)

  return {
    publish(payload) {
      if (payload.labId !== labId) throw new Error('伴侣消息 labId 与当前会话不一致')
      messageCounter += 1
      const message: CompanionMessage = {
        ...payload,
        messageId: `${MESSAGE_SENDER_ID}-${now().toString(36)}-${messageCounter.toString(36)}`,
        updatedAt: now(),
      }
      seen.add(message.messageId)
      storage.setItem(messageKey(labId), JSON.stringify(message))
      channel?.postMessage(message)
    },
    dispose() {
      channel?.removeEventListener('message', channelListener)
      channel?.close()
      eventTarget?.removeEventListener('storage', storageListener)
    },
  }
}
