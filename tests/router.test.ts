// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLabProgress } from '../src/composables/useLabProgress'
import { isRouterModule, MODULES } from '../src/modules/catalog'
import { router } from '../src/router'
import { CRYPTO_LAB_PROGRESS_STORAGE_KEY } from '../src/services/crypto-lab-progress'
import LabSelectorView from '../src/views/LabSelectorView.vue'

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
  useLabProgress().resetAll()
})

describe('lab module routing', () => {
  it('使用 hash 路由并为两个 Vue 工作台保留稳定地址', () => {
    expect(router.options.history.base).toContain('#')
    expect(router.getRoutes().map((route) => route.path)).toEqual(
      expect.arrayContaining(['/', '/labs/seclab', '/labs/pwnhub', '/:pathMatch(.*)*']),
    )
    expect(MODULES.find((module) => module.moduleId === 'cryptolab')?.entry).toEqual({
      kind: 'document',
      href: './crypto-lab/index.html',
    })
  })

  it('选择器显示三个模块的独立完成度与非阻断 PwnHub 风险提示', async () => {
    window.localStorage.setItem(CRYPTO_LAB_PROGRESS_STORAGE_KEY, '{damaged')
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [
        ...MODULES.filter(isRouterModule).map((module) => ({
          path: module.entry.route,
          component: { template: '<div />' },
        })),
        { path: '/', component: LabSelectorView },
      ],
    })
    await testRouter.push('/')
    await testRouter.isReady()

    const wrapper = mount(LabSelectorView, { global: { plugins: [testRouter] } })
    expect(wrapper.findAll('.module-card')).toHaveLength(3)
    expect(wrapper.text()).toContain('0 / 10')
    expect(wrapper.text()).toContain('0 / 20')
    expect(wrapper.text()).toContain('0 / 11')
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
    wrapper.unmount()
  })

  it('从子路径用顶层文档导航进入 CryptoLab，并显示严格解析后的进度', async () => {
    window.history.replaceState({}, '', '/nested/deploy/#/')
    window.localStorage.setItem(
      CRYPTO_LAB_PROGRESS_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        solved: { level00: true, level01: true, level02: false },
      }),
    )
    const assignDocument = vi.fn<(href: string) => void>()
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [
        ...MODULES.filter(isRouterModule).map((module) => ({
          path: module.entry.route,
          component: { template: '<div />' },
        })),
        { path: '/', component: LabSelectorView },
      ],
    })
    await testRouter.push('/')
    await testRouter.isReady()

    const wrapper = mount(LabSelectorView, {
      props: { assignDocument },
      global: { plugins: [testRouter] },
    })
    const cryptoCard = wrapper.get('[data-module-id="cryptolab"]')
    expect(cryptoCard.text()).toContain('2 / 11')

    await cryptoCard.get('.enter-button').trigger('click')

    expect(assignDocument).toHaveBeenCalledOnce()
    expect(new URL(assignDocument.mock.calls[0][0]).pathname).toBe(
      '/nested/deploy/crypto-lab/index.html',
    )
    expect(testRouter.currentRoute.value.path).toBe('/')
    wrapper.unmount()
  })
})
