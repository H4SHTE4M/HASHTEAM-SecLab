import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error EdgeOne deploys this function as a JavaScript module.
import { onRequestPost as postEvents } from '../edge-functions/api/telemetry/events.js'
// @ts-expect-error EdgeOne deploys this function as a JavaScript module.
import { onRequestPost as postSession } from '../edge-functions/api/telemetry/session.js'
// @ts-expect-error EdgeOne deploys this function as a JavaScript module.
import { onRequestGet as getStats } from '../edge-functions/api/telemetry/stats.js'

const NativeAbortSignal = globalThis.AbortSignal
const ENV = {
  TELEMETRY_BACKEND_URL: 'https://telemetry.example.test',
  TELEMETRY_EDGE_SECRET: 'test-secret',
}

describe('EdgeOne telemetry functions', () => {
  beforeEach(() => {
    // EdgeOne supports AbortController but does not expose AbortSignal.timeout().
    vi.stubGlobal('AbortSignal', {})
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      expect(init.signal).toBeInstanceOf(NativeAbortSignal)
      const url = String(input)

      if (url.endsWith('/session')) {
        const { session } = JSON.parse(String(init.body))
        return Response.json({ session, expiresAt: Date.now() + 60_000 })
      }
      if (url.includes('/stats')) return Response.json({ seclab: {} })
      if (url.endsWith('/events')) return Response.json({ ok: true })
      return new Response(null, { status: 404 })
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('works without AbortSignal.timeout', async () => {
    const sessionResponse = await postSession({
      request: new Request('https://lab.example/api/telemetry/session', { method: 'POST' }),
      env: ENV,
    })
    expect(sessionResponse.status).toBe(200)
    const { session } = await sessionResponse.json()

    const eventsResponse = await postEvents({
      request: new Request('https://lab.example/api/telemetry/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          v: 1,
          module: 'seclab',
          session,
          seq: 1,
          events: [{ type: 'command', command: 'find' }],
        }),
      }),
      env: ENV,
    })
    expect(eventsResponse.status).toBe(200)

    const statsResponse = await getStats({
      request: new Request('https://lab.example/api/telemetry/stats?module=seclab'),
      env: ENV,
    })
    expect(statsResponse.status).toBe(200)
    await expect(statsResponse.json()).resolves.toEqual({ seclab: {} })
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
