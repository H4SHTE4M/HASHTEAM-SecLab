// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DebuggerControls from '../src/components/DebuggerControls.vue'

describe('DebuggerControls', () => {
  it('把本关 checkpoint 和基础控制动作发送为真实 debugger 命令', async () => {
    const wrapper = mount(DebuggerControls, {
      props: { state: 'stopped', checkpoint: 'registers_checkpoint' },
    })

    expect(wrapper.get('.debugger-checkpoint').text()).toContain('registers_checkpoint')
    await wrapper.get('.debugger-checkpoint').trigger('click')
    await wrapper.get('button[title="step"]').trigger('click')
    await wrapper.get('button[title="quit"]').trigger('click')

    await wrapper.get('#debugger-register').setValue('ecx')
    await wrapper.get('input[aria-label="寄存器值"]').setValue('0x100c')
    await wrapper.findAll('form')[0].trigger('submit')

    await wrapper.get('#debugger-address').setValue('$esp')
    await wrapper.get('input[aria-label="读取长度"]').setValue('16')
    await wrapper.findAll('form')[1].trigger('submit')

    await wrapper.get('#debugger-location-action').setValue('break')
    await wrapper.get('input[aria-label="指令地址或符号"]').setValue('main')
    await wrapper.findAll('form')[2].trigger('submit')

    await wrapper.get('#debugger-memory-bytes').setValue('4142')
    await wrapper.findAll('form')[3].trigger('submit')

    expect(wrapper.emitted('command')).toEqual([
      ['until registers_checkpoint'],
      ['step'],
      ['quit'],
      ['setreg ecx 0x100c'],
      ['x $esp 16'],
      ['break main'],
      ['setmem $esp 4142'],
    ])
  })

  it('空闲或运行中只保留正确的生命周期动作，并跟随实验切换重置 checkpoint', async () => {
    const wrapper = mount(DebuggerControls, {
      props: { state: 'idle', checkpoint: 'first_checkpoint' },
    })

    expect(wrapper.get('.debugger-launch').text()).toContain('启动 debugger')
    expect(wrapper.get('.debugger-checkpoint').attributes('disabled')).toBeDefined()
    await wrapper.get('.debugger-launch').trigger('click')
    expect(wrapper.emitted('launch')).toHaveLength(1)

    await wrapper.setProps({ state: 'running', checkpoint: 'second_checkpoint' })
    expect(wrapper.get('.debugger-checkpoint').text()).toContain('second_checkpoint')
    expect(wrapper.get('button[title="step"]').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ state: 'stopped', checkpoint: 'third_checkpoint' })
    await wrapper.get('.debugger-checkpoint').trigger('click')
    expect(wrapper.emitted('command')?.at(-1)).toEqual(['until third_checkpoint'])
  })
})
