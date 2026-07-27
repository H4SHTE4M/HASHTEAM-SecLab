import { describe, expect, it } from 'vitest'
import { PROTOCOL_MARKER, SerialProtocolParser } from '../src/services/protocol-parser'

const M = PROTOCOL_MARKER

describe('SerialProtocolParser', () => {
  it('原样透传普通串口输出', () => {
    const parser = new SerialProtocolParser()
    const { display, messages } = parser.feed('guest@hashteam:~$ ls\r\nREADME  notes.txt\r\n')
    expect(display).toBe('guest@hashteam:~$ ls\r\nREADME  notes.txt\r\n')
    expect(messages).toEqual([])
  })

  it('解析控制协议消息且不在终端显示', () => {
    const parser = new SerialProtocolParser()
    const { display, messages } = parser.feed(`${M}{"type":"level-result","level":3,"status":"passed"}\n`)
    expect(display).toBe('')
    expect(messages).toEqual([{ type: 'level-result', level: 3, status: 'passed' }])
  })

  it('普通输出与协议消息混排时各行其是', () => {
    const parser = new SerialProtocolParser()
    const input = `hello\r\n${M}{"type":"ready","version":1}\nworld\n`
    const { display, messages } = parser.feed(input)
    expect(display).toBe('hello\r\nworld\n')
    expect(messages).toEqual([{ type: 'ready', version: 1 }])
  })

  it('半包：协议行被拆到两个数据块也能拼齐', () => {
    const parser = new SerialProtocolParser()
    const first = parser.feed(`prefix\r\n${M}{"type":"level-re`)
    expect(first.messages).toEqual([])
    expect(first.display).toBe('prefix\r\n')
    const second = parser.feed(`sult","level":1,"status":"passed"}\n`)
    expect(second.messages).toEqual([{ type: 'level-result', level: 1, status: 'passed' }])
    expect(second.display).toBe('')
  })

  it('粘包：一个数据块中的多条协议消息全部解析', () => {
    const parser = new SerialProtocolParser()
    const input = `${M}{"type":"level-ready","level":2}\n${M}{"type":"level-result","level":2,"status":"passed"}\ntail\n`
    const { display, messages } = parser.feed(input)
    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual({ type: 'level-ready', level: 2 })
    expect(messages[1]).toEqual({ type: 'level-result', level: 2, status: 'passed' })
    expect(display).toBe('tail\n')
  })

  it('逐字节到达的协议行（极端半包）', () => {
    const parser = new SerialProtocolParser()
    const line = `${M}{"type":"hint-request","level":4}\n`
    let messages: unknown[] = []
    for (const ch of line) {
      const result = parser.feed(ch)
      messages = messages.concat(result.messages)
    }
    expect(messages).toEqual([{ type: 'hint-request', level: 4 }])
  })

  it('非法 JSON 静默忽略，不会抛错', () => {
    const parser = new SerialProtocolParser()
    expect(() => {
      const { display, messages } = parser.feed(`${M}{not valid json!!!\nnext line\n`)
      expect(messages).toEqual([])
      expect(display).toBe('next line\n')
    }).not.toThrow()
  })

  it('JSON 合法但缺少 type 字段时不产出消息', () => {
    const parser = new SerialProtocolParser()
    const { messages } = parser.feed(`${M}{"foo":1}\n`)
    expect(messages).toEqual([])
  })

  it('协议标记不在行首时按普通文本处理', () => {
    const parser = new SerialProtocolParser()
    const { display, messages } = parser.feed(`echo ${M}{"type":"ready"}\n`)
    expect(messages).toEqual([])
    expect(display).toBe(`echo ${M}{"type":"ready"}\n`)
  })

  it('flush 冲刷残留的半行文本', () => {
    const parser = new SerialProtocolParser()
    parser.feed('partial text without newline')
    // 半行若非协议前缀会被立即透传，这里送一个协议前缀开头但没有换行的内容
    parser.feed('')
    const { display } = parser.flush()
    expect(display).toBe('')
    const parser2 = new SerialProtocolParser()
    const r = parser2.feed(`${M}{"type":"ready"}`)
    expect(r.messages).toEqual([])
    const flushed = parser2.flush()
    expect(flushed.messages).toEqual([{ type: 'ready' }])
  })

  it('超长无换行数据不会撑爆缓冲区', () => {
    const parser = new SerialProtocolParser()
    const big = `${M}${'x'.repeat(10000)}`
    const { display } = parser.feed(big)
    // 超过上限后按普通文本释放，避免内存无限增长
    expect(display.length).toBeGreaterThan(0)
  })
})
