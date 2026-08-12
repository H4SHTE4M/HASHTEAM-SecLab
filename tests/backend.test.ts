// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_DIR = path.resolve(__dirname, '..', 'backend')
const DB_PATH = path.join(__dirname, '.tmp-telemetry-test.db')

// 后端使用 better-sqlite3（原生模块），用子进程方式启动后端、通过 HTTP 测试。
// 测试用独立的临时数据库和端口。此文件已从主 vitest 运行中排除（vite.config.ts
// 的 test.exclude），需要单独运行：npx vitest run tests/backend.test.ts

const TEST_PORT = 17841
const SECRET = 'test-secret-for-vitest'

function hmac(key: string, message: string): string {
  return crypto.createHmac('sha256', key).update(message).digest('hex')
}

let serverProcess: ChildProcess | null = null

async function startServer(): Promise<ChildProcess> {
  return new Promise<ChildProcess>((resolve, reject) => {
    const env = {
      ...process.env,
      TELEMETRY_PORT: String(TEST_PORT),
      TELEMETRY_DB_PATH: DB_PATH,
      TELEMETRY_EDGE_SECRET: SECRET,
    }
    const proc = spawn('node', [path.join(BACKEND_DIR, 'server.js')], {
      env,
      stdio: 'pipe',
    })
    proc.stdout.on('data', (data) => {
      if (data.toString().includes('后端服务监听')) resolve(proc)
    })
    proc.stderr.on('data', (data) => {
      const msg = data.toString()
      if (msg.includes('FATAL')) reject(new Error(msg))
    })
    proc.on('error', reject)
    setTimeout(() => reject(new Error('server start timeout')), 5000)
  })
}

interface FetchResult {
  status: number
  body: Record<string, unknown> | null
}

async function httpFetch(pathname: string, options: RequestInit = {}): Promise<FetchResult> {
  const response = await fetch(`http://127.0.0.1:${TEST_PORT}${pathname}`, options)
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}

function cleanDb(): void {
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${DB_PATH}${suffix}`, { force: true })
  }
}

async function createSession(token: string): Promise<FetchResult> {
  const sig = hmac(SECRET, `session-bootstrap:${token}`)
  return httpFetch('/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telemetry-Sig': sig },
    body: JSON.stringify({ session: token }),
  })
}

async function sendEvents(token: string, seq: number, events: unknown[]): Promise<FetchResult> {
  const batch = { v: 1, module: 'seclab', session: token, seq, events }
  const batchStr = JSON.stringify(batch)
  const sig = hmac(SECRET, batchStr)
  return httpFetch('/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telemetry-Sig': sig },
    body: batchStr,
  })
}

function randomToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/** 将 body 断言为非空 Record，便于属性访问 */
function requireBody(result: FetchResult): Record<string, unknown> {
  if (result.body === null) throw new Error('expected non-null body')
  return result.body
}

describe('Telemetry Backend', () => {
  beforeEach(async () => {
    cleanDb()
    serverProcess = await startServer()
  })

  afterEach(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM')
      await new Promise<void>((r) => serverProcess?.on('exit', r))
      serverProcess = null
    }
    cleanDb()
  })

  it('POST /session 创建匿名 session', async () => {
    const token = randomToken()
    const result = await createSession(token)
    const body = requireBody(result)
    expect(result.status).toBe(200)
    expect(body['session']).toBe(token)
    expect(body['expiresAt'] as number).toBeGreaterThan(Date.now())
  })

  it('POST /session 无签名时拒绝', async () => {
    const token = randomToken()
    const { status } = await httpFetch('/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: token }),
    })
    expect(status).toBe(401)
  })

  it('POST /events 接收合法批量事件并写入聚合', async () => {
    const token = randomToken()
    await createSession(token)

    const result = await sendEvents(token, 1, [
      { type: 'command', command: 'find' },
      { type: 'command', command: 'grep' },
      { type: 'level_complete', level: 1, path: 'guided' },
      { type: 'hint', level: 1 },
      { type: 'reset', level: 1 },
    ])
    const body = requireBody(result)
    expect(result.status).toBe(200)
    expect(body['ok']).toBe(true)
    expect(body['processed']).toBe(5)
  })

  it('重复 seq 被拒绝（重放保护）', async () => {
    const token = randomToken()
    await createSession(token)

    const r1 = await sendEvents(token, 1, [{ type: 'command', command: 'find' }])
    expect(r1.status).toBe(200)

    const r2 = await sendEvents(token, 1, [{ type: 'command', command: 'find' }])
    expect(r2.status).toBe(409)
  })

  it('同 session 同 level 的 level_complete 只统计一次', async () => {
    const token = randomToken()
    await createSession(token)

    const r1 = await sendEvents(token, 1, [
      { type: 'level_complete', level: 3, path: 'challenge' },
    ])
    expect(r1.status).toBe(200)
    expect(requireBody(r1)['processed']).toBe(1)

    const r2 = await sendEvents(token, 2, [
      { type: 'level_complete', level: 3, path: 'guided' },
    ])
    expect(r2.status).toBe(200)
    expect(requireBody(r2)['processed']).toBe(0)
  })

  it('非 allowlist 命令被拒绝', async () => {
    const token = randomToken()
    await createSession(token)

    const result = await sendEvents(token, 1, [{ type: 'command', command: 'rm' }])
    expect(result.status).toBe(400)
  })

  it('额外 metadata 与越界关卡被拒绝', async () => {
    const token = randomToken()
    await createSession(token)

    const metadata = await sendEvents(token, 1, [
      { type: 'command', command: 'find', properties: { raw: 'forbidden' } },
    ])
    expect(metadata.status).toBe(400)

    const invalidLevel = await sendEvents(token, 2, [
      { type: 'hint', level: 11 },
    ])
    expect(invalidLevel.status).toBe(400)
  })

  it('session 预算按提交事件数累计', async () => {
    const token = randomToken()
    await createSession(token)
    const fifty = Array.from({ length: 50 }, () => ({ type: 'command', command: 'find' }))

    for (let seq = 1; seq <= 10; seq++) {
      expect((await sendEvents(token, seq, fifty)).status).toBe(200)
    }
    expect((await sendEvents(token, 11, [{ type: 'command', command: 'find' }])).status).toBe(429)
  })

  it('非法 module 被拒绝', async () => {
    const token = randomToken()
    await createSession(token)

    const batch = {
      v: 1, module: 'evil-lab', session: token, seq: 1,
      events: [{ type: 'command', command: 'find' }],
    }
    const sig = hmac(SECRET, JSON.stringify(batch))
    const { status } = await httpFetch('/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telemetry-Sig': sig },
      body: JSON.stringify(batch),
    })
    expect(status).toBe(400)
  })

  it('GET /stats 返回聚合数据', async () => {
    const token = randomToken()
    await createSession(token)
    await sendEvents(token, 1, [{ type: 'command', command: 'find' }])

    const statsSig = hmac(SECRET, 'stats:')
    const result = await httpFetch('/stats', {
      headers: { 'X-Telemetry-Sig': statsSig },
    })
    const body = requireBody(result)
    const seclab = body['seclab'] as Record<string, unknown>
    expect(result.status).toBe(200)
    expect(seclab).toBeDefined()
    expect((seclab['command'] as Record<string, unknown>)['find']).toBe(1)
  })

  it('GET /stats?module=seclab 过滤返回', async () => {
    const statsSig = hmac(SECRET, 'stats:?module=seclab')
    const result = await httpFetch('/stats?module=seclab', {
      headers: { 'X-Telemetry-Sig': statsSig },
    })
    const body = requireBody(result)
    expect(result.status).toBe(200)
    expect(body['seclab']).toBeDefined()
  })

  it('无签名访问 stats 被拒绝', async () => {
    const { status } = await httpFetch('/stats')
    expect(status).toBe(401)
  })

  it('通关路径 guided/mixed/challenge 正确区分', async () => {
    const token = randomToken()
    await createSession(token)

    await sendEvents(token, 1, [
      { type: 'level_complete', level: 1, path: 'guided' },
      { type: 'level_complete', level: 2, path: 'mixed' },
      { type: 'level_complete', level: 3, path: 'challenge' },
    ])

    const statsSig = hmac(SECRET, 'stats:')
    const result = await httpFetch('/stats', {
      headers: { 'X-Telemetry-Sig': statsSig },
    })
    const body = requireBody(result)
    const seclab = body['seclab'] as Record<string, unknown>
    const paths = seclab['complete_path'] as Record<string, unknown>
    expect(paths['level-1:guided']).toBe(1)
    expect(paths['level-2:mixed']).toBe(1)
    expect(paths['level-3:challenge']).toBe(1)
  })
})
