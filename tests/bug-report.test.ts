// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  buildBugReport,
  collectBugReportInput,
  downloadBugReport,
  type BugReportInput,
} from '../src/services/bug-report'
import { log as bootLog, snapshot as snapshotBootLog } from '../src/services/boot-logger'
import {
  createSafeStorage,
  isStorageDegraded,
  PROGRESS_STORAGE_KEY,
} from '../src/services/progress-store'
import { UI_PREFERENCES_STORAGE_KEY } from '../src/services/ui-preferences-store'
import type { BlockingAnomaly } from '../src/services/progress-anomaly'

const GUIDE_AHEAD: BlockingAnomaly = {
  kind: 'guide-ahead-of-evidence',
  module: 'seclab',
  level: 2,
  guideStep: 1,
  missingPrefixSteps: [0],
  truncated: false,
}

function makeInput(overrides: Partial<BugReportInput> = {}): BugReportInput {
  return {
    trigger: GUIDE_AHEAD,
    build: { sourceId: 'deadbeef', displayId: 'deadbeefcafe', dirty: false },
    page: { url: 'https://lab.example/', userAgent: 'UA-TEST', language: 'zh-CN', isSecureContext: true },
    labState: { module: 'seclab', currentLevel: 2, mode: 'guided', completedLevels: [1] },
    progressRaw: '{"schemaVersion":4}',
    uiPreferencesRaw: null,
    storageDegraded: false,
    bootLog: [{ seq: 1, time: 0, level: 'info', source: 'boot', text: 'x' }],
    generatedAt: '2026-08-11T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildBugReport（纯组装）', () => {
  it('按契约组装各字段，触发异常原样透传', () => {
    const report = buildBugReport(makeInput())
    expect(report.kind).toBe('hashteam-bug-report')
    expect(report.reportVersion).toBe(2)
    expect(report.trigger).toEqual(GUIDE_AHEAD)
    expect(report.build.displayId).toBe('deadbeefcafe')
    expect(report.page.isSecureContext).toBe(true)
    expect(report.labState).toEqual({
      module: 'seclab',
      currentLevel: 2,
      mode: 'guided',
      completedLevels: [1],
    })
    expect(report.progressRaw).toBe('{"schemaVersion":4}')
    expect(report.uiPreferencesRaw).toBeNull()
    expect(report.truncated).toBe(false)
  })

  it('备注说明终端缓冲读不到、serial 日志只发开发者', () => {
    const report = buildBugReport(makeInput())
    expect(report.notes).toContain('addon-serialize')
    expect(report.notes).toContain('只发给开发者')
  })

  it('超大自由文本字段按 UTF-8 字节截断并置 truncated', () => {
    // 90000 个「的」= 270KB，切到 256KB 时末字节落在字符中间
    const huge = '的'.repeat(90_000)
    const report = buildBugReport(makeInput({ progressRaw: huge }))
    expect(report.truncated).toBe(true)
    expect(report.progressRaw).not.toBeNull()
    const bytes = new TextEncoder().encode(report.progressRaw ?? '')
    expect(bytes.length).toBeLessThanOrEqual(256 * 1024 + 8)
    // 残缺尾部由 TextDecoder 替换为 U+FFFD
    expect(report.progressRaw!.endsWith('')).toBe(true)
  })

  it('uiPreferencesRaw 超限时同样截断', () => {
    const huge = 'x'.repeat(300 * 1024)
    const report = buildBugReport(makeInput({ uiPreferencesRaw: huge }))
    expect(report.truncated).toBe(true)
    expect(report.uiPreferencesRaw!.length).toBe(256 * 1024)
  })

  it('未超限时原样保留、truncated 为 false', () => {
    const report = buildBugReport(makeInput({ progressRaw: 'x'.repeat(1000) }))
    expect(report.truncated).toBe(false)
    expect(report.progressRaw!.length).toBe(1000)
  })
})

describe('collectBugReportInput（现场采集）', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('从持久化存储取回原始档，页面与启动日志进入输入', () => {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, '{"schemaVersion":4,"currentLevel":2}')
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, '{"mode":"guided"}')
    bootLog('test-source', '测试日志行')
    const input = collectBugReportInput(GUIDE_AHEAD, {
      module: 'seclab',
      currentLevel: 2,
      mode: 'guided',
      completedLevels: [1, 2],
    })
    expect(input.trigger).toEqual(GUIDE_AHEAD)
    expect(input.progressRaw).toBe('{"schemaVersion":4,"currentLevel":2}')
    expect(input.uiPreferencesRaw).toBe('{"mode":"guided"}')
    expect(input.page.url).toBe(window.location.href)
    expect(input.page.isSecureContext).toBe(window.isSecureContext)
    expect(input.storageDegraded).toBe(false)
    expect(input.bootLog.length).toBeGreaterThan(0)
    expect(input.bootLog.at(-1)).toMatchObject({ source: 'test-source', text: '测试日志行' })
  })

  it('labState 是拷贝而非引用，调用方后续修改不影响报告', () => {
    const levels = [1, 2]
    const input = collectBugReportInput(GUIDE_AHEAD, {
      module: 'seclab',
      currentLevel: 2,
      mode: 'guided',
      completedLevels: levels,
    })
    levels.push(3)
    expect(input.labState).toMatchObject({ module: 'seclab', completedLevels: [1, 2] })
  })

  it('存储无数据时原始字段为 null', () => {
    const input = collectBugReportInput(GUIDE_AHEAD, {
      module: 'seclab',
      currentLevel: 1,
      mode: null,
      completedLevels: [],
    })
    expect(input.progressRaw).toBeNull()
    expect(input.uiPreferencesRaw).toBeNull()
  })
})

  it('PwnHub 报告保留稳定实验与章节状态的独立拷贝', () => {
    const completedLabIds = ['memory-addresses-01']
    const trigger = {
      kind: 'lab-guide-ahead-of-evidence',
      module: 'pwnhub',
      labId: 'memory-layout-01',
      guideStep: 2,
      missingPrefixSteps: [2],
      truncated: false,
    } satisfies BlockingAnomaly
    const input = collectBugReportInput(trigger, {
      module: 'pwnhub',
      currentLabId: 'memory-layout-01',
      currentChapterId: 'memory-model',
      mode: 'guided',
      completedLabIds,
    })
    completedLabIds.push('memory-layout-01')
    expect(input.labState).toEqual({
      module: 'pwnhub',
      currentLabId: 'memory-layout-01',
      currentChapterId: 'memory-model',
      mode: 'guided',
      completedLabIds: ['memory-addresses-01'],
    })
  })

describe('downloadBugReport（下载通道）', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  function stubDownloadChannel(): { clickSpy: MockInstance } {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    ;(URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:mock')
    ;(URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn()
    return { clickSpy }
  }

  it('成功时触发一次下载，文件名带时间戳，返回 true', async () => {
    const { clickSpy } = stubDownloadChannel()
    const ok = await downloadBugReport(GUIDE_AHEAD, {
      module: 'seclab',
      currentLevel: 2,
      mode: 'guided',
      completedLevels: [1],
    })
    expect(ok).toBe(true)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  it('下载内容为可解析的报告 JSON', async () => {
    stubDownloadChannel()
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, '{"schemaVersion":4}')
    await downloadBugReport(GUIDE_AHEAD, {
      module: 'seclab',
      currentLevel: 2,
      mode: 'guided',
      completedLevels: [1],
    })
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
    // jsdom 的 Blob 没有 .text()，用 FileReader 读回文本
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob)
    })
    const parsed = JSON.parse(text) as Record<string, unknown>
    expect(parsed.kind).toBe('hashteam-bug-report')
    expect(parsed.reportVersion).toBe(2)
    expect(parsed.trigger).toEqual(GUIDE_AHEAD)
    expect(parsed.progressRaw).toBe('{"schemaVersion":4}')
  })

  it('下载通道抛错时返回 false 而不是抛出', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    ;(URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => {
      throw new Error('blob disabled')
    })
    const ok = await downloadBugReport(GUIDE_AHEAD, {
      module: 'seclab',
      currentLevel: 2,
      mode: 'guided',
      completedLevels: [1],
    })
    expect(ok).toBe(false)
  })
})

// 本用例会向 progress-store 模块级注册表写入一个降级实例，
// 一旦写入 isStorageDegraded 对本文件后续用例恒为 true，因此必须放在文件末尾。
describe('存储降级观测', () => {
  it('localStorage 探针失败时降级为内存存储并被全局观测到', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {},
    })
    const storage = createSafeStorage()
    expect(storage.isDegraded?.()).toBe(true)
    expect(isStorageDegraded()).toBe(true)
    vi.unstubAllGlobals()
  })
})

// snapshot 不影响订阅缓冲：读取后再读仍在
describe('boot-logger snapshot', () => {
  it('返回一次性快照且不消费缓冲', () => {
    bootLog('snap-source', '快照行')
    const first = snapshotBootLog()
    const second = snapshotBootLog()
    expect(first.length).toBe(second.length)
    expect(first).not.toBe(second)
    expect(first.at(-1)).toMatchObject({ source: 'snap-source', text: '快照行' })
  })
})
