import { describe, expect, it } from 'vitest'
import {
  buildPayloadWriteCommand,
  bytesToBase64,
  composePayload,
  cyclicFind,
  generateCyclicPattern,
  p32,
  parseHexBytes,
} from '../src/services/payload'

describe('deterministic payload helpers', () => {
  it('按 i386 小端顺序编码 p32，并接受严格的十六进制字节格式', () => {
    expect([...p32('0x12345678')]).toEqual([0x78, 0x56, 0x34, 0x12])
    expect([...parseHexBytes('41 42,43:44')]).toEqual([0x41, 0x42, 0x43, 0x44])
    expect([...parseHexBytes('\\x41\\x42')]).toEqual([0x41, 0x42])
    expect(() => parseHexBytes('414')).toThrow('偶数个字符')
  })

  it('生成 pwntools 风格四字节 de Bruijn 前缀并查找偏移', () => {
    expect(new TextDecoder().decode(generateCyclicPattern(16))).toBe('aaaabaaacaaadaaa')
    expect(cyclicFind('baaa')).toBe(4)
    expect(cyclicFind('0x61616162')).toBe(4)
    expect(() => cyclicFind('aaa')).toThrow('至少需要 4 个字节')
  })

  it('组合分段、记录范围与空字节，并执行总长度门禁', () => {
    const payload = composePayload([
      { id: 'padding', label: 'padding', kind: 'padding', byte: 0x41, length: 4 },
      { id: 'address', label: 'address', kind: 'p32', value: '0x12340000' },
      { id: 'tail', label: 'tail', kind: 'hex', value: 'ff' },
    ])

    expect([...payload.bytes]).toEqual([0x41, 0x41, 0x41, 0x41, 0x00, 0x00, 0x34, 0x12, 0xff])
    expect(payload.ranges.map(({ offset, length }) => [offset, length])).toEqual([[0, 4], [4, 4], [8, 1]])
    expect(payload.nullOffsets).toEqual([4, 5])
    expect(() => composePayload([
      { id: 'large', label: 'large', kind: 'padding', byte: 0x41, length: 9 },
    ], 8)).toThrow('不能超过 8 字节')
  })

  it('生成 BusyBox Base64 回退命令并拒绝危险路径', () => {
    const bytes = Uint8Array.of(0x41, 0x00, 0xff)
    expect(bytesToBase64(bytes)).toBe('QQD/')
    expect(buildPayloadWriteCommand(bytes, 'work/payload.bin')).toBe(
      "printf '%s' 'QQD/' | base64 -d > 'work/payload.bin'",
    )
    expect(() => buildPayloadWriteCommand(bytes, '../payload.bin')).toThrow('安全相对路径')
    expect(() => buildPayloadWriteCommand(bytes, 'payload;id')).toThrow('安全相对路径')
    expect(() => buildPayloadWriteCommand(bytes, 'work/')).toThrow('安全相对路径')
  })
})
