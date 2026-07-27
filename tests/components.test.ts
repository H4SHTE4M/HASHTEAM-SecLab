// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import AboutModal from '../src/components/AboutModal.vue'
import LoadingScreen from '../src/components/LoadingScreen.vue'
import TopBar from '../src/components/TopBar.vue'

describe('accessible components', () => {
  it('关于弹窗接管焦点、支持 Escape，并在卸载时恢复焦点', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const wrapper = mount(AboutModal, { attachTo: document.body })
    await nextTick()

    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(wrapper.get('.btn-close').element)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('close')).toHaveLength(1)

    wrapper.unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('加载状态可被读屏感知，日志按钮公开展开状态', async () => {
    const wrapper = mount(LoadingScreen, {
      props: { stage: 'loading-assets', errorMessage: null },
    })

    expect(wrapper.get('.loading-overlay').attributes('role')).toBe('status')
    const toggle = wrapper.get('.log-toggle')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#boot-log-list').element).toBeInstanceOf(HTMLElement)

    await wrapper.setProps({ stage: 'error', errorMessage: 'failed' })
    expect(wrapper.get('.loading-overlay').attributes('role')).toBe('alert')
  })

  it('重新开始按钮需要二次点击才发送事件', async () => {
    const wrapper = mount(TopBar, {
      props: { completedCount: 2, total: 6 },
    })
    const restart = wrapper.findAll('button')[1]

    await restart.trigger('click')
    expect(wrapper.emitted('reset-all')).toBeUndefined()
    expect(restart.text()).toContain('确认')

    await restart.trigger('click')
    expect(wrapper.emitted('reset-all')).toHaveLength(1)
  })
})
