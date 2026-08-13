// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BinaryWorkbench from '../src/components/BinaryWorkbench.vue'
import ByteView from '../src/components/ByteView.vue'
import PayloadWorkbench from '../src/components/PayloadWorkbench.vue'
import StepRenderer from '../src/components/StepRenderer.vue'
import { buildPayloadWriteCommand, composePayload } from '../src/services/payload'
import type { PayloadWorkbenchPreset } from '../src/types/binary'

const preset: PayloadWorkbenchPreset = {
  outputPath: 'payload.bin',
  maxBytes: 256,
  segments: [
    { id: 'padding', label: 'padding', kind: 'padding', byte: 0x41, length: 4 },
    { id: 'target', label: 'target', kind: 'p32', value: '0x12345678' },
  ],
}

describe('binary learning workbench', () => {
  it('只启用有真实快照数据的观察标签', async () => {
    const wrapper = mount(BinaryWorkbench, {
      props: {
        snapshot: {
          bytes: { baseAddress: 0x8048000, bytes: [0x41, 0x00, 0x42, 0x43], endian: 'little' },
          registers: {
            instruction: 'mov eax, 1',
            registers: [{ name: 'eax', before: 0, after: 1 }],
          },
        },
        initialTab: 'bytes',
      },
    })

    expect(wrapper.get('#binary-tab-bytes').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('#binary-tab-stack').attributes('disabled')).toBeDefined()
    await wrapper.get('#binary-tab-registers').trigger('click')
    expect(wrapper.text()).toContain('0x00000001')
    expect(wrapper.find('tr.changed').exists()).toBe(true)
  })

  it('用明确的前后位显示 flags 变化', () => {
    const wrapper = mount(BinaryWorkbench, {
      props: {
        snapshot: {
          registers: {
            instruction: 'add eax, 0x00000002',
            registers: [{ name: 'eax', before: 0xfffffffe, after: 0 }],
            flagsBefore: ['SF'],
            flagsAfter: ['CF', 'ZF'],
          },
        },
        initialTab: 'registers',
      },
    })

    expect(wrapper.get('[aria-label="SF：1 变为 0"]').text()).toContain('1 → 0')
    expect(wrapper.get('[aria-label="CF：0 变为 1"]').text()).toContain('0 → 1')
    expect(wrapper.get('[aria-label="ZF：0 变为 1"]').text()).toContain('0 → 1')
  })

  it('用内存表格展示地址、变量、值与指针关系', () => {
    const wrapper = mount(BinaryWorkbench, {
      props: {
        initialTab: 'memory',
        snapshot: {
          memory: {
            endian: 'little',
            cells: [
              { address: 0x0804b13c, name: 'cell', value: 0xdec0de42, kind: 'value', meaning: '目标值' },
              { address: 0x0804b140, name: 'signed_cell', value: 0xffffffd6, kind: 'signed', meaning: '独立变量' },
              {
                address: 0x0804b144,
                name: 'cell_pointer',
                value: 0x0804b13c,
                kind: 'pointer',
                meaning: '指向 cell',
                targetAddress: 0x0804b13c,
                targetName: 'cell',
              },
            ],
          },
        },
      },
    })

    expect(wrapper.get('#binary-tab-memory').attributes('aria-selected')).toBe('true')
    expect(wrapper.findAll('.memory-table tbody tr')).toHaveLength(3)
    expect(wrapper.text()).toContain('0x0804b13c')
    expect(wrapper.text()).toContain('cell_pointer')
    expect(wrapper.text()).toContain('→')
    expect(wrapper.text()).toContain('解引用值 0xdec0de42')
    expect(wrapper.text()).toContain('位模式 0xffffffd6')
  })

  it('1B、2B、4B 会改变真实选中长度和值', async () => {
    const wrapper = mount(ByteView, {
      props: {
        snapshot: {
          baseAddress: 0x0804b13c,
          bytes: [0x42, 0xde, 0xc0, 0xde],
          endian: 'little',
          selectedOffset: 0,
          selectedLength: 4,
        },
      },
    })

    expect(wrapper.findAll('.hex-cells button.selected')).toHaveLength(4)
    await wrapper.get('.byte-group button:nth-child(1)').trigger('click')
    expect(wrapper.findAll('.hex-cells button.selected')).toHaveLength(1)
    expect(wrapper.text()).toContain('0x42')
    await wrapper.get('.byte-group button:nth-child(2)').trigger('click')
    expect(wrapper.findAll('.hex-cells button.selected')).toHaveLength(2)
    expect(wrapper.text()).toContain('0xde42')
  })

  it('汇编单步 TUI 支持前进、后退、重置、退出和重新进入', async () => {
    const wrapper = mount(BinaryWorkbench, {
      props: {
        initialTab: 'registers',
        snapshot: {
          registers: {
            instruction: 'mov eax, 1',
            registers: [{ name: 'eax', before: 0, after: 1 }],
            flagsBefore: [],
            flagsAfter: [],
          },
          assemblyTui: {
            title: 'mov 单步',
            states: [
              {
                id: 'before',
                title: '执行前',
                instruction: 'mov eax, 1',
                explanation: '记录执行前状态。',
                registers: {
                  instruction: 'mov eax, 1',
                  registers: [{ name: 'eax', before: 0, after: 0 }],
                  flagsBefore: [],
                  flagsAfter: [],
                },
              },
              {
                id: 'after',
                title: '执行后',
                instruction: 'mov eax, 1',
                explanation: '核对执行后状态。',
                registers: {
                  instruction: 'mov eax, 1',
                  registers: [{ name: 'eax', before: 0, after: 1 }],
                  flagsBefore: [],
                  flagsAfter: [],
                },
              },
            ],
          },
        },
      },
    })

    const tui = wrapper.get('.assembly-tui')
    expect(tui.text()).toContain('1 / 2')
    await tui.get('button[title="下一步"]').trigger('click')
    expect(tui.text()).toContain('2 / 2')
    await tui.get('button[title="上一步"]').trigger('click')
    expect(tui.text()).toContain('1 / 2')
    await tui.get('button[title="退出调试视图"]').trigger('click')
    expect(tui.text()).toContain('已退出')
    await tui.get('button[title="重新进入"]' ).trigger('click')
    expect(tui.text()).toContain('1 / 2')
    await tui.get('button[title="下一步"]').trigger('click')
    await tui.get('button[title="重置"]').trigger('click')
    expect(tui.text()).toContain('1 / 2')
  })

  it('栈视图以地址、变量、值和作用表格呈现 call/ret 帧', () => {
    const wrapper = mount(BinaryWorkbench, {
      props: {
        initialTab: 'stack',
        snapshot: {
          stack: {
            entries: [
              { address: 0x0804c240, value: 0x2b, label: 'EBP-4 · local_value', kind: 'local' },
              { address: 0x0804c248, value: 0x08049081, label: 'EBP+4 · return to caller', kind: 'return-address' },
            ],
          },
        },
      },
    })

    expect(wrapper.findAll('.stack-table thead th').map((cell) => cell.text())).toEqual([
      '地址', '变量名 / 位置', '变量值', '作用',
    ])
    expect(wrapper.text()).toContain('0x08049081')
    expect(wrapper.text()).toContain('返回地址')
  })

  it('PayloadWorkbench 将确定性文件写入命令交给调用方', async () => {
    const wrapper = mount(PayloadWorkbench, { props: { preset } })
    expect(wrapper.text()).toContain('8 / 256 B')
    expect(wrapper.findAll('.payload-map span')).toHaveLength(2)

    await wrapper.get('.payload-output button').trigger('click')
    const bytes = composePayload(preset.segments, preset.maxBytes).bytes
    expect(wrapper.emitted('write-command')?.[0]).toEqual([
      buildPayloadWriteCommand(bytes, preset.outputPath),
    ])
  })

  it('StepRenderer 为 payload-builder 分发工作台并透传写入命令', async () => {
    const wrapper = mount(StepRenderer, {
      props: {
        step: {
          id: 1,
          type: 'payload-builder',
          title: '组装输入',
          objective: '得到确定性字节文件',
          instruction: '按栈布局组合分段。',
          completion: 'confirm',
          allowRun: false,
          evidence: 'payload-replay',
          payload: preset,
        },
        stepIndex: 0,
        totalSteps: 1,
        completedStepIds: [],
      },
    })

    expect(wrapper.find('.binary-workbench').exists()).toBe(true)
    await wrapper.get('.payload-output button').trigger('click')
    expect(wrapper.emitted('write-command')).toHaveLength(1)
  })
})
