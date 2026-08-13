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

// 管理页测试：固定密码 + scrypt 参数生成的哈希（格式与 deploy.sh 产出一致）
const ADMIN_PASSWORD = 'test-admin-password-for-vitest'
const ADMIN_SALT = crypto.randomBytes(16).toString('hex')
const ADMIN_HASH = crypto
  .scryptSync(ADMIN_PASSWORD, Buffer.from(ADMIN_SALT, 'hex'), 32, { N: 16384, r: 8, p: 1 })
  .toString('hex')
const ADMIN_PASSWORD_HASH = `scrypt:16384:8:1:${ADMIN_SALT}:${ADMIN_HASH}`

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
      TELEMETRY_ADMIN_PASSWORD_HASH: ADMIN_PASSWORD_HASH,
      // 本地直连场景：无 nginx 前缀，cookie 直接发向 /api/admin
      TELEMETRY_PUBLIC_PREFIX: '',
      TELEMETRY_COOKIE_PATH: '/api/admin',
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
  headers: Headers
  text: string
}

async function httpFetch(pathname: string, options: RequestInit = {}): Promise<FetchResult> {
  const response = await fetch(`http://127.0.0.1:${TEST_PORT}${pathname}`, options)
  const text = await response.text()
  let body: Record<string, unknown> | null = null
  try {
    body = JSON.parse(text)
  } catch {
    // 非 JSON 响应（HTML/CSS/空响应）
  }
  return { status: response.status, body, headers: response.headers, text }
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

  it('check_result 通过/失败均计数（不去重），正确率可由聚合推导', async () => {
    const token = randomToken()
    await createSession(token)

    const result = await sendEvents(token, 1, [
      { type: 'check_result', level: 1, passed: true },
      { type: 'check_result', level: 1, passed: false },
      { type: 'check_result', level: 1, passed: false },
      { type: 'check_result', level: 2, passed: true },
    ])
    expect(result.status).toBe(200)
    expect(requireBody(result)['processed']).toBe(4)

    const statsSig = hmac(SECRET, 'stats:')
    const stats = await httpFetch('/stats', { headers: { 'X-Telemetry-Sig': statsSig } })
    const seclab = requireBody(stats)['seclab'] as Record<string, Record<string, number>>
    expect(seclab['check_pass']).toEqual({ 'level-1': 1, 'level-2': 1 })
    expect(seclab['check_fail']).toEqual({ 'level-1': 2 })
  })

  it('非法 check_result（越界关卡 / 非布尔 passed / 多余字段）被拒绝', async () => {
    const token = randomToken()
    await createSession(token)

    expect((await sendEvents(token, 1, [{ type: 'check_result', level: 11, passed: true }])).status).toBe(400)
    expect((await sendEvents(token, 2, [{ type: 'check_result', level: 1, passed: 'yes' }])).status).toBe(400)
    expect((await sendEvents(token, 3, [{ type: 'check_result', level: 1, passed: true, extra: 1 }])).status).toBe(400)
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

  describe('Dashboard & Admin', () => {
    async function adminLogin(password: string): Promise<FetchResult> {
      return httpFetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
    }

    it('GET /dashboard 重定向到尾斜杠', async () => {
      const response = await fetch(`http://127.0.0.1:${TEST_PORT}/dashboard`, { redirect: 'manual' })
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('/dashboard/')
    })

    it('GET /dashboard/ 返回数据看板 HTML 并带安全头', async () => {
      const result = await httpFetch('/dashboard/')
      expect(result.status).toBe(200)
      expect(result.headers.get('content-type')).toContain('text/html')
      expect(result.headers.get('content-security-policy')).toContain("default-src 'self'")
      expect(result.headers.get('x-content-type-options')).toBe('nosniff')
      expect(result.text).toContain('遥测看板')
    })

    it('GET /dashboard/admin.html 返回管理页', async () => {
      const result = await httpFetch('/dashboard/admin.html')
      expect(result.status).toBe(200)
      expect(result.text).toContain('管理登录')
    })

    it('dashboard 白名单之外的路径一律 404', async () => {
      expect((await httpFetch('/dashboard/server.js')).status).toBe(404)
      expect((await httpFetch('/dashboard/../server.js')).status).toBe(404)
      expect((await httpFetch('/dashboard/%2e%2e/server.js')).status).toBe(404)
    })

    it('GET /api/public/stats 无需签名返回聚合数据', async () => {
      const token = randomToken()
      await createSession(token)
      await sendEvents(token, 1, [
        { type: 'command', command: 'find' },
        { type: 'level_complete', level: 2, path: 'guided' },
      ])

      const result = await httpFetch('/api/public/stats')
      const body = requireBody(result)
      expect(result.status).toBe(200)
      expect(body['ok']).toBe(true)
      expect(typeof body['generatedAt']).toBe('number')
      const modules = body['modules'] as Record<string, Record<string, Record<string, number>>>
      expect(modules['seclab']['command']['find']).toBe(1)
      expect(modules['seclab']['complete']['level-2']).toBe(1)
    })

    it('GET /api/public/stats 返回 timeseries 数组且含当天事件计数', async () => {
      const token = randomToken()
      await createSession(token)
      await sendEvents(token, 1, [
        { type: 'command', command: 'find' },
        { type: 'command', command: 'grep' },
        { type: 'level_complete', level: 1, path: 'guided' },
        { type: 'hint', level: 1 },
        { type: 'reset', level: 1 },
      ])

      const result = await httpFetch('/api/public/stats')
      const body = requireBody(result)
      const ts = body['timeseries'] as Array<Record<string, number>>
      expect(Array.isArray(ts)).toBe(true)
      expect(ts).toHaveLength(30)
      // 所有元素都应有 day 字段和五个事件类型字段
      for (const entry of ts) {
        expect(typeof entry['day']).toBe('number')
        expect(typeof entry['session_create']).toBe('number')
        expect(typeof entry['command']).toBe('number')
        expect(typeof entry['level_complete']).toBe('number')
        expect(typeof entry['hint']).toBe('number')
        expect(typeof entry['reset']).toBe('number')
      }
      // 最后一天（今天）应包含本次测试产生的所有事件
      const today = ts[ts.length - 1]
      expect(today['session_create']).toBe(1)
      expect(today['command']).toBe(2)
      expect(today['level_complete']).toBe(1)
      expect(today['hint']).toBe(1)
      expect(today['reset']).toBe(1)
      // 前一天应为全零（测试刚创建，无历史数据）
      const yesterday = ts[ts.length - 2]
      expect(yesterday['session_create']).toBe(0)
      expect(yesterday['command']).toBe(0)
    })

    it('管理页 overview 返回 timeseries 数组', async () => {
      const token = randomToken()
      await createSession(token)
      await sendEvents(token, 1, [{ type: 'command', command: 'ls' }])

      const login = await httpFetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: ADMIN_PASSWORD }),
      })
      const cookiePair = (login.headers.get('set-cookie') || '').split(';')[0]
      const overview = await httpFetch('/api/admin/overview', { headers: { Cookie: cookiePair } })
      const body = requireBody(overview)
      const ts = body['timeseries'] as Array<Record<string, number>>
      expect(Array.isArray(ts)).toBe(true)
      expect(ts).toHaveLength(30)
      const today = ts[ts.length - 1]
      expect(today['session_create']).toBe(1)
      expect(today['command']).toBe(1)
    })

    it('GET /api/public/stats?module= 非法 module 返回 400', async () => {
      expect((await httpFetch('/api/public/stats?module=evil-lab')).status).toBe(400)
    })

    it('管理登录:错误密码 401,正确密码 200 并下发安全 cookie', async () => {
      expect((await adminLogin('wrong-password')).status).toBe(401)

      const good = await adminLogin(ADMIN_PASSWORD)
      expect(good.status).toBe(200)
      expect(requireBody(good)['ok']).toBe(true)
      const cookie = good.headers.get('set-cookie') || ''
      expect(cookie).toContain('ht_admin=')
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('Secure')
      expect(cookie).toContain('SameSite=Strict')
      expect(cookie).toContain('Path=/api/admin')
    })

    it('overview 未认证 401,认证后返回详细数据,logout 后会话失效', async () => {
      const token = randomToken()
      await createSession(token)
      await sendEvents(token, 1, [{ type: 'command', command: 'ls' }])

      expect((await httpFetch('/api/admin/overview')).status).toBe(401)

      const login = await adminLogin(ADMIN_PASSWORD)
      const cookiePair = (login.headers.get('set-cookie') || '').split(';')[0]
      expect(cookiePair).toContain('ht_admin=')

      const overview = await httpFetch('/api/admin/overview', { headers: { Cookie: cookiePair } })
      expect(overview.status).toBe(200)
      const body = requireBody(overview)
      const service = body['service'] as Record<string, unknown>
      expect(typeof service['uptimeSec']).toBe('number')
      expect(typeof service['dbSizeBytes']).toBe('number')
      expect(service['nodeVersion']).toBe(process.version)
      const sessions = body['sessions'] as Record<string, unknown>
      expect(sessions['total']).toBe(1)
      expect(sessions['active']).toBe(1)
      const recent = sessions['recent'] as Record<string, unknown>[]
      expect(recent).toHaveLength(1)
      expect(recent[0]['tokenPrefix']).toHaveLength(8)
      expect(recent[0]['eventCount']).toBe(1)
      const completions = body['completions'] as Record<string, unknown>
      expect(completions['total']).toBe(0)
      const modules = body['modules'] as Record<string, Record<string, Record<string, number>>>
      expect(modules['seclab']['command']['ls']).toBe(1)

      const logout = await httpFetch('/api/admin/logout', {
        method: 'POST',
        headers: { Cookie: cookiePair },
      })
      expect(logout.status).toBe(200)
      expect(
        (await httpFetch('/api/admin/overview', { headers: { Cookie: cookiePair } })).status,
      ).toBe(401)
    })

    it('伪造 cookie 无法通过认证', async () => {
      const fake = `ht_admin=${crypto.randomBytes(32).toString('base64url')}`
      const result = await httpFetch('/api/admin/overview', { headers: { Cookie: fake } })
      expect(result.status).toBe(401)
    })

    it('登录限流:同 IP 连续失败后第 6 次返回 429(即使密码正确)', async () => {
      for (let i = 0; i < 5; i++) {
        expect((await adminLogin('wrong-password')).status).toBe(401)
      }
      expect((await adminLogin(ADMIN_PASSWORD)).status).toBe(429)
    })

    it('login 请求体严格校验', async () => {
      const empty = await adminLogin('')
      expect(empty.status).toBe(400)
      const extra = await httpFetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'x', extra: 1 }),
      })
      expect(extra.status).toBe(400)
      const notJson = await httpFetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
      expect(notJson.status).toBe(400)
    })
  })
})
