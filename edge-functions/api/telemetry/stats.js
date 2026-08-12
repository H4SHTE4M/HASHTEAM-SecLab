// EdgeOne Makers Edge Function: /api/telemetry/stats
//
// 只读聚合统计 API。支持可选 ?module=seclab 过滤。
// 转发到后端，后端返回预聚合的 counter 数据。
//
// 链路：Browser -> Edge Function -> Backend (HMAC 鉴权) -> SQLite (只读聚合查询)
//
// 环境变量：
//   TELEMETRY_BACKEND_URL  - 腾讯云 VM 上的 telemetry backend 地址
//   TELEMETRY_EDGE_SECRET  - Edge Function 与 backend 共享的 HMAC 密钥

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const ALLOWED_MODULES = ['seclab']

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function onRequestGet(context) {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const backendUrl = env.TELEMETRY_BACKEND_URL
  if (!backendUrl) {
    return new Response(JSON.stringify({ error: 'backend unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }

  // 只允许预定义 module 过滤，不提供任意查询能力
  const url = new URL(request.url)
  const mod = url.searchParams.get('module')
  if (mod !== null && !ALLOWED_MODULES.includes(mod)) {
    return new Response(JSON.stringify({ error: 'invalid module' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }

  try {
    const query = mod ? `?module=${encodeURIComponent(mod)}` : ''
    const secret = env.TELEMETRY_EDGE_SECRET || ''
    const sig = await hmacSha256Hex(secret, `stats:${query}`)

    const response = await fetch(`${backendUrl}/stats${query}`, {
      method: 'GET',
      headers: { 'X-Telemetry-Sig': sig },
      signal: AbortSignal.timeout(4000),
    })

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'backend error' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    const data = await response.json()
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
        ...CORS_HEADERS,
      },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'backend unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
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
