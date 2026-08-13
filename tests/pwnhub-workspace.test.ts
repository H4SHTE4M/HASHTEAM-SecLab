// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
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
  gotoLab: vi.fn(),
  temporarilyUnlockLab: vi.fn(),
  resetCurrentLevel: vi.fn(),
  runCommand: vi.fn(),
}))

vi.mock('../src/composables/useVirtualMachine', () => ({
  useVirtualMachine: () => vmMock,
}))

vi.mock('../src/components/PwnHubLabTerminal.vue', () => ({
  default: {
    template: '<div class="lab-terminal" />',
    methods: { write: vi.fn(), focus: vi.fn() },
  },
}))

import { useLabPreferences } from '../src/composables/useLabPreferences'
import { useLabProgress } from '../src/composables/useLabProgress'
import PwnHubWorkspace from '../src/views/PwnHubWorkspace.vue'

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

describe('PwnHub workspace integration', () => {
  it('从独立首关启动统一 VM，并在卸载时立即销毁', async () => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/labs/pwnhub', component: { template: '<div />' } },
      ],
    })
    await testRouter.push('/labs/pwnhub')
    await testRouter.isReady()

    const wrapper = mount(PwnHubWorkspace, { global: { plugins: [testRouter] } })
    await nextTick()
    expect(vmMock.setModule).toHaveBeenCalledWith('pwnhub')
    expect(useLabProgress().state.currentLabId).toBe('memory-addresses-01')
    expect(vmMock.boot).toHaveBeenCalledOnce()
    expect(wrapper.findAll('[data-lab-id]')).toHaveLength(3)

    await wrapper.get('button[aria-label="返回 Lab 选择器"]').trigger('click')
    await flushPromises()
    expect(testRouter.currentRoute.value.path).toBe('/')

    wrapper.unmount()
    expect(vmMock.dispose).toHaveBeenCalledOnce()
  })
})
