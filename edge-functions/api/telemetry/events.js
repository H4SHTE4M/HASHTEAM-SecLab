// EdgeOne Makers Edge Function: /api/telemetry/events
//
// 接收前端批量遥测事件，做基础校验后转发到后端。
// 后端负责 session 验证、seq 重放保护、allowlist 校验、聚合写入。
//
// 链路：Browser -> Edge Function (基础校验 + HMAC 签名) -> Backend -> SQLite
//
// 环境变量：
//   TELEMETRY_BACKEND_URL  - 腾讯云 VM 上的 telemetry backend 地址
//   TELEMETRY_EDGE_SECRET  - Edge Function 与 backend 共享的 HMAC 密钥

const API_HEADERS = {
  'Cache-Control': 'no-store',
}

const MAX_EVENTS_PER_BATCH = 50
const PROTOCOL_VERSION = 1

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: API_HEADERS })
}

export async function onRequestPost(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: API_HEADERS })
  }

  const backendUrl = env.TELEMETRY_BACKEND_URL
  if (!backendUrl) {
    return new Response(JSON.stringify({ error: 'backend unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...API_HEADERS },
    })
  }

  let batch
  try {
    batch = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...API_HEADERS },
    })
  }

  // 基础校验：协议版本、module、session、events 格式
  if (
    typeof batch !== 'object' || batch === null ||
    batch.v !== PROTOCOL_VERSION ||
    typeof batch.module !== 'string' || batch.module.length === 0 ||
    typeof batch.session !== 'string' || batch.session.length === 0 ||
    typeof batch.seq !== 'number' || !Number.isInteger(batch.seq) || batch.seq < 1 ||
    !Array.isArray(batch.events) || batch.events.length === 0 ||
    batch.events.length > MAX_EVENTS_PER_BATCH
  ) {
    return new Response(JSON.stringify({ error: 'invalid batch' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...API_HEADERS },
    })
  }

  try {
    // 用共享密钥对转发请求签名（HMAC-SHA256 over JSON body）
    const secret = env.TELEMETRY_EDGE_SECRET || ''
    const bodyStr = JSON.stringify(batch)
    const sig = await hmacSha256Hex(secret, bodyStr)

    const response = await fetch(`${backendUrl}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telemetry-Sig': sig,
      },
      body: bodyStr,
      signal: AbortSignal.timeout(4000),
    })

    // 后端拒绝（重放、超出预算等）：透传状态码，但不暴露细节
    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'rejected' }), {
        status: [400, 409, 429].includes(response.status) ? response.status : 502,
        headers: { 'Content-Type': 'application/json', ...API_HEADERS },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...API_HEADERS },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'backend unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...API_HEADERS },
    })
  }
}

async function hmacSha256Hex(key, message) {
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
