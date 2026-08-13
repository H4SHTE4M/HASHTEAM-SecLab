// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ExternalToolCompanion from '../src/components/ExternalToolCompanion.vue'
import {
  COMPANION_MESSAGE_PREFIX,
  buildCompanionVerificationCommand,
  createCompanionSync,
  loadCompanionDefinition,
  loadCompanionState,
  normalizeCompanionObservation,
  parseCompanionDefinition,
  saveCompanionDefinition,
} from '../src/services/companion'
import type { StorageLike } from '../src/services/progress-store'
import type { CompanionMessage, ExternalCompanionDefinition } from '../src/types/companion'

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
  removeItem(key: string): void { this.values.delete(key) }
}

class FakeStorageTarget {
  private listeners = new Set<(event: StorageEvent) => void>()
  addEventListener(_type: 'storage', listener: (event: StorageEvent) => void): void { this.listeners.add(listener) }
  removeEventListener(_type: 'storage', listener: (event: StorageEvent) => void): void { this.listeners.delete(listener) }
  dispatch(key: string, newValue: string): void {
    const event = { key, newValue } as StorageEvent
    this.listeners.forEach((listener) => listener(event))
  }
}

function definition(): ExternalCompanionDefinition {
  return {
    labId: 'rev-ida-xref-01',
    title: '定位输入校验函数',
    artifact: {
      name: 'validator.elf',
      downloadUrl: '/artifacts/validator.elf',
      architecture: 'i386',
      sha256: 'a'.repeat(64),
      purpose: '静态分析样本',
    },
    tools: [
      {
        tool: 'ida',
        label: 'IDA',
        versionNote: 'IDA Free 9.x 或兼容版本',
        installNote: '从 Hex-Rays 官方渠道安装并遵守许可。',
        steps: ['打开 ELF，定位 main。', '从字符串交叉引用进入验证函数。'],
      },
      {
        tool: 'ghidra',
        label: 'Ghidra',
        versionNote: 'Ghidra 11.x 或兼容版本',
        installNote: '从 NSA 官方发布页获取开源版本。',
        steps: ['导入 ELF 并自动分析。', '从 Defined Strings 跟随引用。'],
      },
      {
        tool: 'objdump',
        label: 'objdump',
        versionNote: 'GNU binutils 2.40+',
        installNote: '使用课程二进制 profile 内的只读工具。',
        steps: ['查看符号与反汇编。', '记录调用目标。'],
      },
    ],
    tasks: [
      { id: 'locate-main', title: '定位 main', description: '确认程序入口后的主函数。' },
      { id: 'follow-xref', title: '跟随字符串引用', description: '找到实际校验输入的函数。' },
    ],
    observations: [
      { id: 'entry-address', label: '验证函数地址', kind: 'address', placeholder: '0x08049000', required: true },
      { id: 'validator-name', label: '验证函数名', kind: 'function-name', placeholder: 'verify_input', required: true },
    ],
    verificationCommandTemplate: 'check {{entry-address}} {{validator-name}}',
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('BroadcastChannel', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('external tool companion', () => {
  it('解析同源样本、等价路线和完整验证字段', () => {
    const parsed = parseCompanionDefinition(definition())
    expect(parsed.tools.map((route) => route.tool)).toEqual(['ida', 'ghidra', 'objdump'])
    expect(parsed.artifact.sha256).toHaveLength(64)

    const unsafe = structuredClone(definition())
    unsafe.artifact.downloadUrl = 'https://example.com/sample'
    expect(() => parseCompanionDefinition(unsafe)).toThrow('同源安全相对路径')

    const missingField = structuredClone(definition())
    missingField.verificationCommandTemplate = 'check {{entry-address}}'
    expect(() => parseCompanionDefinition(missingField)).toThrow('所有必填观察字段')

    const injected = structuredClone(definition())
    injected.verificationCommandTemplate = 'check {{entry-address}} {{validator-name}}; echo nope'
    expect(() => parseCompanionDefinition(injected)).toThrow('只允许 check')
  })

  it('归一化类型化观察并对验证参数做 Shell 引用', () => {
    expect(normalizeCompanionObservation('address', ' 0X08049000 ')).toBe('0x8049000')
    expect(normalizeCompanionObservation('integer', '0x10')).toBe('16')
    expect(normalizeCompanionObservation('function-name', ' verify_input ')).toBe('verify_input')
    expect(() => normalizeCompanionObservation('function-name', 'verify input')).toThrow('函数名')

    expect(buildCompanionVerificationCommand(definition(), {
      'entry-address': '0X08049000',
      'validator-name': 'verify_input',
    })).toEqual({
      command: "check '0x8049000' 'verify_input'",
      values: { 'entry-address': '0x8049000', 'validator-name': 'verify_input' },
    })
  })

  it('持久化定义与进度，并在损坏存档时回到空会话', () => {
    const storage = new MemoryStorage()
    saveCompanionDefinition(definition(), storage)
    expect(loadCompanionDefinition(definition().labId, storage)?.title).toBe('定位输入校验函数')

    storage.setItem('pwnhub-companion-session-v1:rev-ida-xref-01', '{broken')
    expect(loadCompanionState(definition(), storage)).toMatchObject({
      completedTaskIds: [],
      observations: {},
      selectedTool: 'ida',
    })
  })

  it('通过 LocalStorage fallback 同步并按 messageId 去重', () => {
    const storage = new MemoryStorage()
    const senderTarget = new FakeStorageTarget()
    const receiverTarget = new FakeStorageTarget()
    const received: CompanionMessage[] = []
    const sender = createCompanionSync(definition().labId, () => undefined, {
      storage,
      channelFactory: null,
      eventTarget: senderTarget,
      now: () => 100,
    })
    const receiver = createCompanionSync(definition().labId, (message) => received.push(message), {
      storage,
      channelFactory: null,
      eventTarget: receiverTarget,
      now: () => 100,
    })

    sender.publish({
      type: 'observation',
      labId: definition().labId,
      field: 'entry-address',
      value: '0x8049000',
    })
    const key = `${COMPANION_MESSAGE_PREFIX}${definition().labId}`
    const message = storage.getItem(key)!
    receiverTarget.dispatch(key, message)
    receiverTarget.dispatch(key, message)
    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ type: 'observation', field: 'entry-address' })

    sender.dispose()
    receiver.dispose()
  })

  it('完成目标与必填观察后才向 VM 回传归一化命令', async () => {
    const wrapper = mount(ExternalToolCompanion, { props: { definition: definition() } })
    await wrapper.get('.observation-form').trigger('submit')
    expect(wrapper.text()).toContain('完成目标清单')
    expect(wrapper.emitted('submit')).toBeUndefined()

    for (const checkbox of wrapper.findAll('.target-list input')) await checkbox.setValue(true)
    const inputs = wrapper.findAll('.observation-form input')
    await inputs[0].setValue('0X08049000')
    await inputs[1].setValue('verify_input')
    await wrapper.get('.observation-form').trigger('submit')

    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      command: "check '0x8049000' 'verify_input'",
      values: { 'entry-address': '0x8049000', 'validator-name': 'verify_input' },
    })
    wrapper.unmount()
  })
})
