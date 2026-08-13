/**
 * 评分协议验签（HMAC-SHA256 over WebCrypto）。
 *
 * VM 每次启动由 init（root）随机生成会话密钥并随首个 ready 协议签发；
 * VM 内的 SUID 评分检查器 htcheck 只给真实通过的 check 结果签名。
 * 前端把密钥导入为不可提取（extractable=false）的 CryptoKey，并在日志中脱敏，
 * 避免正常页面运行期间再次导出或意外展示；这只能抬高直接伪造门槛，无法把
 * 用户完全控制的浏览器客户端变成服务端级可信边界。
 */

/** 被签名的消息内容；必须与 vm/toolchain-source/htcheck/htcheck.c 中的格式一致。 */
export function levelResultMessage(level: number, status: 'passed'): string {
  return `level-result:${level}:${status}`
}

export function levelReadyMessage(level: number): string {
  return `level-ready:${level}`
}

export function labResultMessage(labId: string, status: 'passed'): string {
  return `lab-result:${labId}:${status}`
}

export function labReadyMessage(labId: string): string {
  return `lab-ready:${labId}`
}

function base64ToBytes(base64: string): Uint8Array | null {
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    return null
  }
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/.test(hex)) return null
  const bytes = new Uint8Array(32)
  for (let index = 0; index < 32; index++) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

/**
 * 把 ready 协议携带的 base64 会话密钥导入为不可提取 CryptoKey。
 * 返回 null 表示密钥不可用（验签功能随之禁用，调用方按「无签名会话」处理）。
 */
export async function importSessionKey(base64: string): Promise<CryptoKey | null> {
  if (typeof crypto === 'undefined' || crypto.subtle === undefined) return null
  const bytes = base64ToBytes(base64)
  if (bytes === null || bytes.length < 16) return null
  try {
    return await crypto.subtle.importKey(
      'raw',
      bytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
  } catch {
    return null
  }
}

/** 验签；任何异常一律视为验签失败（宁可拒真，不可放行伪造）。 */
export async function verifySignature(
  key: CryptoKey,
  message: string,
  sigHex: string,
): Promise<boolean> {
  const sig = hexToBytes(sigHex)
  if (sig === null) return false
  try {
    return await crypto.subtle.verify(
      { name: 'HMAC' },
      key,
      sig,
      new TextEncoder().encode(message),
    )
  } catch {
    return false
  }
}
