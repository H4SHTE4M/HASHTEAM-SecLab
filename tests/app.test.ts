// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const vmMock = vi.hoisted(() => ({
  stage: { value: 'idle' },
  errorMessage: { value: null },
  boot: vi.fn(async () => undefined),
  dispose: vi.fn(async () => undefined),
  onDisplay: vi.fn(() => () => undefined),
  sendSerial: vi.fn(),
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

import App from '../src/App.vue'
import { useLabPreferences } from '../src/composables/useLabPreferences'
import { useLabProgress } from '../src/composables/useLabProgress'
import { TOTAL_LEVELS } from '../src/data/levels'

beforeEach(() => {
  window.localStorage.clear()
  useLabProgress().resetAll()
  const preferences = useLabPreferences()
  preferences.state.mode = 'guided'
  preferences.state.onboardingComplete = true
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
})
