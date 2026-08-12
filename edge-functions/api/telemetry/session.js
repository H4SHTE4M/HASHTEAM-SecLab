// EdgeOne Makers Edge Function: /api/telemetry/session
//
// 匿名 session 引导：生成短生命周期 session token，转发到后端存储 token hash。
// 前端只拿到 token 明文（不持久化），后端只存 SHA-256 hash。
//
// 链路：Browser -> Edge Function -> Backend (HMAC 鉴权) -> SQLite
//
// 环境变量（在 EdgeOne Makers 控制台配置）：
//   TELEMETRY_BACKEND_URL  - 腾讯云 VM 上的 telemetry backend 地址
//   TELEMETRY_EDGE_SECRET  - Edge Function 与 backend 共享的 HMAC 密钥

const API_HEADERS = {
  'Cache-Control': 'no-store',
}

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

  try {
    // 生成 32 字节随机 session token（base64url）
    const tokenBytes = new Uint8Array(32)
    crypto.getRandomValues(tokenBytes)
    const session = base64UrlEncode(tokenBytes)

    // 用共享密钥对转发请求签名（HMAC-SHA256 over "session-bootstrap:" + session）
    const secret = env.TELEMETRY_EDGE_SECRET || ''
    const sig = await hmacSha256Hex(secret, `session-bootstrap:${session}`)

    const response = await fetchWithTimeout(`${backendUrl}/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telemetry-Sig': sig,
      },
      body: JSON.stringify({ session }),
    }, 4000)

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'backend error' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...API_HEADERS },
      })
    }

    const result = await response.json()
    return new Response(
      JSON.stringify({
        session: result.session || session,
        expiresAt: result.expiresAt || Date.now() + 30 * 60 * 1000,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...API_HEADERS },
      },
    )
  } catch {
    return new Response(JSON.stringify({ error: 'session bootstrap failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...API_HEADERS },
    })
  }
}

function base64UrlEncode(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
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
