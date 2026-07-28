// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const logMock = vi.hoisted(() => vi.fn())

vi.mock('../src/services/boot-logger', () => ({
  log: logMock,
}))

import {
  V86Controller,
  type V86Emulator,
} from '../src/services/vm-controller'

class FakeEmulator implements V86Emulator {
  static latest: FakeEmulator | null = null

  private listener: ((byte: number) => void) | null = null
  private running = true

  constructor(_options: Record<string, unknown>) {
    FakeEmulator.latest = this
  }

  add_listener(_event: 'serial0-output-byte', callback: (byte: number) => void): void {
    this.listener = callback
  }

  remove_listener(_event: 'serial0-output-byte', callback: (byte: number) => void): void {
    if (this.listener === callback) this.listener = null
  }

  serial0_send(): void {}
  run(): void {
    this.running = true
  }
  stop(): void {
    this.running = false
  }
  restart(): void {}
  is_running(): boolean {
    return this.running
  }

  emit(text: string): void {
    for (const byte of new TextEncoder().encode(text)) this.listener?.(byte)
  }
}

beforeEach(() => {
  logMock.mockReset()
  FakeEmulator.latest = null
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
})

describe('V86Controller serial diagnostics', () => {
  it('超长串口单行只保留有界诊断，同时仍完整转发给终端', async () => {
    const controller = new V86Controller()
    let displayedLength = 0
    controller.onSerialOutput((data) => {
      displayedLength += data.length
    })

    await controller.start()
    FakeEmulator.latest?.emit(`${'x'.repeat(12_000)}\n`)

    const serialLog = logMock.mock.calls.find(
      ([source, text]) => source === 'serial' && String(text).includes('日志已截断'),
    )
    expect(serialLog).toBeDefined()
    expect(String(serialLog?.[1]).length).toBeLessThan(4_200)
    expect(displayedLength).toBe(12_001)

    await controller.stop()
  })
})
