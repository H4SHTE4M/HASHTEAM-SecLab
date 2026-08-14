import type { PayloadSegmentDefinition } from '../types/binary'

export const DEFAULT_PAYLOAD_LIMIT = 64 * 1024
export const MAX_PAYLOAD_SEGMENTS = 32
const DEFAULT_CYCLIC_WIDTH = 4
const DEFAULT_CYCLIC_ALPHABET = 'abcdefghijklmnopqrstuvwxyz'
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export interface PayloadRange {
  id: string
  label: string
  kind: PayloadSegmentDefinition['kind']
  offset: number
  length: number
}

export interface ComposedPayload {
  bytes: Uint8Array
  ranges: PayloadRange[]
  nullOffsets: number[]
}

function assertLength(value: number, label: string, limit = DEFAULT_PAYLOAD_LIMIT): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label}必须是非负整数`)
  if (value > limit) throw new Error(`${label}不能超过 ${limit} 字节`)
  return value
}

export function parseUint32(input: string): number {
  const value = input.trim()
  if (!/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(value)) {
    throw new Error('p32 只接受十进制或 0x 开头的十六进制整数')
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 0xffffffff) {
    throw new Error('p32 数值必须在 0 到 0xffffffff 之间')
  }
  return parsed
}

export function p32(input: string | number): Uint8Array {
  const value = typeof input === 'number' ? input : parseUint32(input)
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error('p32 数值必须在 0 到 0xffffffff 之间')
  }
  return Uint8Array.of(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  )
}

export function parseHexBytes(input: string): Uint8Array {
  const value = input.trim()
  if (value.length === 0) throw new Error('十六进制字节不能为空')

  let tokens: string[]
  if (/^(?:\\x[0-9a-f]{2})+$/i.test(value)) {
    tokens = value.slice(2).split(/\\x/i)
  } else if (/^[0-9a-f]+$/i.test(value)) {
    if (value.length % 2 !== 0) throw new Error('连续十六进制必须包含偶数个字符')
    tokens = value.match(/.{2}/g) ?? []
  } else {
    tokens = value.split(/[\s,:]+/).map((token) => token.replace(/^0x/i, ''))
  }

  if (tokens.length === 0 || tokens.some((token) => !/^[0-9a-f]{2}$/i.test(token))) {
    throw new Error('十六进制字节应写成 41 42、4142 或 \\x41\\x42')
  }
  return Uint8Array.from(tokens.map((token) => Number.parseInt(token, 16)))
}

export function generateCyclicPattern(length: number): Uint8Array {
  const requested = assertLength(length, 'cyclic 长度')
  if (requested === 0) return new Uint8Array()

  const alphabet = [...DEFAULT_CYCLIC_ALPHABET].map((character) => character.charCodeAt(0))
  const working = new Array<number>(alphabet.length * DEFAULT_CYCLIC_WIDTH).fill(0)
  const sequence: number[] = []

  function visit(depth: number, period: number): boolean {
    if (depth > DEFAULT_CYCLIC_WIDTH) {
      if (DEFAULT_CYCLIC_WIDTH % period !== 0) return false
      for (let index = 1; index <= period; index += 1) {
        sequence.push(alphabet[working[index]])
        if (sequence.length === requested) return true
      }
      return false
    }

    working[depth] = working[depth - period]
    if (visit(depth + 1, period)) return true
    for (let index = working[depth - period] + 1; index < alphabet.length; index += 1) {
      working[depth] = index
      if (visit(depth + 1, depth)) return true
    }
    return false
  }

  visit(1, 1)
  if (sequence.length < requested) throw new Error('cyclic 长度超过默认四字节唯一序列容量')
  return Uint8Array.from(sequence)
}

function parseCyclicNeedle(input: string | number): Uint8Array {
  if (typeof input === 'number') return p32(input)
  const value = input.trim()
  if (/^0x[0-9a-f]+$/i.test(value) || /^[0-9]+$/.test(value)) return p32(value)
  if (/^(?:\\x[0-9a-f]{2})+$/i.test(value) || /^[0-9a-f]{8}$/i.test(value) || /[\s,:]/.test(value)) {
    return parseHexBytes(value)
  }
  const bytes = new TextEncoder().encode(value)
  if (bytes.length < DEFAULT_CYCLIC_WIDTH) throw new Error('cyclic-find 至少需要 4 个字节')
  return bytes
}

export function cyclicFind(input: string | number, searchLength = DEFAULT_PAYLOAD_LIMIT): number {
  const pattern = generateCyclicPattern(searchLength)
  const needle = parseCyclicNeedle(input)
  outer: for (let offset = 0; offset <= pattern.length - needle.length; offset += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (pattern[offset + index] !== needle[index]) continue outer
    }
    return offset
  }
  return -1
}

export function buildPayloadSegment(segment: PayloadSegmentDefinition): Uint8Array {
  if (segment.kind === 'padding') {
    if (!Number.isInteger(segment.byte) || segment.byte < 0 || segment.byte > 0xff) {
      throw new Error('填充字节必须在 0x00 到 0xff 之间')
    }
    return new Uint8Array(assertLength(segment.length, '填充长度')).fill(segment.byte)
  }
  if (segment.kind === 'p32') return p32(segment.value)
  if (segment.kind === 'hex') return parseHexBytes(segment.value)
  if (segment.kind === 'text') return new TextEncoder().encode(segment.value)
  return generateCyclicPattern(segment.length)
}

export function composePayload(
  segments: PayloadSegmentDefinition[],
  maxBytes = DEFAULT_PAYLOAD_LIMIT,
): ComposedPayload {
  assertLength(maxBytes, 'payload 上限', DEFAULT_PAYLOAD_LIMIT)
  if (maxBytes === 0) throw new Error('payload 上限必须大于 0')
  if (segments.length > MAX_PAYLOAD_SEGMENTS) {
    throw new Error(`payload 最多包含 ${MAX_PAYLOAD_SEGMENTS} 个分段`)
  }

  const parts: Uint8Array[] = []
  const ranges: PayloadRange[] = []
  let total = 0
  for (const segment of segments) {
    const bytes = buildPayloadSegment(segment)
    if (total + bytes.length > maxBytes) throw new Error(`payload 不能超过 ${maxBytes} 字节`)
    parts.push(bytes)
    ranges.push({
      id: segment.id,
      label: segment.label,
      kind: segment.kind,
      offset: total,
      length: bytes.length,
    })
    total += bytes.length
  }

  const bytes = new Uint8Array(total)
  const nullOffsets: number[] = []
  let cursor = 0
  for (const part of parts) {
    bytes.set(part, cursor)
    cursor += part.length
  }
  bytes.forEach((byte, offset) => {
    if (byte === 0) nullOffsets.push(offset)
  })
  return { bytes, ranges, nullOffsets }
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
}

export function bytesToBase64(bytes: Uint8Array): string {
  let result = ''
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset]
    const second = bytes[offset + 1]
    const third = bytes[offset + 2]
    const packed = (first << 16) | ((second ?? 0) << 8) | (third ?? 0)
    result += BASE64_ALPHABET[(packed >>> 18) & 0x3f]
    result += BASE64_ALPHABET[(packed >>> 12) & 0x3f]
    result += second === undefined ? '=' : BASE64_ALPHABET[(packed >>> 6) & 0x3f]
    result += third === undefined ? '=' : BASE64_ALPHABET[packed & 0x3f]
  }
  return result
}

export function validatePayloadPath(input: string): string {
  const path = input.trim()
  const parts = path.split('/')
  if (
    path.length === 0 ||
    path.length > 128 ||
    path.startsWith('/') ||
    path.includes('//') ||
    !/^[a-z0-9][a-z0-9._/-]*$/i.test(path) ||
    parts.some((part) => part.length === 0 || part === '.' || part === '..')
  ) {
    throw new Error('文件名必须是 128 字符内的安全相对路径，不能包含空格或 ..')
  }
  return path
}

export function buildPayloadWriteCommand(bytes: Uint8Array, outputPath: string): string {
  const path = validatePayloadPath(outputPath)
  const base64 = bytesToBase64(bytes)
  return `printf '%s' '${base64}' | base64 -d > '${path}'`
}
