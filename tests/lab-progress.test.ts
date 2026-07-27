// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  PROGRESS_STORAGE_KEY,
  completeLevel,
  createDefaultProgress,
  loadProgress,
  recordHint,
  resetAllProgress,
  saveProgress,
  setCurrentLevel,
  type StorageLike,
} from '../src/services/progress-store'
import type { LabProgress } from '../src/types/lab'

const TOTAL = 6

describe('lab-progress（基于 localStorage）', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('无存档时返回全新进度', () => {
    const p = loadProgress(window.localStorage, TOTAL)
    expect(p.currentLevel).toBe(1)
    expect(p.completedLevels).toEqual([])
    expect(p.hintsUsed).toEqual({})
  })

  it('完成关卡后持久化，重新加载仍在', () => {
    const p = loadProgress(window.localStorage, TOTAL)
    expect(completeLevel(window.localStorage, p, 1)).toBe(true)
    const reloaded = loadProgress(window.localStorage, TOTAL)
    expect(reloaded.completedLevels).toEqual([1])
  })

  it('重复完成同一关不重复写入', () => {
    const p = loadProgress(window.localStorage, TOTAL)
    expect(completeLevel(window.localStorage, p, 2)).toBe(true)
    expect(completeLevel(window.localStorage, p, 2)).toBe(false)
    expect(p.completedLevels).toEqual([2])
    const reloaded = loadProgress(window.localStorage, TOTAL)
    expect(reloaded.completedLevels).toEqual([2])
  })

  it('多关完成按编号排序保存', () => {
    const p = loadProgress(window.localStorage, TOTAL)
    completeLevel(window.localStorage, p, 3)
    completeLevel(window.localStorage, p, 1)
    expect(p.completedLevels).toEqual([1, 3])
  })

  it('提示使用次数累计并持久化', () => {
    const p = loadProgress(window.localStorage, TOTAL)
    expect(recordHint(window.localStorage, p, 4)).toBe(1)
    expect(recordHint(window.localStorage, p, 4)).toBe(2)
    const reloaded = loadProgress(window.localStorage, TOTAL)
    expect(reloaded.hintsUsed[4]).toBe(2)
  })

  it('切换当前关卡并持久化', () => {
    const p = loadProgress(window.localStorage, TOTAL)
    setCurrentLevel(window.localStorage, p, 5)
    const reloaded = loadProgress(window.localStorage, TOTAL)
    expect(reloaded.currentLevel).toBe(5)
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
      JSON.stringify({ currentLevel: 99, completedLevels: 'no', hintsUsed: {}, startedAt: 0, updatedAt: 0 }),
    )
    const p = loadProgress(window.localStorage, TOTAL)
    expect(p.completedLevels).toEqual([])
  })

  it('resetAllProgress 清空全部进度', () => {
    const p = loadProgress(window.localStorage, TOTAL)
    completeLevel(window.localStorage, p, 1)
    completeLevel(window.localStorage, p, 2)
    const fresh = resetAllProgress(window.localStorage)
    expect(fresh.completedLevels).toEqual([])
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
    completeLevel(mem, p, 6)
    expect(loadProgress(mem, TOTAL).completedLevels).toEqual([6])
  })
})
