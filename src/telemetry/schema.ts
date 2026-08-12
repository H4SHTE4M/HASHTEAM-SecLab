/**
 * 遥测事件 schema 与 module 注册表。
 *
 * 设计目标：
 * - 强类型：所有事件类型、module、维度均由联合类型 / 常量约束，不使用任意字符串。
 * - 版本化：每个事件 batch 携带 `v` 字段，允许未来 schema 演进。
 * - 可扩展：新增 Lab 只需在 MODULES 中注册一个 module，在其 event/command
 *   allowlist 中声明允许的事件与命令，再在调用方调用 telemetry API。
 * - 不收集原始数据：事件只携带预定义的整数 / 枚举维度，绝不包含终端输入、
 *   命令参数、答案内容、账号、Cookie 或设备指纹。
 */

/** 遥测协议版本。schema 不兼容时递增；旧版本在后端被拒绝。 */
export const TELEMETRY_PROTOCOL_VERSION = 1

/** Module 标识符——对应未来闯关系列中的一个独立 Lab。 */
export type ModuleId = 'seclab'

/** SecLab 当前收集的命令 allowlist。只有出现在此列表中的命令才会被统计。 */
export const SECLAB_COMMAND_ALLOWLIST = [
  'find',
  'grep',
  'chmod',
  'ls',
  'cat',
  'cd',
  'pwd',
  'whoami',
  'check',
  'help',
  'su',
] as const

/** 受支持的被统计命令（由 VM wrapper 上报，非终端输入）。 */
export type TrackedCommand = (typeof SECLAB_COMMAND_ALLOWLIST)[number]

/** 通关路径维度（与 CompletionPath 对齐）。 */
export type CompletionPathDimension = 'guided' | 'mixed' | 'challenge'

/**
 * 单个遥测事件——判别联合，按 `type` 区分。
 * 每个事件只携带预定义的整数 / 枚举维度。
 */
export type TelemetryEvent =
  | { type: 'command'; command: TrackedCommand }
  | { type: 'level_complete'; level: number; path: CompletionPathDimension }
  | { type: 'hint'; level: number }
  | { type: 'reset'; level: number }

/** 所有事件类型的字面量联合，用于 allowlist 校验。 */
export type TelemetryEventType = TelemetryEvent['type']

/**
 * Module 注册表：声明每个 module 允许的事件类型。
 * 新增 Lab 时在此添加一条，并在 ModuleId 联合中追加对应标识符。
 */
export const MODULES: Record<ModuleId, { events: readonly TelemetryEventType[] }> = {
  seclab: {
    events: ['command', 'level_complete', 'hint', 'reset'],
  },
}

/** Batch 上限：单个请求最多携带的事件数，防止客户端刷量。 */
export const MAX_EVENTS_PER_BATCH = 50

/** 队列上限：超出后丢弃最早的事件（遥测绝不阻塞业务）。 */
export const MAX_QUEUE_SIZE = 200

/** 单 session 生命周期内允许上报的事件总数上限。 */
export const MAX_EVENTS_PER_SESSION = 500

/** Session token 有效期（毫秒）。后端按此过期清理。 */
export const SESSION_TTL_MS = 30 * 60 * 1000

/** 批量发送的静默间隔（毫秒）：队列非空时最多每 5 秒发一批。 */
export const FLUSH_INTERVAL_MS = 5_000

/** 批量发送的触发阈值：队列达到此数量立即发送。 */
export const FLUSH_THRESHOLD = 10

/** 事件请求超时（毫秒）：超时后放弃本批，不重试。 */
export const REQUEST_TIMEOUT_MS = 4_000

/**
 * 校验 module 是否已注册。
 */
export function isRegisteredModule(value: string): value is ModuleId {
  return value in MODULES
}

/**
 * 校验事件类型是否属于指定 module 的 allowlist。
 */
export function isAllowedEvent(mod: ModuleId, type: string): boolean {
  return MODULES[mod].events.includes(type as TelemetryEventType)
}

/**
 * 校验命令是否属于 SecLab 命令 allowlist。
 */
export function isAllowedCommand(command: string): command is TrackedCommand {
  return (SECLAB_COMMAND_ALLOWLIST as readonly string[]).includes(command)
}

/**
 * 校验通关路径维度。
 */
export function isValidCompletionPath(value: string): value is CompletionPathDimension {
  return value === 'guided' || value === 'mixed' || value === 'challenge'
}
