// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { useLabProgress } from '../src/composables/useLabProgress'
import { MODULES } from '../src/modules/catalog'
import { router } from '../src/router'
import LabSelectorView from '../src/views/LabSelectorView.vue'

beforeEach(() => {
  window.localStorage.clear()
  useLabProgress().resetAll()
})

describe('lab module routing', () => {
  it('使用 hash 路由并为两个工作台保留稳定地址', () => {
    expect(router.options.history.base).toContain('#')
    expect(router.getRoutes().map((route) => route.path)).toEqual(
      expect.arrayContaining(['/', '/labs/seclab', '/labs/pwnhub', '/:pathMatch(.*)*']),
    )
  })

  it('选择器显示独立完成度与非阻断 PwnHub 风险提示', async () => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [
        ...MODULES.map((module) => ({
          path: module.route,
          component: { template: '<div />' },
        })),
        { path: '/', component: LabSelectorView },
      ],
    })
    await testRouter.push('/')
    await testRouter.isReady()

    const wrapper = mount(LabSelectorView, { global: { plugins: [testRouter] } })
    expect(wrapper.findAll('.module-card')).toHaveLength(2)
    expect(wrapper.text()).toContain('0 / 10')
    expect(wrapper.text()).toContain('0 / 20')
    expect(wrapper.text()).toContain('PwnHub 假设你已熟悉基本 Shell；仍可直接进入。')

    useLabProgress().complete(1, { path: 'guided', hintsUsed: 0 })
    useLabProgress().completeByLabId('memory-addresses-01', 'memory-model', {
      path: 'guided',
      hintsUsed: 0,
    })
    await nextTick()
    expect(wrapper.text()).toContain('1 / 10')
    expect(wrapper.text()).toContain('1 / 20')
    expect(wrapper.text()).toContain('建议继续完成 SecLab，也可直接进入。')

    await wrapper.findAll('.enter-button')[1].trigger('click')
    await flushPromises()
    expect(testRouter.currentRoute.value.path).toBe('/labs/pwnhub')
  })
})
