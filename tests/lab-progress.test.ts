// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LEGACY_PROGRESS_STORAGE_KEY,
  MIGRATABLE_PROGRESS_STORAGE_KEY,
  PREVIOUS_PROGRESS_STORAGE_KEY,
  PROGRESS_STORAGE_KEY,
  advanceGuideStep,
  completeLearningStep,
  completeLevel,
  consumeProgressResetNotice,
  createSafeStorage,
  createDefaultProgress,
  loadProgress,
  markGuidedAssistance,
  recordHint,
  resetLevelAttempt,
  resetAllProgress,
  saveProgress,
  setCurrentLevel,
  type StorageLike,
} from '../src/services/progress-store'
import {
  TERMINAL_FONT_SIZE_DEFAULT,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  UI_PREFERENCES_STORAGE_KEY,
  createDefaultUiPreferences,
  loadUiPreferences,
  saveUiPreferences,
} from '../src/services/ui-preferences-store'
import type { LabProgress } from '../src/types/lab'

const TOTAL = 10
const GUIDED_COMPLETION = { path: 'guided' as const, hintsUsed: 0 }

describe('lab-progress（基于 localStorage）', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('无存档时返回全新进度', () => {
    const p = loadProgress(window.localStorage, TOTAL)
    expect(p.currentLevel).toBe(1)
    expect(p.completedLevels).toEqual([])
    expect(p.hintsUsed).toEqual({})
    expect(p.guideSteps).toEqual({})
    expect(p.completedSteps).toEqual({})
    expect(p.guidedAssistanceLevels).toEqual([])
    expect(p.completionRecords).toEqual({})
  })

  it('完成关卡后持久化，重新加载仍在', () => {
    const p = loadProgress(window.localStorage, TOTAL)
    expect(completeLevel(window.localStorage, p, 1, GUIDED_COMPLETION)).toBe(true)
    const reloaded = loadProgress(window.localStorage, TOTAL)
    expect(reloaded.completedLevels).toEqual([1])
    expect(reloaded.completionRecords[1]).toEqual(GUIDED_COMPLETION)
  })

  it('重复完成同一关不重复写入或覆盖首次完成记录', () => {
    const p = loadProgress(window.localStorage, TOTAL)
    expect(
      completeLevel(window.localStorage, p, 1, { path: 'challenge', hintsUsed: 1 }),
    ).toBe(true)
    expect(
      completeLevel(window.localStorage, p, 1, { path: 'mixed', hintsUsed: 3 }),
    ).toBe(false)
    expect(p.completedLevels).toEqual([1])
    const reloaded = loadProgress(window.localStorage, TOTAL)
    expect(reloaded.completedLevels).toEqual([1])
    expect(reloaded.completionRecords[1]).toEqual({ path: 'challenge', hintsUsed: 1 })
  })

  it('多关完成按编号排序保存', () => {
    const p = loadProgress(window.localStorage, TOTAL)
    completeLevel(window.localStorage, p, 3, GUIDED_COMPLETION)
    completeLevel(window.localStorage, p, 1, GUIDED_COMPLETION)
    expect(p.completedLevels).toEqual([1, 3])
  })

  it('提示使用次数累计并持久化', () => {
    const p = loadProgress(window.localStorage, TOTAL)
    expect(recordHint(window.localStorage, p, 4)).toBe(1)
    expect(recordHint(window.localStorage, p, 4)).toBe(2)
    expect(recordHint(window.localStorage, p, 4)).toBe(3)
    expect(recordHint(window.localStorage, p, 4)).toBe(3)
    const reloaded = loadProgress(window.localStorage, TOTAL)
    expect(reloaded.hintsUsed[4]).toBe(3)
  })

  it('切换当前关卡并持久化', () => {
    const p = loadProgress(window.localStorage, TOTAL)
    for (let level = 1; level <= 4; level += 1) {
      completeLevel(window.localStorage, p, level, GUIDED_COMPLETION)
    }
    setCurrentLevel(window.localStorage, p, 5)
    const reloaded = loadProgress(window.localStorage, TOTAL)
    expect(reloaded.currentLevel).toBe(5)
  })

  it('逐步揭示 guide 并在刷新后恢复，且不会越过最后一步', () => {
    const p = loadProgress(window.localStorage, TOTAL)
    expect(advanceGuideStep(window.localStorage, p, 2, 3)).toBe(1)
    expect(advanceGuideStep(window.localStorage, p, 2, 3)).toBe(2)
    expect(advanceGuideStep(window.localStorage, p, 2, 3)).toBe(2)
    expect(loadProgress(window.localStorage, TOTAL).guideSteps[2]).toBe(2)

    resetLevelAttempt(window.localStorage, p, 2)
    expect(loadProgress(window.localStorage, TOTAL).guideSteps[2]).toBe(0)
    expect(loadProgress(window.localStorage, TOTAL).completedSteps[2]).toEqual([])
  })

  it('重置本关清空步骤、提示和引导使用标记', () => {
    const p = loadProgress(window.localStorage, TOTAL)
    expect(completeLearningStep(window.localStorage, p, 2, 1)).toEqual([1])
    expect(completeLearningStep(window.localStorage, p, 2, 1)).toEqual([1])
    expect(completeLearningStep(window.localStorage, p, 2, 3)).toEqual([1, 3])
    recordHint(window.localStorage, p, 2)
    expect(markGuidedAssistance(window.localStorage, p, 2)).toBe(true)
    expect(markGuidedAssistance(window.localStorage, p, 2)).toBe(false)
    expect(loadProgress(window.localStorage, TOTAL).completedSteps[2]).toEqual([1, 3])

    resetLevelAttempt(window.localStorage, p, 2)
    const reloaded = loadProgress(window.localStorage, TOTAL)
    expect(reloaded.completedSteps[2]).toEqual([])
    expect(reloaded.hintsUsed[2]).toBeUndefined()
    expect(reloaded.guidedAssistanceLevels).not.toContain(2)
  })

  it('发现旧版存档时一次性重置并产生一次迁移提示', () => {
    window.localStorage.setItem(
      LEGACY_PROGRESS_STORAGE_KEY,
      JSON.stringify({ currentLevel: 3, completedLevels: [1, 2] }),
    )

    const p = loadProgress(window.localStorage, TOTAL)
    expect(p).toEqual(expect.objectContaining({ currentLevel: 1, completedLevels: [] }))
    expect(window.localStorage.getItem(LEGACY_PROGRESS_STORAGE_KEY)).toBeNull()
    expect(consumeProgressResetNotice(window.localStorage)).toBe(true)
    expect(consumeProgressResetNotice(window.localStorage)).toBe(false)

    window.localStorage.setItem(
      PREVIOUS_PROGRESS_STORAGE_KEY,
      JSON.stringify({ currentLevel: 3, completedLevels: [1, 2] }),
    )
    loadProgress(window.localStorage, TOTAL)
    expect(window.localStorage.getItem(PREVIOUS_PROGRESS_STORAGE_KEY)).toBeNull()
    expect(consumeProgressResetNotice(window.localStorage)).toBe(true)
  })

  it('v3 存档无损迁移到 v4，旧完成关卡不伪造完成模式', () => {
    const v3 = {
      currentLevel: 3,
      completedLevels: [1, 2],
      hintsUsed: { 3: 2 },
      guideSteps: { 3: 1 },
      completedSteps: { 3: [1] },
      startedAt: 100,
      updatedAt: 200,
    }
    window.localStorage.setItem(MIGRATABLE_PROGRESS_STORAGE_KEY, JSON.stringify(v3))

    const migrated = loadProgress(window.localStorage, TOTAL)
    expect(migrated).toEqual({
      ...v3,
      guidedAssistanceLevels: [],
      completionRecords: {},
    })
    expect(window.localStorage.getItem(MIGRATABLE_PROGRESS_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(PROGRESS_STORAGE_KEY)).not.toBeNull()
    expect(consumeProgressResetNotice(window.localStorage)).toBe(false)
  })

  it('损坏的存档不会导致异常，直接从头开始', () => {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, '{{{broken json')
    const p = loadProgress(window.localStorage, TOTAL)
    expect(p.currentLevel).toBe(1)
    expect(p.completedLevels).toEqual([])
  })

  it('字段非法的存档被拒绝', () => {
    window.localStorage.setItem(
      PROGRESS_STORAGE_KEY,
      JSON.stringify({
        currentLevel: 99,
        completedLevels: 'no',
        hintsUsed: {},
        guideSteps: {},
        completedSteps: {},
        guidedAssistanceLevels: [],
        completionRecords: {},
        startedAt: 0,
        updatedAt: 0,
      }),
    )
    const p = loadProgress(window.localStorage, TOTAL)
    expect(p.completedLevels).toEqual([])
  })

  it('拒绝重复关卡、非法提示次数和非有限时间戳', () => {
    const valid = {
      currentLevel: 1,
      completedLevels: [],
      hintsUsed: {},
      guideSteps: {},
      completedSteps: {},
      guidedAssistanceLevels: [],
      completionRecords: {},
      startedAt: 1,
      updatedAt: 1,
    }
    const invalidRecords = [
      { ...valid, completedLevels: [1, 1] },
      { ...valid, currentLevel: 3, completedLevels: [1, 3] },
      { ...valid, currentLevel: 5, completedLevels: [1, 2] },
      { ...valid, hintsUsed: { 2: -1 } },
      { ...valid, hintsUsed: { 99: 1 } },
      { ...valid, guideSteps: { 1: -1 } },
      { ...valid, completedSteps: { 1: [1, 1] } },
      { ...valid, guidedAssistanceLevels: [1, 1] },
      {
        ...valid,
        currentLevel: 2,
        completedLevels: [1],
        completionRecords: { 1: { path: 'challenge', hintsUsed: 4 } },
      },
      {
        ...valid,
        completionRecords: { 1: { path: 'challenge', hintsUsed: 0 } },
      },
      { ...valid, startedAt: 'now' },
    ]

    for (const record of invalidRecords) {
      window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(record))
      expect(loadProgress(window.localStorage, TOTAL).completedLevels).toEqual([])
      expect(loadProgress(window.localStorage, TOTAL).startedAt).not.toBe(record.startedAt)
    }
  })

  it('resetAllProgress 清空全部进度', () => {
    const p = loadProgress(window.localStorage, TOTAL)
    completeLevel(window.localStorage, p, 1, GUIDED_COMPLETION)
    completeLevel(window.localStorage, p, 2, GUIDED_COMPLETION)
    advanceGuideStep(window.localStorage, p, 2, 3)
    markGuidedAssistance(window.localStorage, p, 2)
    const fresh = resetAllProgress(window.localStorage)
    expect(fresh.completedLevels).toEqual([])
    expect(fresh.guideSteps).toEqual({})
    expect(fresh.completedSteps).toEqual({})
    expect(fresh.guidedAssistanceLevels).toEqual([])
    expect(fresh.completionRecords).toEqual({})
    const reloaded = loadProgress(window.localStorage, TOTAL)
    expect(reloaded.completedLevels).toEqual([])
  })

  it('saveProgress 会刷新 updatedAt', async () => {
    const p: LabProgress = createDefaultProgress(1000)
    const before = p.updatedAt
    await new Promise((r) => setTimeout(r, 5))
    saveProgress(window.localStorage, p)
    expect(p.updatedAt).toBeGreaterThan(before)
  })

  it('StorageLike 抽象可用内存实现替代', () => {
    const map = new Map<string, string>()
    const mem: StorageLike = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    }
    const p = loadProgress(mem, TOTAL)
    completeLevel(mem, p, 1, GUIDED_COMPLETION)
    expect(loadProgress(mem, TOTAL).completedLevels).toEqual([1])
  })

  it('localStorage 在运行中失效时自动降级到内存副本', () => {
    const storage = createSafeStorage()
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })

    storage.setItem('runtime-fallback', 'saved')
    expect(storage.getItem('runtime-fallback')).toBe('saved')

    setItem.mockRestore()
  })
})

describe('lab UI preferences', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('首次进入必须选择模式，保存后可恢复', () => {
    expect(createDefaultUiPreferences()).toEqual({
      mode: null,
      onboardingComplete: false,
      terminalFontSize: TERMINAL_FONT_SIZE_DEFAULT,
    })

    const preferences = {
      mode: 'guided' as const,
      onboardingComplete: true,
      terminalFontSize: 17,
    }
    saveUiPreferences(window.localStorage, preferences)
    expect(loadUiPreferences(window.localStorage)).toEqual(preferences)
  })

  it('损坏偏好安全回退，且与进度使用不同存储键', () => {
    expect(UI_PREFERENCES_STORAGE_KEY).not.toBe(PROGRESS_STORAGE_KEY)
    window.localStorage.setItem(
      UI_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ mode: 'unknown', onboardingComplete: true }),
    )
    expect(loadUiPreferences(window.localStorage)).toEqual(createDefaultUiPreferences())
  })

  it('旧偏好自动补默认字号，并只接受 12–20 的整数', () => {
    window.localStorage.setItem(
      UI_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ mode: 'guided', onboardingComplete: true }),
    )
    expect(loadUiPreferences(window.localStorage).terminalFontSize).toBe(
      TERMINAL_FONT_SIZE_DEFAULT,
    )

    for (const terminalFontSize of [TERMINAL_FONT_SIZE_MIN, TERMINAL_FONT_SIZE_MAX]) {
      window.localStorage.setItem(
        UI_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ mode: 'challenge', onboardingComplete: true, terminalFontSize }),
      )
      expect(loadUiPreferences(window.localStorage).terminalFontSize).toBe(terminalFontSize)
    }

    for (const terminalFontSize of [11, 21, 15.5]) {
      window.localStorage.setItem(
        UI_PREFERENCES_STORAGE_KEY,
        JSON.stringify({ mode: 'guided', onboardingComplete: true, terminalFontSize }),
      )
      expect(loadUiPreferences(window.localStorage)).toEqual(createDefaultUiPreferences())
    }
  })

  it('重置关卡进度不会删除界面偏好', () => {
    saveUiPreferences(window.localStorage, {
      mode: 'challenge',
      onboardingComplete: true,
      terminalFontSize: 18,
    })
    resetAllProgress(window.localStorage)
    expect(loadUiPreferences(window.localStorage)).toEqual({
      mode: 'challenge',
      onboardingComplete: true,
      terminalFontSize: 18,
    })
  })
})
