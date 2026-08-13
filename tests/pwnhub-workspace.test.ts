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
  handoff: vi.fn(),
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
import { useAnomalyCenter } from '../src/services/anomaly-center'
import type { BlockingAnomaly } from '../src/services/progress-anomaly'
import PwnHubWorkspace from '../src/views/PwnHubWorkspace.vue'
import CourseRail from '../src/components/CourseRail.vue'
import { COURSE, getCourseLab } from '../src/modules/pwnhub/course'

beforeEach(() => {
  window.localStorage.clear()
  useLabProgress().resetAll()
  const preferences = useLabPreferences()
  preferences.state.mode = 'guided'
  preferences.state.onboardingComplete = true
  vmMock.stage.value = 'idle'
  vmMock.errorMessage.value = null
  const anomalyCenter = useAnomalyCenter()
  ;[...anomalyCenter.detected.value].forEach((anomaly) => anomalyCenter.resolve(anomaly))
  anomalyCenter.resolve({
    kind: 'missing-session-key',
    module: 'pwnhub',
    keyPresent: false,
  })
  anomalyCenter.resolve({
    kind: 'missing-session-key',
    module: 'seclab',
    keyPresent: false,
  })
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
    expect(vmMock.handoff).toHaveBeenCalledOnce()
    expect(vmMock.handoff.mock.calls[0]?.[1]).toBe('pwnhub')
    expect(useLabProgress().state.currentLabId).toBe('memory-addresses-01')
    expect(vmMock.boot).toHaveBeenCalledOnce()
    expect(wrapper.findAll('[data-lab-id]')).toHaveLength(3)

    await wrapper.get('button[aria-label="回到主页"]').trigger('click')
    await flushPromises()
    expect(testRouter.currentRoute.value.path).toBe('/')

    wrapper.unmount()
    expect(vmMock.dispose).toHaveBeenCalledOnce()
  })

  it('只显示 PwnHub 异常，并可从密钥故障直接重启环境', async () => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/labs/pwnhub', component: { template: '<div />' } },
      ],
    })
    await testRouter.push('/labs/pwnhub')
    await testRouter.isReady()
    vmMock.stage.value = 'ready'
    const wrapper = mount(PwnHubWorkspace, {
      attachTo: document.body,
      global: { plugins: [testRouter] },
    })
    const center = useAnomalyCenter()
    center.report({
      kind: 'missing-session-key',
      module: 'seclab',
      keyPresent: false,
    })
    await nextTick()
    expect(wrapper.find('.report-card').exists()).toBe(false)

    center.report({
      kind: 'missing-session-key',
      module: 'pwnhub',
      keyPresent: false,
    })
    await nextTick()
    expect(wrapper.get('.report-card').text()).toContain('裁判忘带哨子')
    await wrapper.get('.btn-primary').trigger('click')
    expect(vmMock.restart).toHaveBeenCalledOnce()
    expect(center.pendingFor('pwnhub')).toBeNull()
    wrapper.unmount()
  })

  it('PwnHub 进度异常可重置当前稳定实验', async () => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/labs/pwnhub', component: { template: '<div />' } }],
    })
    await testRouter.push('/labs/pwnhub')
    await testRouter.isReady()
    vmMock.stage.value = 'ready'
    const wrapper = mount(PwnHubWorkspace, { global: { plugins: [testRouter] } })
    const anomaly = {
      kind: 'lab-guide-ahead-of-evidence',
      module: 'pwnhub',
      labId: 'memory-addresses-01',
      guideStep: 2,
      missingPrefixSteps: [2],
      truncated: false,
    } satisfies BlockingAnomaly
    useAnomalyCenter().report(anomaly)
    await nextTick()
    await wrapper.get('.btn-primary').trigger('click')
    expect(vmMock.resetCurrentLevel).toHaveBeenCalledOnce()
    expect(useAnomalyCenter().pendingFor('pwnhub')).toBeNull()
    wrapper.unmount()
  })

  function completeLabById(labId: string): void {
    const lab = getCourseLab(labId)
    if (lab === undefined) throw new Error(`未知实验：${labId}`)
    useLabProgress().completeByLabId(labId, lab.chapterId, {
      path: 'guided',
      hintsUsed: 0,
    })
  }

  const availableLabIds = COURSE.chapters
    .filter((chapter) => chapter.status === 'available')
    .flatMap((chapter) => chapter.labIds)
  const lastAvailableLabId = availableLabIds[availableLabIds.length - 1]!
  const firstAvailableLabId = availableLabIds[0]!

  it('五击临时解锁最后一关完成后不伪造全课程完成，转到真实未完成实验', async () => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/labs/pwnhub', component: { template: '<div />' } }],
    })
    await testRouter.push('/labs/pwnhub')
    await testRouter.isReady()
    vmMock.stage.value = 'ready'

    const wrapper = mount(PwnHubWorkspace, { global: { plugins: [testRouter] } })
    await flushPromises()

    // 模拟五击临时解锁最后一关：CourseRail 发出 debug-unlock-lab 事件
    wrapper.findComponent(CourseRail).vm.$emit('debug-unlock-lab', lastAvailableLabId)
    // vm.gotoLab 被模拟，需手动模拟真实 VM 导航副作用（setLab）
    useLabProgress().setLab(lastAvailableLabId)
    // 临时解锁后完成最后一关（模拟通关协议消息写入进度）
    completeLabById(lastAvailableLabId)
    await flushPromises()

    // 最后一关已完成，总结按钮可见
    expect(wrapper.find('.btn-next').exists()).toBe(true)
    expect(wrapper.find('.completion-page').exists()).toBe(false)

    await wrapper.get('.btn-next').trigger('click')
    await flushPromises()

    // 不进入总结页，而是转到第一个真实未完成的实验
    expect(wrapper.find('.completion-page').exists()).toBe(false)
    expect(vmMock.gotoLab).toHaveBeenCalledWith(firstAvailableLabId)
    expect(vmMock.dispose).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('全部已发布实验完成后才显示总结页', async () => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/labs/pwnhub', component: { template: '<div />' } }],
    })
    await testRouter.push('/labs/pwnhub')
    await testRouter.isReady()

    // 全部已发布实验完成
    for (const labId of availableLabIds) completeLabById(labId)

    const wrapper = mount(PwnHubWorkspace, { global: { plugins: [testRouter] } })
    await nextTick()

    // 直接显示总结页，不启动 VM
    expect(wrapper.find('.completion-page').exists()).toBe(true)
    expect(wrapper.find('#lab-workspace').exists()).toBe(false)
    expect(vmMock.boot).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
