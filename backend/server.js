/**
 * HASHTEAM SecLab 遥测后端服务。
 *
 * 架构：EdgeOne Edge Function -> 本服务（HMAC 鉴权）-> SQLite WAL
 *
 * 职责：
 * - POST /session  : 创建匿名 session（只存 token 的 SHA-256 hash）
 * - POST /events   : 接收批量事件，做 seq 重放保护、allowlist 校验、聚合写入
 * - GET  /stats    : 返回只读聚合计数（支持 ?module= 过滤）
 *
 * 安全：
 * - 所有请求必须携带 Edge Function 的 HMAC 签名（X-Telemetry-Sig）
 * - session token 只存 hash，不存明文
 * - session 自动过期（30 分钟）
 * - 每 session 事件预算上限
 * - monotonic seq 重放保护
 * - module / event type / command allowlist 校验
 * - level_complete 每 session 最多一次（防重复统计）
 *
 * 数据模型（单表，支持未来多 module）：
 *   aggregates(module, metric, dimension, count)
 * 例如：
 *   seclab | command  | find    | 271
 *   seclab | complete | level-5 | challenge | 42
 */

import http from 'node:http'
import crypto from 'node:crypto'
import { createHmac, timingSafeEqual } from 'node:crypto'
import Database from 'better-sqlite3'

const PORT = parseInt(process.env.TELEMETRY_PORT || '7841', 10)
const EDGE_SECRET = process.env.TELEMETRY_EDGE_SECRET || ''
const DB_PATH = process.env.TELEMETRY_DB_PATH || '/var/lib/hashteam-telemetry/telemetry.db'

if (!EDGE_SECRET) {
  console.error('FATAL: TELEMETRY_EDGE_SECRET 未设置')
  process.exit(1)
}

// ---- 常量（与 src/telemetry/schema.ts 保持一致） ----

const SESSION_TTL_MS = 30 * 60 * 1000
const MAX_EVENTS_PER_SESSION = 500
const PROTOCOL_VERSION = 1

const MODULES = {
  seclab: {
    events: ['command', 'level_complete', 'hint', 'reset'],
    levels: 10,
  },
}

const COMMAND_ALLOWLIST = new Set([
  'find', 'grep', 'chmod', 'ls', 'cat', 'cd', 'pwd', 'whoami', 'check', 'help', 'su',
])

const COMPLETION_PATHS = new Set(['guided', 'mixed', 'challenge'])
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

// ---- 数据库初始化 ----

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    last_seq    INTEGER NOT NULL DEFAULT 0,
    event_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS completions (
    token_hash  TEXT NOT NULL,
    module      TEXT NOT NULL,
    level       INTEGER NOT NULL,
    PRIMARY KEY (token_hash, module, level)
  );

  CREATE TABLE IF NOT EXISTS aggregates (
    module    TEXT NOT NULL,
    metric    TEXT NOT NULL,
    dimension TEXT NOT NULL DEFAULT '',
    count     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (module, metric, dimension)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`)

// ---- 预编译语句 ----

const stmtInsertSession = db.prepare(
  'INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)',
)
const stmtGetSession = db.prepare('SELECT * FROM sessions WHERE token_hash = ?')
const stmtUpdateSession = db.prepare(
  'UPDATE sessions SET last_seq = ?, event_count = event_count + ? WHERE token_hash = ?',
)
const stmtDeleteExpiredSessions = db.prepare('DELETE FROM sessions WHERE expires_at < ?')

const stmtCheckCompletion = db.prepare(
  'SELECT 1 FROM completions WHERE token_hash = ? AND module = ? AND level = ?',
)
const stmtInsertCompletion = db.prepare(
  'INSERT OR IGNORE INTO completions (token_hash, module, level) VALUES (?, ?, ?)',
)

const stmtGetAggregate = db.prepare(
  'SELECT count FROM aggregates WHERE module = ? AND metric = ? AND dimension = ?',
)
const stmtUpsertAggregate = db.prepare(`
  INSERT INTO aggregates (module, metric, dimension, count) VALUES (?, ?, ?, ?)
  ON CONFLICT (module, metric, dimension) DO UPDATE SET count = count + excluded.count
`)

const stmtGetAggregatesByModule = db.prepare(
  'SELECT metric, dimension, count FROM aggregates WHERE module = ? ORDER BY metric, dimension',
)
const stmtGetAllAggregates = db.prepare(
  'SELECT module, metric, dimension, count FROM aggregates ORDER BY module, metric, dimension',
)

// ---- HMAC 鉴权 ----

function verifyEdgeSignature(signature, message) {
  if (!signature) return false
  const expected = createHmac('sha256', EDGE_SECRET).update(message).digest('hex')
  if (signature.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

// ---- Session 管理 ----

function createSession(token) {
  const tokenHash = sha256Hex(token)
  const now = Date.now()
  stmtInsertSession.run(tokenHash, now, now + SESSION_TTL_MS)
  return { session: token, expiresAt: now + SESSION_TTL_MS }
}

function getSession(token) {
  const tokenHash = sha256Hex(token)
  const row = stmtGetSession.get(tokenHash)
  if (!row) return null
  if (row.expires_at < Date.now()) return null
  return row
}

function cleanupExpiredSessions() {
  const now = Date.now()
  const result = stmtDeleteExpiredSessions.run(now)
  if (result.changes > 0) {
    console.log(`[telemetry] 清理 ${result.changes} 个过期 session`)
  }
}

// 定期清理过期 session（每 5 分钟）
setInterval(cleanupExpiredSessions, 5 * 60 * 1000).unref()

// ---- 事件处理 ----

function hasOnlyKeys(value, allowedKeys) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length === allowedKeys.length && keys.every((key) => allowedKeys.includes(key))
}

function isValidLevel(mod, level) {
  return Number.isInteger(level) && level >= 1 && level <= MODULES[mod].levels
}

function validateEvent(mod, event) {
  if (typeof event !== 'object' || event === null || Array.isArray(event)) return false
  if (!MODULES[mod].events.includes(event.type)) return false

  switch (event.type) {
    case 'command':
      return hasOnlyKeys(event, ['type', 'command']) &&
        typeof event.command === 'string' &&
        COMMAND_ALLOWLIST.has(event.command)
    case 'level_complete':
      return hasOnlyKeys(event, ['type', 'level', 'path']) &&
        isValidLevel(mod, event.level) &&
        typeof event.path === 'string' &&
        COMPLETION_PATHS.has(event.path)
    case 'hint':
    case 'reset':
      return hasOnlyKeys(event, ['type', 'level']) && isValidLevel(mod, event.level)
    default:
      return false
  }
}

function processEvent(mod, event, tokenHash) {
  switch (event.type) {
    case 'command':
      stmtUpsertAggregate.run(mod, 'command', event.command, 1)
      return true
    case 'level_complete': {
      // 每 session 每 module 每 level 最多统计一次完成
      const already = stmtCheckCompletion.get(tokenHash, mod, event.level)
      if (already) return false
      stmtInsertCompletion.run(tokenHash, mod, event.level)
      stmtUpsertAggregate.run(mod, 'complete', `level-${event.level}`, 1)
      stmtUpsertAggregate.run(mod, 'complete_path', `level-${event.level}:${event.path}`, 1)
      return true
    }
    case 'hint':
      stmtUpsertAggregate.run(mod, 'hint', `level-${event.level}`, 1)
      return true
    case 'reset':
      stmtUpsertAggregate.run(mod, 'reset', `level-${event.level}`, 1)
      return true
    default:
      return false
  }
}

function processBatch(batch, sig) {
  // 校验 HMAC 签名（签名内容是请求 body 的原始 JSON）
  // 注意：Edge Function 对 JSON.stringify(batch) 签名，但 HTTP body 可能被重新序列化。
  // 因此 Edge Function 在 body 中同时传递原始签名字符串。
  // 这里用 X-Telemetry-Sig 头验证。
  if (!verifyEdgeSignature(sig, JSON.stringify(batch))) return { status: 401 }
  if (!hasOnlyKeys(batch, ['v', 'module', 'session', 'seq', 'events'])) return { status: 400 }
  if (batch.v !== PROTOCOL_VERSION) return { status: 400 }
  if (typeof batch.module !== 'string' || !(batch.module in MODULES)) return { status: 400 }
  if (typeof batch.session !== 'string' || !SESSION_TOKEN_PATTERN.test(batch.session)) {
    return { status: 400 }
  }
  const sessionRow = getSession(batch.session)
  if (!sessionRow) return { status: 401 }

  // seq 必须严格单调递增，重复或倒退均视为重放。
  if (!Number.isInteger(batch.seq) || batch.seq < 1) return { status: 400 }
  if (batch.seq <= sessionRow.last_seq) return { status: 409 }

  if (!Array.isArray(batch.events) || batch.events.length === 0 || batch.events.length > 50) {
    return { status: 400 }
  }
  if (!batch.events.every((event) => validateEvent(batch.module, event))) {
    return { status: 400 }
  }
  if (sessionRow.event_count + batch.events.length > MAX_EVENTS_PER_SESSION) {
    return { status: 429 }
  }

  const tokenHash = sha256Hex(batch.session)
  let processed = 0
  const tx = db.transaction(() => {
    for (const event of batch.events) {
      if (processEvent(batch.module, event, tokenHash)) processed++
    }
    // 预算按提交事件数累计；重复 completion 仍消耗预算，避免无限空转刷请求。
    stmtUpdateSession.run(batch.seq, batch.events.length, tokenHash)
  })
  tx()

  return { status: 200, body: { ok: true, processed } }
}

// ---- Stats 查询 ----

function getStats(mod) {
  if (mod !== undefined && !(mod in MODULES)) return { status: 400 }
  const rows = mod
    ? stmtGetAggregatesByModule.all(mod)
    : stmtGetAllAggregates.all()

  // 组织成嵌套结构：module -> metric -> dimension -> count
  const result = {}
  if (mod) result[mod] = {}
  for (const row of rows) {
    const m = mod || row.module
    if (!result[m]) result[m] = {}
    if (!result[m][row.metric]) result[m][row.metric] = {}
    result[m][row.metric][row.dimension || '_total'] = row.count
  }
  return { status: 200, body: result }
}

// ---- HTTP 服务器 ----

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 64 * 1024) {
        reject(new Error('body too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  })
  res.end(json)
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const path = url.pathname
    const sig = req.headers['x-telemetry-sig']

    // POST /session
    if (path === '/session' && req.method === 'POST') {
      const body = await readBody(req)
      let payload
      try { payload = JSON.parse(body) } catch { return sendJson(res, 400, { error: 'invalid json' }) }
      if (!hasOnlyKeys(payload, ['session']) ||
          typeof payload.session !== 'string' ||
          !SESSION_TOKEN_PATTERN.test(payload.session)) {
        return sendJson(res, 400, { error: 'invalid session' })
      }

      // Edge Function 生成 token 并对 "session-bootstrap:<token>" 签名
      if (!verifyEdgeSignature(sig, `session-bootstrap:${payload.session}`)) {
        return sendJson(res, 401, { error: 'invalid signature' })
      }
      const result = createSession(payload.session)
      return sendJson(res, 200, result)
    }

    // POST /events
    if (path === '/events' && req.method === 'POST') {
      const body = await readBody(req)
      let batch
      try { batch = JSON.parse(body) } catch { return sendJson(res, 400, { error: 'invalid json' }) }
      const result = processBatch(batch, sig)
      return sendJson(res, result.status, result.body || { error: 'error' })
    }

    // GET /stats[?module=seclab]
    if (path === '/stats' && req.method === 'GET') {
      const query = url.search ? url.search : ''
      if (!verifyEdgeSignature(sig, `stats:${query}`)) {
        return sendJson(res, 401, { error: 'invalid signature' })
      }
      const mod = url.searchParams.get('module') || undefined
      const result = getStats(mod)
      return sendJson(res, result.status, result.body)
    }

    // 未知路由
    sendJson(res, 404, { error: 'not found' })
  } catch (err) {
    console.error('[telemetry] 请求处理错误:', err.message)
    sendJson(res, 500, { error: 'internal error' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[telemetry] 后端服务监听 127.0.0.1:${PORT}`)
  console.log(`[telemetry] 数据库: ${DB_PATH}`)
  // 启动时清理一次过期 session
  cleanupExpiredSessions()
})
