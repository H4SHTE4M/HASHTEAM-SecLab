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
 * Dashboard（浏览器直连，无 HMAC，由 nginx 以 /telemetry-backend/ 前缀反代）：
 * - GET  /dashboard/*        : 公开数据看板与管理页静态资源（白名单路由）
 * - GET  /api/public/stats   : 公开聚合统计（限流，无需签名）
 * - POST /api/admin/login    : 管理员登录（scrypt 校验 -> HttpOnly cookie，限流）
 * - POST /api/admin/logout   : 注销管理会话
 * - GET  /api/admin/overview : 管理页详细数据（需管理 cookie）
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
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = parseInt(process.env.TELEMETRY_PORT || '7841', 10)
const EDGE_SECRET = process.env.TELEMETRY_EDGE_SECRET || ''
const DB_PATH = process.env.TELEMETRY_DB_PATH || '/var/lib/hashteam-telemetry/telemetry.db'

// ---- Dashboard（浏览器直连，不经 Edge Function） ----
// scrypt 密码哈希，格式 scrypt:N:r:p:<salt_hex>:<hash_hex>；未设置时管理登录禁用
const ADMIN_PASSWORD_HASH = process.env.TELEMETRY_ADMIN_PASSWORD_HASH || ''
// nginx 反代的公开前缀（用于尾斜杠重定向 Location）；本地直连测试时设为空串
const PUBLIC_PREFIX = (process.env.TELEMETRY_PUBLIC_PREFIX ?? '/telemetry-backend').replace(/\/+$/, '')
// 管理 cookie 的 Path（浏览器可见路径）；仅发向管理 API
const ADMIN_COOKIE_PATH = process.env.TELEMETRY_COOKIE_PATH || '/telemetry-backend/api/admin'
const DASHBOARD_DIR = process.env.TELEMETRY_DASHBOARD_DIR || path.join(__dirname, 'public')

if (!EDGE_SECRET) {
  console.error('FATAL: TELEMETRY_EDGE_SECRET 未设置')
  process.exit(1)
}
if (!ADMIN_PASSWORD_HASH) {
  console.warn('[telemetry] TELEMETRY_ADMIN_PASSWORD_HASH 未设置，管理页登录已禁用')
}

// ---- 常量（与 src/telemetry/schema.ts 保持一致） ----

const SESSION_TTL_MS = 30 * 60 * 1000
const MAX_EVENTS_PER_SESSION = 500
const PROTOCOL_VERSIONS = new Set([1, 2])
/** 事件明细保留天数（超出后定期删除）。 */
const EVENT_LOG_RETENTION_DAYS = 90

function loadPublishedPwnHubActivities() {
  const configuredPath = process.env.TELEMETRY_PRODUCTION_PROFILE
  const packagedPath = path.join(__dirname, 'production.json')
  const repositoryPath = path.resolve(__dirname, '..', 'vm', 'profiles', 'production.json')
  const profilePath = configuredPath || (fs.existsSync(packagedPath) ? packagedPath : repositoryPath)
  let profile
  try {
    profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'))
  } catch (error) {
    console.error(`FATAL: 无法读取 production profile: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
  const activities = profile?.pwnhubLabs
  if (
    !Array.isArray(activities) ||
    activities.length === 0 ||
    activities.some(
      (activityId) =>
        typeof activityId !== 'string' ||
        !/^[a-z][a-z0-9-]{0,95}$/.test(activityId),
    ) ||
    new Set(activities).size !== activities.length
  ) {
    console.error('FATAL: production profile 包含无效或重复的 PwnHub labId')
    process.exit(1)
  }
  return activities
}

const PWNHUB_ACTIVITIES = loadPublishedPwnHubActivities()

const MODULES = {
  seclab: {
    version: 1,
    events: ['command', 'level_complete', 'check_result', 'hint', 'reset'],
    levels: 10,
  },
  pwnhub: {
    version: 2,
    events: [
      'command', 'activity_complete', 'activity_check', 'activity_hint',
      'activity_reset', 'vm_boot',
    ],
    activities: new Set(PWNHUB_ACTIVITIES),
  },
}

const COMMAND_ALLOWLISTS = {
  seclab: new Set([
    'find', 'grep', 'chmod', 'ls', 'cat', 'cd', 'pwd', 'whoami', 'check', 'help', 'su',
  ]),
  pwnhub: new Set([
    'ls', 'cat', 'cd', 'pwd', 'check', 'help', 'readelf', 'nm', 'objdump',
    'file', 'hexdump', 'strings', 'od',
  ]),
}

const VM_BOOT_OUTCOMES = new Set(['ready', 'timeout', 'asset_error', 'linux_error'])
const VM_BOOT_DURATIONS = new Set(['<3s', '3-5s', '5-10s', '10-20s', '>=20s'])
const VM_CACHE_STATES = new Set(['cold', 'warm', 'unknown'])

const COMPLETION_PATHS = new Set(['guided', 'mixed', 'challenge'])
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

// ---- 管理认证常量 ----

const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000 // 12 小时，固定不滑动
const ADMIN_COOKIE_NAME = 'ht_admin'
const ADMIN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/ // 32 字节随机数的 base64url
const SCRYPT_KEYLEN = 32

// ---- 数据库初始化 ----

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    module      TEXT NOT NULL DEFAULT '',
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

  CREATE TABLE IF NOT EXISTS activity_completions (
    token_hash  TEXT NOT NULL,
    module      TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    PRIMARY KEY (token_hash, module, activity_id)
  );

  CREATE TABLE IF NOT EXISTS aggregates (
    module    TEXT NOT NULL,
    metric    TEXT NOT NULL,
    dimension TEXT NOT NULL DEFAULT '',
    count     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (module, metric, dimension)
  );

  CREATE TABLE IF NOT EXISTS event_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    module     TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL,
    dimension  TEXT NOT NULL DEFAULT '',
    ts         INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_event_log_ts ON event_log(ts);
  CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type);

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`)

// v1 数据库原本没有 sessions.module；加列迁移是幂等、向后兼容的。
const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all()
if (!sessionColumns.some((column) => column.name === 'module')) {
  db.exec("ALTER TABLE sessions ADD COLUMN module TEXT NOT NULL DEFAULT ''")
}
// v1 event_log 没有 module；v2 增列后，已有明细仍以空字符串表示旧 SecLab 数据。
// 两步均可安全重复执行：列只补一次，回填在后续启动时不会再次命中。
const eventLogColumns = db.prepare('PRAGMA table_info(event_log)').all()
if (!eventLogColumns.some((column) => column.name === 'module')) {
  db.exec("ALTER TABLE event_log ADD COLUMN module TEXT NOT NULL DEFAULT ''")
}
db.exec("UPDATE event_log SET module = 'seclab' WHERE module = ''")

// ---- 预编译语句 ----

const stmtInsertSession = db.prepare(
  'INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)',
)
const stmtGetSession = db.prepare('SELECT * FROM sessions WHERE token_hash = ?')
const stmtUpdateSession = db.prepare(
  'UPDATE sessions SET last_seq = ?, event_count = event_count + ? WHERE token_hash = ?',
)
const stmtBindSessionModule = db.prepare(
  "UPDATE sessions SET module = ? WHERE token_hash = ? AND module = ''",
)
const stmtDeleteExpiredSessions = db.prepare('DELETE FROM sessions WHERE expires_at < ?')

const stmtCheckCompletion = db.prepare(
  'SELECT 1 FROM completions WHERE token_hash = ? AND module = ? AND level = ?',
)
const stmtInsertCompletion = db.prepare(
  'INSERT OR IGNORE INTO completions (token_hash, module, level) VALUES (?, ?, ?)',
)
const stmtCheckActivityCompletion = db.prepare(
  'SELECT 1 FROM activity_completions WHERE token_hash = ? AND module = ? AND activity_id = ?',
)
const stmtInsertActivityCompletion = db.prepare(
  'INSERT OR IGNORE INTO activity_completions (token_hash, module, activity_id) VALUES (?, ?, ?)',
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

// ---- 事件明细（时间序列）----

const stmtInsertEventLog = db.prepare(
  'INSERT INTO event_log (module, event_type, dimension, ts) VALUES (?, ?, ?, ?)',
)
// 按天聚合最近 N 天的事件明细：session 创建、命令执行、通关等
// 返回 day_bucket(epoch ms, 当天 0 点) -> { event_type -> count }
const stmtTimeseriesDaily = db.prepare(`
  SELECT
    (ts - (ts % 86400000)) AS day_bucket,
    event_type,
    COUNT(*) AS count
  FROM event_log
  WHERE ts >= ?
  GROUP BY day_bucket, event_type
  ORDER BY day_bucket ASC, event_type ASC
`)
const stmtTimeseriesDailyByModule = db.prepare(`
  SELECT
    (ts - (ts % 86400000)) AS day_bucket,
    event_type,
    COUNT(*) AS count
  FROM event_log
  WHERE ts >= ? AND module = ?
  GROUP BY day_bucket, event_type
  ORDER BY day_bucket ASC, event_type ASC
`)
// 按小时聚合最近 N 小时的事件明细（仅 session_create 和 command）
const stmtTimeseriesHourly = db.prepare(`
  SELECT
    (ts - (ts % 3600000)) AS hour_bucket,
    event_type,
    COUNT(*) AS count
  FROM event_log
  WHERE ts >= ? AND event_type IN ('session_create', 'command')
  GROUP BY hour_bucket, event_type
  ORDER BY hour_bucket ASC, event_type ASC
`)
const stmtTimeseriesHourlyByModule = db.prepare(`
  SELECT
    (ts - (ts % 3600000)) AS hour_bucket,
    event_type,
    COUNT(*) AS count
  FROM event_log
  WHERE ts >= ? AND module = ?
    AND event_type IN ('session_create', 'command')
  GROUP BY hour_bucket, event_type
  ORDER BY hour_bucket ASC, event_type ASC
`)
const stmtDeleteOldEventLog = db.prepare('DELETE FROM event_log WHERE ts < ?')

// ---- Dashboard / 管理页查询 ----

const stmtInsertAdminSession = db.prepare(
  'INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)',
)
const stmtGetAdminSession = db.prepare('SELECT * FROM admin_sessions WHERE token_hash = ?')
const stmtDeleteAdminSession = db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?')
const stmtDeleteExpiredAdminSessions = db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?')

const stmtCountSessions = db.prepare(
  "SELECT COUNT(*) AS n FROM sessions WHERE module = ?",
)
const stmtCountActiveSessions = db.prepare(
  "SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ? AND module = ?",
)
const stmtRecentSessions = db.prepare(
  `SELECT token_hash, created_at, expires_at, last_seq, event_count
   FROM sessions WHERE module = ? ORDER BY created_at DESC LIMIT 50`,
)
const stmtCountLevelCompletions = db.prepare(
  'SELECT COUNT(*) AS n FROM completions WHERE module = ?',
)
const stmtCountLevelCompleters = db.prepare(
  'SELECT COUNT(DISTINCT token_hash) AS n FROM completions WHERE module = ?',
)
const stmtCountActivityCompletions = db.prepare(
  'SELECT COUNT(*) AS n FROM activity_completions WHERE module = ?',
)
const stmtCountActivityCompleters = db.prepare(
  'SELECT COUNT(DISTINCT token_hash) AS n FROM activity_completions WHERE module = ?',
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
  const adminResult = stmtDeleteExpiredAdminSessions.run(now)
  if (result.changes > 0 || adminResult.changes > 0) {
    console.log(
      `[telemetry] 清理 ${result.changes} 个过期 session, ${adminResult.changes} 个过期管理会话`,
    )
  }
  // 清理超过保留期的事件明细
  const eventCutoff = now - EVENT_LOG_RETENTION_DAYS * 86400000
  const eventResult = stmtDeleteOldEventLog.run(eventCutoff)
  if (eventResult.changes > 0) {
    console.log(`[telemetry] 清理 ${eventResult.changes} 条过期事件明细`)
  }
  for (const limiter of Object.values(rateLimiters)) limiter.sweep()
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
  return Number.isInteger(MODULES[mod].levels) &&
    Number.isInteger(level) &&
    level >= 1 &&
    level <= MODULES[mod].levels
}

function isValidActivity(mod, activityId) {
  return typeof activityId === 'string' &&
    MODULES[mod].activities instanceof Set &&
    MODULES[mod].activities.has(activityId)
}

function validateEvent(mod, event) {
  if (typeof event !== 'object' || event === null || Array.isArray(event)) return false
  if (!MODULES[mod].events.includes(event.type)) return false

  switch (event.type) {
    case 'command':
      return hasOnlyKeys(event, ['type', 'command']) &&
        typeof event.command === 'string' &&
        COMMAND_ALLOWLISTS[mod].has(event.command)
    case 'level_complete':
      return hasOnlyKeys(event, ['type', 'level', 'path']) &&
        isValidLevel(mod, event.level) &&
        typeof event.path === 'string' &&
        COMPLETION_PATHS.has(event.path)
    case 'check_result':
      return hasOnlyKeys(event, ['type', 'level', 'passed']) &&
        isValidLevel(mod, event.level) &&
        typeof event.passed === 'boolean'
    case 'hint':
    case 'reset':
      return hasOnlyKeys(event, ['type', 'level']) && isValidLevel(mod, event.level)
    case 'activity_complete':
      return hasOnlyKeys(event, ['type', 'activityId', 'path']) &&
        isValidActivity(mod, event.activityId) &&
        typeof event.path === 'string' &&
        COMPLETION_PATHS.has(event.path)
    case 'activity_check':
      return hasOnlyKeys(event, ['type', 'activityId', 'passed']) &&
        isValidActivity(mod, event.activityId) &&
        typeof event.passed === 'boolean'
    case 'activity_hint':
    case 'activity_reset':
      return hasOnlyKeys(event, ['type', 'activityId']) &&
        isValidActivity(mod, event.activityId)
    case 'vm_boot':
      return hasOnlyKeys(event, ['type', 'outcome', 'duration', 'cache']) &&
        VM_BOOT_OUTCOMES.has(event.outcome) &&
        VM_BOOT_DURATIONS.has(event.duration) &&
        VM_CACHE_STATES.has(event.cache)
    default:
      return false
  }
}

function processEvent(mod, event, tokenHash) {
  const now = Date.now()
  switch (event.type) {
    case 'command':
      stmtUpsertAggregate.run(mod, 'command', event.command, 1)
      stmtInsertEventLog.run(mod, 'command', event.command, now)
      return true
    case 'check_result':
      stmtUpsertAggregate.run(mod, event.passed ? 'check_pass' : 'check_fail', `level-${event.level}`, 1)
      stmtInsertEventLog.run(mod, 'check_result', `level-${event.level}:${event.passed ? 'passed' : 'failed'}`, now)
      return true
    case 'level_complete': {
      const already = stmtCheckCompletion.get(tokenHash, mod, event.level)
      if (already) return false
      stmtInsertCompletion.run(tokenHash, mod, event.level)
      stmtUpsertAggregate.run(mod, 'complete', `level-${event.level}`, 1)
      stmtUpsertAggregate.run(mod, 'complete_path', `level-${event.level}:${event.path}`, 1)
      stmtInsertEventLog.run(mod, 'level_complete', `level-${event.level}`, now)
      return true
    }
    case 'hint':
      stmtUpsertAggregate.run(mod, 'hint', `level-${event.level}`, 1)
      stmtInsertEventLog.run(mod, 'hint', `level-${event.level}`, now)
      return true
    case 'reset':
      stmtUpsertAggregate.run(mod, 'reset', `level-${event.level}`, 1)
      stmtInsertEventLog.run(mod, 'reset', `level-${event.level}`, now)
      return true
    case 'activity_check':
      stmtUpsertAggregate.run(mod, event.passed ? 'check_pass' : 'check_fail', event.activityId, 1)
      stmtInsertEventLog.run(mod, 'activity_check', `${event.activityId}:${event.passed ? 'passed' : 'failed'}`, now)
      return true
    case 'activity_complete': {
      const already = stmtCheckActivityCompletion.get(tokenHash, mod, event.activityId)
      if (already) return false
      stmtInsertActivityCompletion.run(tokenHash, mod, event.activityId)
      stmtUpsertAggregate.run(mod, 'complete', event.activityId, 1)
      stmtUpsertAggregate.run(mod, 'complete_path', `${event.activityId}:${event.path}`, 1)
      stmtInsertEventLog.run(mod, 'activity_complete', event.activityId, now)
      return true
    }
    case 'activity_hint':
      stmtUpsertAggregate.run(mod, 'hint', event.activityId, 1)
      stmtInsertEventLog.run(mod, 'activity_hint', event.activityId, now)
      return true
    case 'activity_reset':
      stmtUpsertAggregate.run(mod, 'reset', event.activityId, 1)
      stmtInsertEventLog.run(mod, 'activity_reset', event.activityId, now)
      return true
    case 'vm_boot': {
      const dimension = `${event.outcome}:${event.duration}:${event.cache}`
      stmtUpsertAggregate.run(mod, 'vm_boot', dimension, 1)
      stmtUpsertAggregate.run(mod, 'vm_boot_outcome', event.outcome, 1)
      stmtUpsertAggregate.run(mod, 'vm_boot_duration', event.duration, 1)
      stmtUpsertAggregate.run(mod, 'vm_boot_cache', event.cache, 1)
      stmtInsertEventLog.run(mod, 'vm_boot', dimension, now)
      return true
    }
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
  if (typeof batch.module !== 'string' || !(batch.module in MODULES)) return { status: 400 }
  if (!PROTOCOL_VERSIONS.has(batch.v) || batch.v !== MODULES[batch.module].version) {
    return { status: 400 }
  }
  if (typeof batch.session !== 'string' || !SESSION_TOKEN_PATTERN.test(batch.session)) {
    return { status: 400 }
  }
  const sessionRow = getSession(batch.session)
  if (!sessionRow) return { status: 401 }
  if (sessionRow.module !== '' && sessionRow.module !== batch.module) return { status: 400 }

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
    if (sessionRow.module === '') {
      stmtBindSessionModule.run(batch.module, tokenHash)
      stmtInsertEventLog.run(batch.module, 'session_create', '', Date.now())
    }
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

/**
 * 返回最近 N 天的按天时间序列（session 创建数 + 各事件类型计数）。
 * 补零：没有事件的天也会出现，方便前端直接画趋势图。
 * 返回格式：[{ day, session_create, command, level_complete, hint, reset }]
 */
function getTimeseries(days = 30, mod) {
  const now = Date.now()
  const dayMs = 86400000
  const startOfDay = now - (now % dayMs)
  const cutoff = startOfDay - (days - 1) * dayMs

  const rows = mod ? stmtTimeseriesDailyByModule.all(cutoff, mod) : stmtTimeseriesDaily.all(cutoff)

  // 初始化每天的结构，补零
  const buckets = new Map()
  for (let d = 0; d < days; d++) {
    const day = cutoff + d * dayMs
    buckets.set(day, {
      day,
      session_create: 0,
      command: 0,
      level_complete: 0,
      hint: 0,
      reset: 0,
    })
  }

  // 填入实际数据
  for (const row of rows) {
    const entry = buckets.get(row.day_bucket)
    if (!entry) continue
    const eventType = row.event_type === 'activity_complete'
      ? 'level_complete'
      : row.event_type.startsWith('activity_')
        ? row.event_type.slice('activity_'.length)
        : row.event_type
    if (eventType in entry) entry[eventType] += row.count
  }

  return [...buckets.values()]
}

/**
 * 返回最近 24 小时的按小时时间序列（session 创建数 + 命令执行数）。
 * 补零：没有事件的小时也会出现，方便前端直接画折线图。
 * 返回格式：[{ hour, session_create, command }]
 */
function getHourlyTimeseries(hours = 24, mod) {
  const now = Date.now()
  const hourMs = 3600000
  const startOfHour = now - (now % hourMs)
  const cutoff = startOfHour - (hours - 1) * hourMs

  const rows = mod ? stmtTimeseriesHourlyByModule.all(cutoff, mod) : stmtTimeseriesHourly.all(cutoff)

  // 初始化每小时的结构，补零
  const buckets = new Map()
  for (let h = 0; h < hours; h++) {
    const hour = cutoff + h * hourMs
    buckets.set(hour, { hour, session_create: 0, command: 0 })
  }

  // 填入实际数据
  for (const row of rows) {
    const entry = buckets.get(row.hour_bucket)
    if (entry && row.event_type in entry) {
      entry[row.event_type] = row.count
    }
  }

  return [...buckets.values()]
}

// ---- 速率限制（内存滑动窗口，单进程） ----

function createRateLimiter(windowMs, max) {
  const hits = new Map() // key -> { count, resetAt }
  return {
    allow(key) {
      const now = Date.now()
      let rec = hits.get(key)
      if (!rec || rec.resetAt <= now) {
        rec = { count: 0, resetAt: now + windowMs }
        hits.set(key, rec)
      }
      rec.count += 1
      return rec.count <= max
    },
    sweep() {
      const now = Date.now()
      for (const [key, rec] of hits) {
        if (rec.resetAt <= now) hits.delete(key)
      }
    },
  }
}

const rateLimiters = {
  publicStats: createRateLimiter(60 * 1000, 30),
  adminLoginIp: createRateLimiter(5 * 60 * 1000, 5),
  adminLoginGlobal: createRateLimiter(5 * 60 * 1000, 30),
  adminApi: createRateLimiter(60 * 1000, 60),
  dashboardStatic: createRateLimiter(60 * 1000, 120),
}

// backend 只监听 127.0.0.1，X-Real-IP 由本机 nginx 设置，可信
function clientIp(req) {
  return req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown'
}

// ---- 管理认证 ----

function verifyAdminPassword(password) {
  if (!ADMIN_PASSWORD_HASH) return false
  const parts = ADMIN_PASSWORD_HASH.split(':')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const N = parseInt(parts[1], 10)
  const r = parseInt(parts[2], 10)
  const p = parseInt(parts[3], 10)
  let expected
  try {
    expected = Buffer.from(parts[5], 'hex')
    if (expected.length === 0 || !/^[0-9a-f]+$/i.test(parts[4])) return false
    const derived = crypto.scryptSync(password, Buffer.from(parts[4], 'hex'), expected.length, { N, r, p })
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

function parseCookies(req) {
  const cookies = new Map()
  const header = req.headers.cookie
  if (!header) return cookies
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx > 0) cookies.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim())
  }
  return cookies
}

function buildAdminCookie(value, maxAgeSec) {
  return [
    `${ADMIN_COOKIE_NAME}=${value}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Path=${ADMIN_COOKIE_PATH}`,
    `Max-Age=${maxAgeSec}`,
  ].join('; ')
}

function getAdminSession(req) {
  const token = parseCookies(req).get(ADMIN_COOKIE_NAME)
  if (!token || !ADMIN_TOKEN_PATTERN.test(token)) return null
  const row = stmtGetAdminSession.get(sha256Hex(token))
  if (!row || row.expires_at < Date.now()) return null
  return row
}

// ---- 管理页详细数据 ----

const STARTED_AT = Date.now()

function getCompletionSummary(mod) {
  if (mod === 'pwnhub') {
    return {
      total: stmtCountActivityCompletions.get(mod).n,
      uniqueTokens: stmtCountActivityCompleters.get(mod).n,
    }
  }
  return {
    total: stmtCountLevelCompletions.get(mod).n,
    uniqueTokens: stmtCountLevelCompleters.get(mod).n,
  }
}

function buildAdminOverview(mod) {
  const now = Date.now()
  let dbSizeBytes = 0
  try {
    dbSizeBytes = fs.statSync(DB_PATH).size
  } catch {
    // 数据库文件不可读时仅省略该字段值
  }
  return {
    generatedAt: now,
    activeModule: mod,
    service: {
      startedAt: STARTED_AT,
      uptimeSec: Math.floor((now - STARTED_AT) / 1000),
      nodeVersion: process.version,
      dbSizeBytes,
      modules: Object.keys(MODULES),
    },
    modules: getStats(mod).body,
    sessions: {
      active: stmtCountActiveSessions.get(now, mod).n,
      total: stmtCountSessions.get(mod).n,
      recent: stmtRecentSessions.all(mod).map((row) => ({
        tokenPrefix: row.token_hash.slice(0, 8),
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        lastSeq: row.last_seq,
        eventCount: row.event_count,
        expired: row.expires_at < now,
      })),
    },
    completions: getCompletionSummary(mod),
    timeseries: getTimeseries(30, mod),
    hourly: getHourlyTimeseries(24, mod),
  }
}

// ---- Dashboard 静态资源（启动时加载进内存，白名单路由） ----

const DASHBOARD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

const API_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
}

const DASHBOARD_HEADERS = {
  'Content-Security-Policy': DASHBOARD_CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
}

// 路由路径 -> [文件名, MIME]。白名单之外的任何路径都 404，杜绝目录穿越。
const DASHBOARD_FILES = {
  '/dashboard/': ['index.html', 'text/html; charset=utf-8'],
  '/dashboard/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/dashboard/admin.html': ['admin.html', 'text/html; charset=utf-8'],
  '/dashboard/dashboard.js': ['dashboard.js', 'text/javascript; charset=utf-8'],
  '/dashboard/admin.js': ['admin.js', 'text/javascript; charset=utf-8'],
  '/dashboard/style.css': ['style.css', 'text/css; charset=utf-8'],
}

const dashboardAssets = new Map()
for (const [route, [file, mime]] of Object.entries(DASHBOARD_FILES)) {
  try {
    dashboardAssets.set(route, {
      content: fs.readFileSync(path.join(DASHBOARD_DIR, file)),
      mime,
    })
  } catch {
    console.warn(`[telemetry] dashboard 资源缺失: ${path.join(DASHBOARD_DIR, file)}`)
  }
}

function serveDashboardAsset(res, route) {
  const asset = dashboardAssets.get(route)
  if (!asset) {
    sendJson(res, 404, { error: 'not found' }, API_HEADERS)
    return
  }
  res.writeHead(200, {
    'Content-Type': asset.mime,
    'Content-Length': asset.content.length,
    ...DASHBOARD_HEADERS,
  })
  res.end(asset.content)
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

function sendJson(res, status, body, headers = {}) {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    ...headers,
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

    // ---- 以下为浏览器直连路由（不经 Edge Function，无 HMAC） ----

    // GET /dashboard -> 302 到尾斜杠（页面内相对资源路径依赖尾斜杠）
    if (path === '/dashboard' && req.method === 'GET') {
      res.writeHead(302, { Location: `${PUBLIC_PREFIX}/dashboard/`, ...API_HEADERS })
      return res.end()
    }

    // GET /dashboard/* 静态资源（白名单）
    if (path.startsWith('/dashboard/') && req.method === 'GET') {
      if (!rateLimiters.dashboardStatic.allow(clientIp(req))) {
        return sendJson(res, 429, { error: 'rate limited' }, API_HEADERS)
      }
      return serveDashboardAsset(res, path)
    }

    // GET /api/public/stats[?module=seclab] — 公开聚合数据，无需签名
    if (path === '/api/public/stats' && req.method === 'GET') {
      if (!rateLimiters.publicStats.allow(clientIp(req))) {
        return sendJson(res, 429, { error: 'rate limited' }, API_HEADERS)
      }
      const mod = url.searchParams.get('module') || undefined
      const result = getStats(mod)
      if (result.status !== 200) return sendJson(res, result.status, { error: 'invalid module' }, API_HEADERS)
      return sendJson(res, 200, {
        ok: true,
        generatedAt: Date.now(),
        modules: result.body,
        timeseries: getTimeseries(30, mod),
        hourly: getHourlyTimeseries(24, mod),
      }, API_HEADERS)
    }

    // POST /api/admin/login — scrypt 密码校验，下发 HttpOnly 管理 cookie
    if (path === '/api/admin/login' && req.method === 'POST') {
      const ip = clientIp(req)
      if (!rateLimiters.adminLoginIp.allow(ip) || !rateLimiters.adminLoginGlobal.allow('global')) {
        return sendJson(res, 429, { error: 'rate limited' }, API_HEADERS)
      }
      if (!ADMIN_PASSWORD_HASH) {
        return sendJson(res, 503, { error: 'admin not configured' }, API_HEADERS)
      }
      const body = await readBody(req)
      let payload
      try { payload = JSON.parse(body) } catch {
        return sendJson(res, 400, { error: 'invalid json' }, API_HEADERS)
      }
      if (!hasOnlyKeys(payload, ['password']) ||
          typeof payload.password !== 'string' ||
          payload.password.length === 0 ||
          payload.password.length > 256) {
        return sendJson(res, 400, { error: 'invalid request' }, API_HEADERS)
      }
      if (!verifyAdminPassword(payload.password)) {
        console.warn('[telemetry] 管理登录失败')
        return sendJson(res, 401, { error: 'invalid credentials' }, API_HEADERS)
      }
      const token = crypto.randomBytes(32).toString('base64url')
      const now = Date.now()
      stmtInsertAdminSession.run(sha256Hex(token), now, now + ADMIN_SESSION_TTL_MS)
      return sendJson(res, 200, { ok: true, expiresAt: now + ADMIN_SESSION_TTL_MS }, {
        ...API_HEADERS,
        'Set-Cookie': buildAdminCookie(token, Math.floor(ADMIN_SESSION_TTL_MS / 1000)),
      })
    }

    // POST /api/admin/logout — 销毁服务端会话并清除 cookie
    if (path === '/api/admin/logout' && req.method === 'POST') {
      const token = parseCookies(req).get(ADMIN_COOKIE_NAME)
      if (token && ADMIN_TOKEN_PATTERN.test(token)) {
        stmtDeleteAdminSession.run(sha256Hex(token))
      }
      return sendJson(res, 200, { ok: true }, {
        ...API_HEADERS,
        'Set-Cookie': buildAdminCookie('deleted', 0),
      })
    }

    // GET /api/admin/overview?module=seclab — 管理页详细数据（需认证）
    if (path === '/api/admin/overview' && req.method === 'GET') {
      if (!rateLimiters.adminApi.allow(clientIp(req))) {
        return sendJson(res, 429, { error: 'rate limited' }, API_HEADERS)
      }
      if (!getAdminSession(req)) {
        return sendJson(res, 401, { error: 'unauthorized' }, API_HEADERS)
      }
      const mod = url.searchParams.get('module') || 'seclab'
      if (!(mod in MODULES)) {
        return sendJson(res, 400, { error: 'invalid module' }, API_HEADERS)
      }
      return sendJson(res, 200, buildAdminOverview(mod), API_HEADERS)
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
  console.log(`[telemetry] dashboard 资源目录: ${DASHBOARD_DIR} (${dashboardAssets.size}/${Object.keys(DASHBOARD_FILES).length} 已加载)`)
  // 启动时清理一次过期 session
  cleanupExpiredSessions()
})
