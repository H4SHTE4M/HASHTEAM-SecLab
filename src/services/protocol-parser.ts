import type { ProtocolMessage } from '../types/lab'

export const PROTOCOL_MARKER = '@@HASHTEAM:'

/** 单个缓冲区允许的最大长度，防止异常数据无限累积 */
const MAX_BUFFER_LENGTH = 4096

export interface FeedResult {
  /** 过滤掉协议消息后、应显示到终端的原始文本 */
  display: string
  /** 本次数据块中解析出的协议消息 */
  messages: ProtocolMessage[]
}

/**
 * 串口协议解析器。
 *
 * 串口字节流中混杂着普通 Linux 输出和 @@HASHTEAM:{json} 控制行。
 * 解析器按行切分：
 * - 以 @@HASHTEAM: 开头的行 → 解析 JSON，产出协议消息，不显示到终端；
 * - 其他行 → 原样透传到终端；
 * - 不完整的一行（半包）会暂存到缓冲区，等待后续数据拼齐（粘包同理）；
 * - 非法 JSON 静默忽略，绝不抛错导致页面崩溃。
 */
export class SerialProtocolParser {
  private buffer = ''

  feed(chunk: string): FeedResult {
    this.buffer += chunk
    const messages: ProtocolMessage[] = []
    let display = ''

    let newlineIndex = this.buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const rawLine = this.buffer.slice(0, newlineIndex)
      this.buffer = this.buffer.slice(newlineIndex + 1)
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      const markerIndex = line.indexOf(PROTOCOL_MARKER)
      if (markerIndex === 0) {
        const message = this.parseMessage(line.slice(PROTOCOL_MARKER.length))
        if (message !== null) messages.push(message)
        // 行首协议不写入终端
      } else if (markerIndex > 0) {
        const message = this.parseMessage(line.slice(markerIndex + PROTOCOL_MARKER.length))
        if (message?.type === 'telemetry-command') {
          messages.push(message)
          // /dev/tty 遥测可能紧跟在无换行命令输出后；保留普通前缀，
          // 吞掉协议后缀及协议换行，避免 marker 泄到终端。
          display += rawLine.slice(0, markerIndex)
        } else {
          display += `${rawLine}\n`
        }
      } else {
        display += `${rawLine}\n`
      }
      newlineIndex = this.buffer.indexOf('\n')
    }

    // 缓冲区中的半行处理：
    // - 若可能是协议行的前缀（如 "@@HA"），继续等待更多数据；
    // - 若已是完整协议行但没等到换行，继续等待；
    // - 否则立即透传，保证终端回显实时性。
    if (this.buffer.length > MAX_BUFFER_LENGTH) {
      display += this.buffer
      this.buffer = ''
    } else if (this.buffer !== '' && !this.buffer.startsWith(PROTOCOL_MARKER) && !PROTOCOL_MARKER.startsWith(this.buffer)) {
      display += this.buffer
      this.buffer = ''
    }

    return { display, messages }
  }

  /** 会话结束时冲刷残留缓冲区（如仍在等待的半行） */
  flush(): FeedResult {
    const rest = this.buffer
    this.buffer = ''
    if (rest === '') return { display: '', messages: [] }
    if (rest.startsWith(PROTOCOL_MARKER)) {
      const message = this.parseMessage(rest.slice(PROTOCOL_MARKER.length))
      return { display: '', messages: message !== null ? [message] : [] }
    }
    return { display: rest, messages: [] }
  }

  private parseMessage(json: string): ProtocolMessage | null {
    try {
      const data: unknown = JSON.parse(json)
      if (typeof data !== 'object' || data === null) return null
      const value = data as Record<string, unknown>

      switch (value.type) {
        case 'ready':
          if (value.version !== undefined && !isNonNegativeInteger(value.version)) return null
          if (value.key !== undefined && !isSessionKey(value.key)) return null
          return {
            type: 'ready',
            ...(value.version === undefined ? {} : { version: value.version as number }),
            ...(value.key === undefined ? {} : { key: value.key as string }),
          }
        case 'level-ready':
          return isPositiveInteger(value.level) && isOptionalSig(value.sig)
            ? { type: 'level-ready', level: value.level, ...(value.sig === undefined ? {} : { sig: value.sig }) }
            : null
        case 'level-result':
          return isPositiveInteger(value.level) &&
            (value.status === 'passed' || value.status === 'failed') &&
            isOptionalSig(value.sig)
            ? {
                type: 'level-result',
                level: value.level,
                status: value.status,
                ...(value.sig === undefined ? {} : { sig: value.sig }),
              }
            : null
        case 'telemetry-command':
          return typeof value.command === 'string' && value.command.length > 0
            ? { type: 'telemetry-command', command: value.command }
            : null
        case 'hint-request':
          return isPositiveInteger(value.level) ? { type: 'hint-request', level: value.level } : null
        case 'progress':
          return isPositiveInteger(value.level) && isFiniteNumber(value.value)
            ? { type: 'progress', level: value.level, value: value.value }
            : null
        case 'error':
          return typeof value.message === 'string' && value.message.length > 0
            ? { type: 'error', message: value.message }
            : null
        default:
          return null
      }
    } catch {
      // 非法协议内容：忽略，保证页面不崩溃
    }
    return null
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value >= 1
}

/** 会话密钥：base64 编码的随机字节（init 写入 32 字节 → 44 字符，留出余量） */
const SESSION_KEY_PATTERN = /^[A-Za-z0-9+/]{16,128}={0,2}$/

/** HMAC-SHA256 签名：64 位小写十六进制 */
const SIG_PATTERN = /^[0-9a-f]{64}$/

function isSessionKey(value: unknown): value is string {
  return typeof value === 'string' && SESSION_KEY_PATTERN.test(value)
}

function isOptionalSig(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && SIG_PATTERN.test(value))
}
