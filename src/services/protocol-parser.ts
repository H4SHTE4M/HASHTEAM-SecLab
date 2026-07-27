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
      if (line.startsWith(PROTOCOL_MARKER)) {
        const message = this.parseMessage(line.slice(PROTOCOL_MARKER.length))
        if (message !== null) messages.push(message)
        // 协议行不写入终端
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
      if (typeof data === 'object' && data !== null && typeof (data as { type?: unknown }).type === 'string') {
        return data as ProtocolMessage
      }
    } catch {
      // 非法协议内容：忽略，保证页面不崩溃
    }
    return null
  }
}
