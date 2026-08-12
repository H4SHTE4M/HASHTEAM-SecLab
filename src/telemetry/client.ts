/**
 * 遥测客户端：独立、可复用的 service module。
 *
 * 调用方只需调用 telemetry.track*()，不需要关心：
 * - session 获取与刷新
 * - batching / flush 时机
 * - HTTP 请求与序列化
 * - 重试与超时
 * - seq 单调递增
 * - 队列上限与丢弃策略
 *
 * 遥测绝不影响业务：任何异常（网络错误、JSON 序列化失败、storage 不可用）
 * 均被静默吞掉，不传播到调用方。
 */

import {
  FLUSH_INTERVAL_MS,
  FLUSH_THRESHOLD,
  MAX_EVENTS_PER_BATCH,
  MAX_EVENTS_PER_SESSION,
  MAX_QUEUE_SIZE,
  REQUEST_TIMEOUT_MS,
  TELEMETRY_PROTOCOL_VERSION,
  isAllowedCommand,
  type CompletionPathDimension,
  type ModuleId,
  type TelemetryEvent,
} from './schema'

/** 后端批量事件上报请求体。 */
export interface TelemetryBatchRequest {
  v: number
  module: ModuleId
  session: string
  seq: number
  events: TelemetryEvent[]
}

/** Session 引导响应体。 */
export interface SessionBootstrapResponse {
  session: string
  /** session 过期时间戳（ms epoch），客户端据此刷新。 */
  expiresAt: number
}

/** 可注入的传输接口，便于在测试中替换为内存实现。 */
export interface TelemetryTransport {
  bootstrapSession(): Promise<SessionBootstrapResponse>
  sendBatch(batch: TelemetryBatchRequest): Promise<void>
}

/** 同源 fetch 传输实现：调用 /api/telemetry/session 与 /api/telemetry/events。 */
class HttpTransport implements TelemetryTransport {
  async bootstrapSession(): Promise<SessionBootstrapResponse> {
    const response = await fetch('/api/telemetry/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      keepalive: true,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`session bootstrap failed: ${response.status}`)
    return (await response.json()) as SessionBootstrapResponse
  }

  async sendBatch(batch: TelemetryBatchRequest): Promise<void> {
    const response = await fetch('/api/telemetry/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
      keepalive: true,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`batch send failed: ${response.status}`)
  }
}

interface SessionState {
  token: string
  expiresAt: number
  /** 本 session 已上报的事件总数（含被丢弃的批次）。 */
  eventsSent: number
}

interface TelemetryClientOptions {
  module: ModuleId
  transport?: TelemetryTransport
  /** 测试可注入时钟；默认 Date.now。 */
  now?: () => number
  /** 测试可注入 setTimeout；默认 window.setTimeout。 */
  scheduler?: (fn: () => void, ms: number) => number
}

/**
 * 遥测客户端核心。
 *
 * 不直接构造--通过 createTelemetry() 工厂创建并缓存为模块级单例。
 * 未来其他 Lab 可传入不同的 module 复用同一实现。
 */
export class TelemetryClient {
  private readonly module: ModuleId
  private readonly transport: TelemetryTransport
  private readonly now: () => number
  private readonly scheduler: (fn: () => void, ms: number) => number

  private queue: TelemetryEvent[] = []
  private session: SessionState | null = null
  private seq = 0
  private flushTimer: number | null = null
  private bootstrapping: Promise<void> | null = null
  private sending = false
  private disposed = false

  constructor(options: TelemetryClientOptions) {
    this.module = options.module
    this.transport = options.transport ?? new HttpTransport()
    this.now = options.now ?? (() => Date.now())
    this.scheduler = options.scheduler ?? ((fn, ms) => window.setTimeout(fn, ms))
  }

  /** 统计一次受支持命令的执行。命令不在 allowlist 中则静默忽略。 */
  trackCommand(command: string): void {
    if (!isAllowedCommand(command)) return
    this.enqueue({ type: 'command', command })
  }

  /** 统计一次关卡完成（含通关路径维度）。 */
  trackLevelComplete(level: number, path: CompletionPathDimension): void {
    this.enqueue({ type: 'level_complete', level, path })
  }

  /** 统计一次提示使用。 */
  trackHint(level: number): void {
    this.enqueue({ type: 'hint', level })
  }

  /** 统计一次关卡重置。 */
  trackReset(level: number): void {
    this.enqueue({ type: 'reset', level })
  }

  /** 立即冲刷队列（如页面卸载时）；失败静默忽略。 */
  async flush(): Promise<void> {
    this.clearFlushTimer()
    await this.drain()
  }

  /** 释放客户端：冲刷残余事件并停止定时器。 */
  async dispose(): Promise<void> {
    this.disposed = true
    this.clearFlushTimer()
    await this.drain().catch(() => {})
  }

  /** 测试用：返回当前队列长度（不含已发送）。 */
  get pendingCount(): number {
    return this.queue.length
  }

  private enqueue(event: TelemetryEvent): void {
    if (this.disposed) return
    // 队列上限：丢弃最早的事件，保证遥测不无限增长
    if (this.queue.length >= MAX_QUEUE_SIZE) this.queue.shift()
    this.queue.push(event)
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return
    // 达到阈值立即发送；否则延迟发送（低频批量）
    const delay = this.queue.length >= FLUSH_THRESHOLD ? 0 : FLUSH_INTERVAL_MS
    this.flushTimer = this.scheduler(() => {
      this.flushTimer = null
      void this.drain().catch(() => {})
    }, delay)
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== null) {
      window.clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }

  /** 取出队列中的事件分批发送，每批不超过 MAX_EVENTS_PER_BATCH。 */
  private async drain(): Promise<void> {
    if (this.sending || this.queue.length === 0) return
    this.sending = true
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, MAX_EVENTS_PER_BATCH)
        await this.sendWithSession(batch)
      }
    } catch {
      // 网络错误静默失败：事件已从队列移除，不重试
    } finally {
      this.sending = false
    }
  }

  private async sendWithSession(events: TelemetryEvent[]): Promise<void> {
    const session = await this.ensureSession()
    if (session === null) return // session 获取失败，放弃本批
    if (session.eventsSent >= MAX_EVENTS_PER_SESSION) return // 超出 session 预算

    this.seq += 1
    session.eventsSent += events.length

    await this.transport.sendBatch({
      v: TELEMETRY_PROTOCOL_VERSION,
      module: this.module,
      session: session.token,
      seq: this.seq,
      events,
    })
  }

  private async ensureSession(): Promise<SessionState | null> {
    if (this.session !== null && this.session.expiresAt > this.now()) {
      return this.session
    }
    // 并发 bootstrap 去重
    if (this.bootstrapping !== null) {
      await this.bootstrapping
      return this.session
    }
    this.bootstrapping = (async () => {
      try {
        const response = await this.transport.bootstrapSession()
        this.session = {
          token: response.session,
          expiresAt: response.expiresAt,
          eventsSent: 0,
        }
        this.seq = 0
      } catch {
        this.session = null
      }
    })()
    try {
      await this.bootstrapping
    } finally {
      this.bootstrapping = null
    }
    return this.session
  }
}
