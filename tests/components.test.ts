// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import AboutModal from '../src/components/AboutModal.vue'
import LevelCompleteDialog from '../src/components/LevelCompleteDialog.vue'
import LoadingScreen from '../src/components/LoadingScreen.vue'
import MissionPanel from '../src/components/MissionPanel.vue'
import OnboardingDialog from '../src/components/OnboardingDialog.vue'
import TopBar from '../src/components/TopBar.vue'
import type { LevelDef } from '../src/types/lab'

const level: LevelDef = {
  id: 1,
  name: '测试关卡',
  tagline: '测试副标题',
  story: '这是任务背景。',
  goals: ['完成第一步', '完成第二步'],
  suggestedCommands: ['whoami', 'kill <PID>'],
  guide: [
    { command: 'whoami', note: '观察当前用户' },
    { command: 'kill <PID>', note: '替换 PID 后结束进程' },
  ],
  concepts: [{ term: '最小权限', explanation: '只给必要的权限' }],
  takeaway: '你完成了一次真实检查。',
  hints: ['第一条提示', '第二条提示'],
  teaches: ['Shell'],
  checkUsage: 'check <答案>',
}

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
      props: { completedCount: 2, total: 10, mode: 'guided' },
    })
    const restart = wrapper.findAll('button').find((button) => button.text() === '重新开始')
    expect(restart).toBeDefined()

    await restart!.trigger('click')
    expect(wrapper.emitted('reset-all')).toBeUndefined()
    expect(restart!.text()).toContain('确认')

    await restart!.trigger('click')
    expect(wrapper.emitted('reset-all')).toHaveLength(1)
  })

  it('首次教学先强制选择模式，再允许运行演示和完成', async () => {
    const wrapper = mount(OnboardingDialog, {
      props: { mode: null, progressResetNotice: true },
      attachTo: document.body,
    })

    expect(wrapper.text()).toContain('你希望怎样完成新手村')
    expect(wrapper.text()).toContain('旧版进度已重置')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('complete')).toBeUndefined()

    await wrapper.get('.mode-card-recommended').trigger('click')
    expect(wrapper.emitted('select-mode')?.[0]).toEqual(['guided'])
    expect(wrapper.text()).toContain('左边操作，右边看任务')

    await wrapper.get('.btn-primary').trigger('click')
    expect(wrapper.get<HTMLButtonElement>('.btn-primary').element.disabled).toBe(true)
    await wrapper.get('.demo-command').trigger('click')
    expect(wrapper.emitted('run-demo')).toHaveLength(1)
    expect(wrapper.get<HTMLButtonElement>('.btn-primary').element.disabled).toBe(false)
    await wrapper.get('.btn-skip').trigger('click')
    expect(wrapper.emitted('complete')).toHaveLength(1)
    wrapper.unmount()
  })

  it('引导模式只展示当前步骤，推进后保留历史', async () => {
    const wrapper = mount(MissionPanel, {
      props: {
        level,
        completed: false,
        hintsUsed: 0,
        isLast: false,
        mode: 'guided',
        guideStep: 0,
      },
    })

    expect(wrapper.get('.current-action').text()).toContain('whoami')
    expect(wrapper.find('.command-template').exists()).toBe(false)
    expect(wrapper.find('.history-details').exists()).toBe(false)

    await wrapper.get('.command-run').trigger('click')
    expect(wrapper.emitted('run-command')?.[0]).toEqual(['whoami'])
    expect(wrapper.emitted('advance-guide')).toBeUndefined()

    await wrapper.get('.btn-advance').trigger('click')
    expect(wrapper.emitted('advance-guide')?.[0]).toEqual([1, 2])

    await wrapper.setProps({ guideStep: 1 })
    expect(wrapper.get('.command-template').text()).toContain('kill <PID>')
    expect(wrapper.find('.command-run').exists()).toBe(false)
    expect(wrapper.get('.history-details').text()).toContain('已查看步骤（1）')
  })

  it('挑战模式隐藏 guide，命令备忘是静态文本', async () => {
    const wrapper = mount(MissionPanel, {
      props: {
        level,
        completed: false,
        hintsUsed: 0,
        isLast: false,
        mode: 'challenge',
        guideStep: 0,
      },
    })

    expect(wrapper.find('.current-action').exists()).toBe(false)
    expect(wrapper.get('.commands-details').text()).toContain('kill <PID>')
    expect(wrapper.find('.command-run').exists()).toBe(false)
    expect(wrapper.emitted('run-command')).toBeUndefined()

    await wrapper.get('.btn-switch').trigger('click')
    expect(wrapper.emitted('change-mode')?.[0]).toEqual(['guided'])
  })

  it('首次验证通过立即弹出下一关入口，关闭后顶部按钮仍清晰可见', async () => {
    const wrapper = mount(MissionPanel, {
      props: {
        level,
        completed: false,
        hintsUsed: 0,
        isLast: false,
        mode: 'guided',
        guideStep: 0,
      },
      attachTo: document.body,
    })

    expect(wrapper.text()).not.toContain('你完成了一次真实检查')
    expect(wrapper.text()).not.toContain('最小权限')

    await wrapper.setProps({ completed: true })
    expect(wrapper.text()).toContain('你完成了一次真实检查')
    expect(wrapper.text()).toContain('最小权限')
    expect(wrapper.find('.current-action').exists()).toBe(false)
    expect(wrapper.get('.next-level-callout').text()).toContain('第 2 关已经解锁')
    expect(wrapper.get('.next-level-callout .btn-next').text()).toContain('立即进入第 2 关')

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')
    const dialogNext = document.body.querySelector<HTMLButtonElement>('.btn-dialog-next')
    const dialogReview = document.body.querySelector<HTMLButtonElement>('.btn-dialog-review')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialogNext?.textContent).toContain('立即进入第 2 关')
    await nextTick()
    expect(document.activeElement).toBe(dialogNext)

    dialogReview?.click()
    await nextTick()
    expect(wrapper.findComponent(LevelCompleteDialog).exists()).toBe(false)
    expect(wrapper.get('.next-level-callout .btn-next').isVisible()).toBe(true)

    await wrapper.get('.next-level-callout .btn-next').trigger('click')
    expect(wrapper.emitted('next')).toHaveLength(1)
    wrapper.unmount()
  })

  it('已完成关卡重新打开时不重复弹窗，最后一关按钮指向总总结', () => {
    const wrapper = mount(MissionPanel, {
      props: {
        level: { ...level, id: 10 },
        completed: true,
        hintsUsed: 0,
        isLast: true,
        mode: 'guided',
        guideStep: 0,
      },
    })

    expect(wrapper.findComponent(LevelCompleteDialog).exists()).toBe(false)
    expect(wrapper.get('.next-level-callout .btn-next').text()).toContain('查看通关总结')
  })
})
