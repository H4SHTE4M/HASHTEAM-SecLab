// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const vmMock = vi.hoisted(() => ({
  stage: { value: 'idle' },
  errorMessage: { value: null },
  boot: vi.fn(async () => undefined),
  dispose: vi.fn(async () => undefined),
  restart: vi.fn(async () => undefined),
  onDisplay: vi.fn(() => () => undefined),
  sendSerial: vi.fn(),
  setModule: vi.fn(),
  gotoLevel: vi.fn(),
  resetCurrentLevel: vi.fn(),
  runCommand: vi.fn(),
}))

vi.mock('../src/composables/useVirtualMachine', () => ({
  useVirtualMachine: () => vmMock,
}))

vi.mock('../src/components/LabTerminal.vue', () => ({
  default: {
    template: '<div class="lab-terminal" />',
    methods: {
      write: vi.fn(),
      focus: vi.fn(),
    },
  },
}))

import App from '../src/views/SecLabWorkspace.vue'
import { useLabPreferences } from '../src/composables/useLabPreferences'
import { useLabProgress } from '../src/composables/useLabProgress'
import { TOTAL_LEVELS } from '../src/data/levels'
import { createCustomAccent } from '../src/services/accent-color'
import { useAnomalyCenter } from '../src/services/anomaly-center'

beforeEach(() => {
  window.localStorage.clear()
  useLabProgress().resetAll()
  // 清空异常中枢：resolve 幂等，未 dismiss 的 key 删除记录也无副作用
  const center = useAnomalyCenter()
  ;[...center.detected.value].forEach((anomaly) => center.resolve(anomaly))
  center.resolve({ kind: 'missing-session-key', keyPresent: false })
  center.resolve({ kind: 'missing-session-key', keyPresent: true })
  center.resolve({ kind: 'crypto-unavailable', isSecureContext: true })
  center.resolve({ kind: 'crypto-unavailable', isSecureContext: false })
  const preferences = useLabPreferences()
  preferences.state.mode = 'guided'
  preferences.state.onboardingComplete = true
  preferences.state.accent = 'forest'
  preferences.state.customAccent = createCustomAccent('#357a50')!
  vmMock.stage.value = 'idle'
  vmMock.errorMessage.value = null
  vi.clearAllMocks()
})

describe('application release flows', () => {
  it('已完成用户直接进入总结页，不启动 VM 或显示无关顶部控制', async () => {
    const progress = useLabProgress()
    for (let level = 1; level <= TOTAL_LEVELS; level += 1) {
      progress.complete(level, { path: 'guided', hintsUsed: 0 })
    }

    const wrapper = mount(App)
    await nextTick()

    expect(wrapper.find('.completion-page').exists()).toBe(true)
    expect(wrapper.find('.topbar').exists()).toBe(false)
    expect(wrapper.find('.loading-overlay').exists()).toBe(false)
    expect(vmMock.boot).not.toHaveBeenCalled()
    expect(vmMock.onDisplay).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('帮助和关于入口互斥，程序化切换也不会产生两个 aria-modal', async () => {
    vi.useFakeTimers()
    vmMock.stage.value = 'ready'
    const wrapper = mount(App, { attachTo: document.body })
    await nextTick()
    await vi.advanceTimersByTimeAsync(1_000)
    await nextTick()

    await wrapper.get('button[aria-label="关于实验室"]').trigger('click')
    expect(wrapper.findAll('[aria-modal="true"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('关于 HASHTEAM 安全实验室')

    const help = wrapper.findAll('.actions button').find((button) => button.text() === '操作帮助')
    expect(help).toBeDefined()
    await help!.trigger('click')
    await nextTick()

    expect(wrapper.findAll('[aria-modal="true"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('开始前操作教学')
    expect(wrapper.text()).not.toContain('关于 HASHTEAM 安全实验室')

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('新会话恢复旧进度时显示一次性的欢迎回来提示，首次访问不显示', async () => {
    vi.useFakeTimers()
    vmMock.stage.value = 'ready'
    const firstVisit = mount(App, { attachTo: document.body })
    await nextTick()
    await vi.advanceTimersByTimeAsync(1_000)
    await nextTick()
    expect(firstVisit.text()).not.toContain('欢迎回来')
    firstVisit.unmount()

    const progress = useLabProgress()
    progress.complete(1, { path: 'guided', hintsUsed: 0 })
    progress.setLevel(2)
    const resumed = mount(App, { attachTo: document.body })
    await nextTick()
    await vi.advanceTimersByTimeAsync(1_000)
    await nextTick()

    expect(resumed.text()).toContain('欢迎回来，你上次进行到第 2 关')
    await resumed.get('.welcome-back button').trigger('click')
    expect(resumed.find('.welcome-back').exists()).toBe(false)
    resumed.unmount()
    vi.useRealTimers()
  })

  it('关闭帮助和关于弹窗后把焦点还给对应入口', async () => {
    vi.useFakeTimers()
    vmMock.stage.value = 'ready'
    const wrapper = mount(App, { attachTo: document.body })
    await nextTick()
    await vi.advanceTimersByTimeAsync(1_000)
    await nextTick()

    const about = wrapper.get<HTMLButtonElement>('button[aria-label="关于实验室"]')
    await about.trigger('click')
    await nextTick()
    await wrapper.get<HTMLButtonElement>('.btn-close').trigger('click')
    await nextTick()
    expect(document.activeElement).toBe(about.element)

    const help = wrapper.get<HTMLButtonElement>('button[aria-label="操作帮助"]')
    await help.trigger('click')
    await nextTick()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(document.activeElement).toBe(help.element)

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('模式切换保留本关状态，打开引导会持久化混合完成资格', async () => {
    const progress = useLabProgress()
    const preferences = useLabPreferences()
    preferences.state.mode = 'challenge'
    progress.useHint(1)
    progress.completeStep(1, 1)

    const wrapper = mount(App)
    await nextTick()
    expect(progress.hasGuidedAssistance(1)).toBe(false)

    await wrapper.get('button[aria-label="引导模式"]').trigger('click')
    await nextTick()
    expect(preferences.state.mode).toBe('guided')
    expect(progress.state.hintsUsed[1]).toBe(1)
    expect(progress.completedStepsFor(1)).toEqual([1])
    expect(progress.hasGuidedAssistance(1)).toBe(true)
    expect(vmMock.resetCurrentLevel).not.toHaveBeenCalled()

    await wrapper.get('button[aria-label="挑战模式"]').trigger('click')
    expect(preferences.state.mode).toBe('challenge')
    expect(progress.hasGuidedAssistance(1)).toBe(true)

    wrapper.unmount()
  })

  it('切换主题色后即时应用到根节点并持久化', async () => {
    const wrapper = mount(App)
    await nextTick()

    await wrapper.get('button[aria-label="界面配色"]').trigger('click')
    const rose = wrapper.findAll('.palette-option').find((button) => button.text().includes('莓红'))
    expect(rose).toBeDefined()
    await rose!.trigger('click')

    expect(document.documentElement.dataset.accent).toBe('rose')
    expect(useLabPreferences().state.accent).toBe('rose')
    expect(JSON.parse(window.localStorage.getItem('hashteam-lab-ui-v1') ?? '{}').accent).toBe(
      'rose',
    )
    wrapper.unmount()
  })

  it('填色盘自选颜色后校正明暗色值并持久化', async () => {
    const wrapper = mount(App)
    await nextTick()

    await wrapper.get('button[aria-label="界面配色"]').trigger('click')
    await wrapper.get<HTMLInputElement>('input[type="color"]').setValue('#f4d03f')
    const expected = createCustomAccent('#f4d03f')!

    expect(document.documentElement.dataset.accent).toBe('custom')
    expect(document.documentElement.style.getPropertyValue('--custom-accent-light')).toBe(
      expected.light,
    )
    expect(document.documentElement.style.getPropertyValue('--custom-accent-dark')).toBe(
      expected.dark,
    )
    expect(useLabPreferences().state.customAccent).toEqual(expected)
    expect(
      JSON.parse(window.localStorage.getItem('hashteam-lab-ui-v1') ?? '{}').customAccent,
    ).toEqual(expected)
    wrapper.unmount()
  })

  it('可点击收起任务栏并保留原来的面板宽度', async () => {
    const wrapper = mount(App)
    await nextTick()

    const toggle = wrapper.get<HTMLButtonElement>('.panel-collapse-toggle')
    const panel = wrapper.get('#mission-panel')
    const appContent = wrapper.get<HTMLElement>('.app-content')

    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(panel.attributes('aria-hidden')).toBeUndefined()
    expect(appContent.element.style.getPropertyValue('--workspace-panel-width')).not.toBe('0px')

    await toggle.trigger('click')

    expect(toggle.attributes('aria-label')).toBe('展开任务栏')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(panel.attributes('aria-hidden')).toBe('true')
    expect(panel.attributes()).toHaveProperty('inert')
    expect(appContent.element.style.getPropertyValue('--workspace-panel-width')).toBe('0px')
    expect(window.localStorage.getItem('hashteam-mission-panel-collapsed-v1')).toBe('true')

    await toggle.trigger('click')

    expect(toggle.attributes('aria-label')).toBe('收起任务栏')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(panel.attributes('aria-hidden')).toBeUndefined()
    expect(appContent.element.style.getPropertyValue('--workspace-panel-width')).not.toBe('0px')
    wrapper.unmount()
  })
})

describe('阻断异常弹窗', () => {
  function seedGuideSoftLock(): void {
    const progress = useLabProgress()
    // 篡改档位：guide 已揭示到索引 3，但本关没有任何完成证据 → A 类软锁
    progress.state.guideSteps[1] = 3
    delete progress.state.completedSteps[1]
  }

  async function triggerDetectionViaModeToggle(): Promise<void> {
    // useLabProgress 的检测 watch 只盯 currentLevel 与 mode，翻转一次触发重检
    const preferences = useLabPreferences()
    preferences.state.mode = 'challenge'
    await nextTick()
    preferences.state.mode = 'guided'
    await nextTick()
  }

  it('A 类软锁：重置本关同时清空引导进度与终端环境并关闭弹窗', async () => {
    seedGuideSoftLock()
    const wrapper = mount(App, { attachTo: document.body })
    await triggerDetectionViaModeToggle()

    const dialog = wrapper.find('.report-card')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('Wow，你挖出了一个稀有 Bug')
    expect(dialog.text()).toContain('缺失完成记录')

    await dialog.get('.btn-primary').trigger('click')
    await nextTick()
    const progress = useLabProgress()
    expect(progress.state.guideSteps[1]).toBe(0)
    expect(progress.completedStepsFor(1)).toEqual([])
    expect(vmMock.resetCurrentLevel).toHaveBeenCalledTimes(1)
    expect(useLabPreferences().state.mode).toBe('guided')
    expect(wrapper.find('.report-card').exists()).toBe(false)
    wrapper.unmount()
  })

  it('A 类软锁：次要出口切挑战模式后自动关闭', async () => {
    seedGuideSoftLock()
    const wrapper = mount(App, { attachTo: document.body })
    await triggerDetectionViaModeToggle()

    const dialog = wrapper.find('.report-card')
    expect(dialog.exists()).toBe(true)
    expect(dialog.get('.btn-secondary').text()).toContain('切到挑战模式')

    await dialog.get('.btn-secondary').trigger('click')
    await nextTick()
    expect(useLabPreferences().state.mode).toBe('challenge')
    expect(vmMock.resetCurrentLevel).not.toHaveBeenCalled()
    expect(wrapper.find('.report-card').exists()).toBe(false)
    wrapper.unmount()
  })

  it('E1 密钥异常：焦点落在主按钮上，点击后重启实验环境并关闭弹窗', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await nextTick()
    useAnomalyCenter().report({ kind: 'missing-session-key', keyPresent: false })
    await nextTick()
    await nextTick()

    const dialog = wrapper.find('.report-card')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('Wow，实验环境的裁判忘带哨子了')
    const primary = dialog.get<HTMLButtonElement>('.btn-primary')
    expect(document.activeElement).toBe(primary.element)

    await primary.trigger('click')
    await nextTick()
    expect(vmMock.restart).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.report-card').exists()).toBe(false)
    wrapper.unmount()
  })

  it('下载问题日志成功后按钮进入已下载状态', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    ;(URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:mock')
    ;(URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn()
    const wrapper = mount(App, { attachTo: document.body })
    useAnomalyCenter().report({ kind: 'missing-session-key', keyPresent: true })
    await nextTick()

    const download = wrapper.get<HTMLButtonElement>('.btn-download')
    expect(download.text()).toBe('下载现场日志（不用读，甩给开发者）')
    await download.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    expect(download.text()).toContain('已下载')
    expect(download.attributes('disabled')).toBeDefined()
    wrapper.unmount()
    vi.restoreAllMocks()
  })

  it('先自己看看：本会话不再弹同 key 异常', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await nextTick()
    const center = useAnomalyCenter()
    center.report({ kind: 'crypto-unavailable', isSecureContext: true })
    await nextTick()
    expect(wrapper.find('.report-card').exists()).toBe(true)

    await wrapper.get('.btn-dismiss').trigger('click')
    await nextTick()
    expect(wrapper.find('.report-card').exists()).toBe(false)

    center.report({ kind: 'crypto-unavailable', isSecureContext: true })
    await nextTick()
    expect(wrapper.find('.report-card').exists()).toBe(false)
    wrapper.unmount()
  })
})
