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

  it('已知消息类型字段缺失或类型错误时拒绝消息', () => {
    const parser = new SerialProtocolParser()
    const invalid = [
      `${M}{"type":"level-ready"}\n`,
      `${M}{"type":"level-result","level":"1","status":"passed"}\n`,
      `${M}{"type":"level-result","level":1,"status":"unknown"}\n`,
      `${M}{"type":"hint-request","level":0}\n`,
      `${M}{"type":"progress","level":1,"value":"half"}\n`,
      `${M}{"type":"error","message":""}\n`,
      `${M}{"type":"unknown","level":1}\n`,
    ].join('')

    expect(parser.feed(invalid).messages).toEqual([])
  })

  it('逐类校验并保留合法协议字段', () => {
    const parser = new SerialProtocolParser()
    const input = [
      `${M}{"type":"ready","version":1,"ignored":true}\n`,
      `${M}{"type":"progress","level":2,"value":0.5}\n`,
      `${M}{"type":"error","message":"检查失败"}\n`,
    ].join('')

    expect(parser.feed(input).messages).toEqual([
      { type: 'ready', version: 1 },
      { type: 'progress', level: 2, value: 0.5 },
      { type: 'error', message: '检查失败' },
    ])
  })

  it('解析稳定实验的就绪、判题和提示消息', () => {
    const parser = new SerialProtocolParser()
    const input = [
      `${M}{"type":"lab-ready","labId":"memory-addresses-01"}\n`,
      `${M}{"type":"lab-result","labId":"memory-addresses-01","status":"passed"}\n`,
      `${M}{"type":"hint-request","labId":"memory-addresses-01"}\n`,
    ].join('')
    expect(parser.feed(input).messages).toEqual([
      { type: 'lab-ready', labId: 'memory-addresses-01' },
      { type: 'lab-result', labId: 'memory-addresses-01', status: 'passed' },
      { type: 'hint-request', labId: 'memory-addresses-01' },
    ])
  })

  it('解析 debugger 状态并拒绝不规范的 EIP', () => {
    const parser = new SerialProtocolParser()
    const input = [
      `${M}{"type":"debugger-state","state":"ready"}\n`,
      `${M}{"type":"debugger-state","state":"stopped","eip":"0x08049020"}\n`,
      `${M}{"type":"debugger-state","state":"stopped","eip":"8049020"}\n`,
      `${M}{"type":"debugger-state","state":"unknown"}\n`,
    ].join('')
    expect(parser.feed(input).messages).toEqual([
      { type: 'debugger-state', state: 'ready' },
      { type: 'debugger-state', state: 'stopped', eip: '0x08049020' },
    ])
  })

  it('拒绝可穿越路径或同时带数字与稳定身份的实验消息', () => {
    const parser = new SerialProtocolParser()
    const invalid = [
      `${M}{"type":"lab-ready","labId":"../memory"}\n`,
      `${M}{"type":"lab-result","labId":"Memory","status":"passed"}\n`,
      `${M}{"type":"hint-request","level":1,"labId":"memory-addresses-01"}\n`,
    ].join('')
    expect(parser.feed(invalid).messages).toEqual([])
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

describe('SerialProtocolParser 验签字段', () => {
  const key = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc='
  const sig = 'a'.repeat(64)

  it('ready 携带合法 base64 会话密钥时保留该字段', () => {
    const parser = new SerialProtocolParser()
    const { messages } = parser.feed(`${M}{"type":"ready","version":2,"key":"${key}"}\n`)
    expect(messages).toEqual([{ type: 'ready', version: 2, key }])
  })

  it('ready 的密钥形态非法时整条消息被拒绝', () => {
    const parser = new SerialProtocolParser()
    const invalid = [
      `${M}{"type":"ready","key":"short"}\n`,
      `${M}{"type":"ready","key":"!!!!!!!!!!!!!!!=="}\n`,
      `${M}{"type":"ready","key":42}\n`,
    ].join('')
    expect(parser.feed(invalid).messages).toEqual([])
  })

  it('数字关卡和稳定实验消息都保留合法的 64 位小写十六进制签名', () => {
    const parser = new SerialProtocolParser()
    const input = [
      `${M}{"type":"level-result","level":1,"status":"passed","sig":"${sig}"}\n`,
      `${M}{"type":"level-ready","level":2,"sig":"${sig}"}\n`,
      `${M}{"type":"lab-result","labId":"memory-addresses-01","status":"passed","sig":"${sig}"}\n`,
      `${M}{"type":"lab-ready","labId":"memory-addresses-01","sig":"${sig}"}\n`,
    ].join('')
    expect(parser.feed(input).messages).toEqual([
      { type: 'level-result', level: 1, status: 'passed', sig },
      { type: 'level-ready', level: 2, sig },
      { type: 'lab-result', labId: 'memory-addresses-01', status: 'passed', sig },
      { type: 'lab-ready', labId: 'memory-addresses-01', sig },
    ])
  })

  it('签名形态非法（长度/大写/非字符串）时整条消息被拒绝', () => {
    const parser = new SerialProtocolParser()
    const invalid = [
      `${M}{"type":"level-result","level":1,"status":"passed","sig":"${'a'.repeat(63)}"}\n`,
      `${M}{"type":"level-result","level":1,"status":"passed","sig":"${'A'.repeat(64)}"}\n`,
      `${M}{"type":"level-result","level":1,"status":"passed","sig":123}\n`,
      `${M}{"type":"level-ready","level":1,"sig":"xyz"}\n`,
    ].join('')
    expect(parser.feed(invalid).messages).toEqual([])
  })
})

describe('SerialProtocolParser telemetry-command', () => {
  it('解析合法的 telemetry-command 消息', () => {
    const parser = new SerialProtocolParser()
    const { messages, display } = parser.feed(
      `${M}{"type":"telemetry-command","command":"find"}\n`,
    )
    expect(messages).toEqual([{ type: 'telemetry-command', command: 'find' }])
    expect(display).toBe('')
  })

  it('telemetry-command 不在终端显示', () => {
    const parser = new SerialProtocolParser()
    const { display } = parser.feed(
      `${M}{"type":"telemetry-command","command":"grep"}\n`,
    )
    expect(display).toBe('')
  })

  it('command 字段缺失或非字符串时拒绝消息', () => {
    const parser = new SerialProtocolParser()
    const invalid = [
      `${M}{"type":"telemetry-command"}\n`,
      `${M}{"type":"telemetry-command","command":""}\n`,
      `${M}{"type":"telemetry-command","command":42}\n`,
      `${M}{"type":"telemetry-command","command":null}\n`,
    ].join('')
    expect(parser.feed(invalid).messages).toEqual([])
  })

  it('telemetry-command 与普通输出混排时各自正确处理', () => {
    const parser = new SerialProtocolParser()
    const input = [
      '$ find .\n',
      `${M}{"type":"telemetry-command","command":"find"}\n`,
      './README\n',
    ].join('')
    const { messages, display } = parser.feed(input)
    expect(messages).toEqual([{ type: 'telemetry-command', command: 'find' }])
    expect(display).toBe('$ find .\n./README\n')
  })

  it('无换行命令输出与 telemetry-command 粘连时保留输出并过滤协议', () => {
    const parser = new SerialProtocolParser()
    const { messages, display } = parser.feed(
      `preserved${M}{"type":"telemetry-command","command":"cat"}\n`,
    )
    expect(messages).toEqual([{ type: 'telemetry-command', command: 'cat' }])
    expect(display).toBe('preserved')
  })
})
