// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { TelemetryClient } from '../src/telemetry/client'
import type { TelemetryTransport, SessionBootstrapResponse, TelemetryBatchRequest } from '../src/telemetry/client'
import { SECLAB_COMMAND_ALLOWLIST, MAX_EVENTS_PER_BATCH, MAX_QUEUE_SIZE } from '../src/telemetry/schema'

class FakeTransport implements TelemetryTransport {
  bootstrapCalls = 0
  sendCalls: TelemetryBatchRequest[] = []
  bootstrapShouldFail = false
  sendShouldFail = false

  async bootstrapSession(): Promise<SessionBootstrapResponse> {
    this.bootstrapCalls++
    if (this.bootstrapShouldFail) throw new Error('bootstrap failed')
    return { session: 'fake-session-token', expiresAt: Date.now() + 30 * 60 * 1000 }
  }

  async sendBatch(batch: TelemetryBatchRequest): Promise<void> {
    this.sendCalls.push(batch)
    if (this.sendShouldFail) throw new Error('send failed')
  }

  reset(): void {
    this.bootstrapCalls = 0
    this.sendCalls = []
    this.bootstrapShouldFail = false
    this.sendShouldFail = false
  }
}

function createClient(transport?: TelemetryTransport): TelemetryClient {
  return new TelemetryClient({
    module: 'seclab',
    transport: transport ?? new FakeTransport(),
    now: () => Date.now(),
    scheduler: (fn) => window.setTimeout(fn, 0),
  })
}

describe('TelemetryClient', () => {
  let transport: FakeTransport

  beforeEach(() => {
    transport = new FakeTransport()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
  })

  it('命令不在 allowlist 中时静默忽略', () => {
    const client = createClient(transport)
    client.trackCommand('rm')
    client.trackCommand('dd')
    client.trackCommand('')
    expect(client.pendingCount).toBe(0)
  })

  it('allowlist 中的命令被加入队列', () => {
    const client = createClient(transport)
    client.trackCommand('find')
    client.trackCommand('grep')
    expect(client.pendingCount).toBe(2)
  })

  it('trackLevelComplete / trackHint / trackReset 加入队列', () => {
    const client = createClient(transport)
    client.trackLevelComplete(5, 'challenge')
    client.trackHint(3)
    client.trackReset(2)
    expect(client.pendingCount).toBe(3)
  })

  it('flush 时通过 transport 发送批量事件', async () => {
    const client = createClient(transport)
    client.trackCommand('find')
    client.trackLevelComplete(1, 'guided')
    await client.flush()

    expect(transport.bootstrapCalls).toBe(1)
    expect(transport.sendCalls).toHaveLength(1)
    const batch = transport.sendCalls[0]
    expect(batch.module).toBe('seclab')
    expect(batch.session).toBe('fake-session-token')
    expect(batch.seq).toBe(1)
    expect(batch.events).toHaveLength(2)
    expect(batch.events[0]).toEqual({ type: 'command', command: 'find' })
    expect(batch.events[1]).toEqual({ type: 'level_complete', level: 1, path: 'guided' })
  })

  it('bootstrap 失败时静默放弃本批，不抛错', async () => {
    transport.bootstrapShouldFail = true
    const client = createClient(transport)
    client.trackCommand('find')
    await client.flush() // 不应抛错
    expect(transport.sendCalls).toHaveLength(0)
  })

  it('send 失败时静默吞掉异常，不传播到调用方', async () => {
    transport.sendShouldFail = true
    const client = createClient(transport)
    client.trackCommand('find')
    await client.flush() // 不应抛错
  })

  it('队列超限时丢弃最早的事件', () => {
    const client = createClient(transport)
    for (let i = 0; i < MAX_QUEUE_SIZE + 10; i++) {
      client.trackCommand('find')
    }
    expect(client.pendingCount).toBe(MAX_QUEUE_SIZE)
  })

  it('批量发送时每批不超过 MAX_EVENTS_PER_BATCH', async () => {
    const client = createClient(transport)
    for (let i = 0; i < MAX_EVENTS_PER_BATCH + 5; i++) {
      client.trackCommand('find')
    }
    await client.flush()
    expect(transport.sendCalls).toHaveLength(2)
    expect(transport.sendCalls[0].events).toHaveLength(MAX_EVENTS_PER_BATCH)
    expect(transport.sendCalls[1].events).toHaveLength(5)
  })

  it('seq 单调递增', async () => {
    const client = createClient(transport)
    client.trackCommand('find')
    await client.flush()
    client.trackCommand('grep')
    await client.flush()
    expect(transport.sendCalls[0].seq).toBe(1)
    expect(transport.sendCalls[1].seq).toBe(2)
  })

  it('session 未过期时复用，不重复 bootstrap', async () => {
    const client = createClient(transport)
    client.trackCommand('find')
    await client.flush()
    client.trackCommand('grep')
    await client.flush()
    expect(transport.bootstrapCalls).toBe(1)
  })

  it('dispose 后 track 调用被忽略', async () => {
    const client = createClient(transport)
    await client.dispose()
    client.trackCommand('find')
    expect(client.pendingCount).toBe(0)
  })

  it('所有 allowlist 命令都能被 track', () => {
    const client = createClient(transport)
    for (const cmd of SECLAB_COMMAND_ALLOWLIST) {
      client.trackCommand(cmd)
    }
    expect(client.pendingCount).toBe(SECLAB_COMMAND_ALLOWLIST.length)
  })
})
