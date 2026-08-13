// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const logMock = vi.hoisted(() => vi.fn())

vi.mock('../src/services/boot-logger', () => ({
  log: logMock,
}))

import {
  redactSerialLogLine,
  V86Controller,
  type V86Emulator,
} from '../src/services/vm-controller'

class FakeEmulator implements V86Emulator {
  static latest: FakeEmulator | null = null

  private serialListener: ((byte: number) => void) | null = null
  private readyListener: (() => void) | null = null
  private running = true
  static autoReady = true
  readonly sent: string[] = []
  destroyCount = 0
  destroyPromise: Promise<void> = Promise.resolve()

  constructor(_options: Record<string, unknown>) {
    FakeEmulator.latest = this
    if (FakeEmulator.autoReady) queueMicrotask(() => this.emitReady())
  }

  add_listener(event: 'serial0-output-byte', callback: (byte: number) => void): void
  add_listener(event: 'emulator-ready', callback: () => void): void
  add_listener(
    event: 'serial0-output-byte' | 'emulator-ready',
    callback: ((byte: number) => void) | (() => void),
  ): void {
    if (event === 'serial0-output-byte') {
      this.serialListener = callback as (byte: number) => void
    } else {
      this.readyListener = callback as () => void
    }
  }

  remove_listener(event: 'serial0-output-byte', callback: (byte: number) => void): void
  remove_listener(event: 'emulator-ready', callback: () => void): void
  remove_listener(
    event: 'serial0-output-byte' | 'emulator-ready',
    callback: ((byte: number) => void) | (() => void),
  ): void {
    if (event === 'serial0-output-byte' && this.serialListener === callback) {
      this.serialListener = null
    }
    if (event === 'emulator-ready' && this.readyListener === callback) {
      this.readyListener = null
    }
  }

  serial0_send(data: string): void {
    this.sent.push(data)
  }
  async run(): Promise<void> {
    this.running = true
  }
  async stop(): Promise<void> {
    this.running = false
  }
  async destroy(): Promise<void> {
    this.destroyCount += 1
    this.running = false
    await this.destroyPromise
  }
  restart(): void {}
  is_running(): boolean {
    return this.running
  }

  emit(text: string): void {
    for (const byte of new TextEncoder().encode(text)) this.serialListener?.(byte)
  }

  emitReady(): void {
    this.readyListener?.()
  }
}

beforeEach(() => {
  logMock.mockReset()
  FakeEmulator.latest = null
  FakeEmulator.autoReady = true
  window.V86 = FakeEmulator
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') return new Response(null, { status: 200 })
      return new Response(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]))
    }),
  )
})

afterEach(() => {
  delete window.V86
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('V86Controller serial diagnostics', () => {
  it('启动日志会脱敏 ready 会话密钥，但不改写其他串口内容', () => {
    const ready = '@@HASHTEAM:{"type":"ready","version":2,"key":"c2VjcmV0"}'
    expect(redactSerialLogLine(ready)).toBe(
      '@@HASHTEAM:{"type":"ready","version":2,"key":"[redacted]"}',
    )
    expect(redactSerialLogLine('普通输出 key=visible')).toBe('普通输出 key=visible')
  })

  it('超长串口行只截断诊断日志，终端仍收到完整内容', async () => {
    const controller = new V86Controller()
    let displayedLength = 0
    controller.onSerialOutput((data) => {
      displayedLength += data.length
    })

    await controller.start()
    FakeEmulator.latest?.emit(`${'x'.repeat(12_000)}\n`)

    const serialLog = logMock.mock.calls.find(([source]) => source === 'serial')
    expect(serialLog).toBeDefined()
    expect(serialLog?.[1]).toContain('（单行超过 4096 字符，日志已截断）')
    expect(displayedLength).toBe(12_001)

    await controller.stop()
  })

  it('切关前中断前台程序，再补发 goto 和 cd "$HOME"', async () => {
    const controller = new V86Controller()
    await controller.start()

    await controller.restoreLevel(3)

    expect(FakeEmulator.latest?.sent).toEqual(['\u0003', '\u0015', 'hashteamctl goto 3\ncd "$HOME"\n'])
    await controller.stop()
  })

  it('切换稳定实验前中断前台程序，并补发 cd "$HOME"', async () => {
    const controller = new V86Controller()
    await controller.start()

    await controller.restoreLab('memory-addresses-01')

    expect(FakeEmulator.latest?.sent).toEqual([
      '\u0003',
      '\u0015',
      'hashteamctl goto-lab memory-addresses-01\ncd "$HOME"\n',
    ])
    await controller.stop()
  })

  it('运行面板命令前中断残留前台程序并清空当前输入', async () => {
    const controller = new V86Controller()
    await controller.start()

    controller.runCommand('echo ready')

    expect(FakeEmulator.latest?.sent).toEqual(['\u0003', '\u0015', 'echo ready\n'])
    await controller.stop()
  })

  it('stop 会等待 V86 destroy 完整 settle 后才完成', async () => {
    const controller = new V86Controller()
    await controller.start()
    const emulator = FakeEmulator.latest!
    let resolveDestroy!: () => void
    emulator.destroyPromise = new Promise<void>((resolve) => {
      resolveDestroy = resolve
    })

    let stopSettled = false
    const stopping = controller.stop().then(() => {
      stopSettled = true
    })
    await vi.waitFor(() => {
      expect(emulator.destroyCount).toBe(1)
    })
    expect(stopSettled).toBe(false)

    resolveDestroy()
    await stopping
    expect(stopSettled).toBe(true)
  })

  it('构造后 emulator-ready 永不到达时 stop 有界收口，迟到 ready 仍会销毁且可重试', async () => {
    vi.useFakeTimers()
    FakeEmulator.autoReady = false
    const controller = new V86Controller()
    await controller.start()
    const stalledEmulator = FakeEmulator.latest!

    let stopSettled = false
    const stopping = controller.stop().then(() => {
      stopSettled = true
    })
    await vi.advanceTimersByTimeAsync(999)
    expect(stopSettled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await stopping
    expect(stalledEmulator.destroyCount).toBe(0)

    FakeEmulator.autoReady = true
    await controller.start()
    const replacement = FakeEmulator.latest!
    expect(replacement).not.toBe(stalledEmulator)
    replacement.emitReady()

    stalledEmulator.emitReady()
    await Promise.resolve()
    await Promise.resolve()
    expect(stalledEmulator.destroyCount).toBe(1)
    await controller.stop()
  })
})
