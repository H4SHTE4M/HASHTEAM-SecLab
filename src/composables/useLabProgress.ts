import { computed, reactive } from 'vue'
import type { LabProgress } from '../types/lab'
import { TOTAL_LEVELS } from '../data/levels'
import {
  completeLevel,
  createDefaultProgress,
  loadProgress,
  recordHint,
  resetAllProgress,
  setCurrentLevel,
} from '../services/progress-store'

/**
 * 关卡进度（模块级单例，LocalStorage 持久化）。
 * 刷新页面后已完成关卡与提示使用情况都会保留。
 */
const storage = window.localStorage
const initial = typeof window === 'undefined' ? createDefaultProgress() : loadProgress(storage, TOTAL_LEVELS)
const state = reactive<LabProgress>(initial)

export function useLabProgress() {
  const allCompleted = computed(() => state.completedLevels.length >= TOTAL_LEVELS)

  /** 标记关卡完成；重复完成同一关不会重复写入 */
  function complete(level: number): boolean {
    return completeLevel(storage, state, level)
  }

  /** 记录一次提示使用，返回该关累计提示数 */
  function useHint(level: number): number {
    return recordHint(storage, state, level)
  }

  function setLevel(level: number): void {
    if (level < 1 || level > TOTAL_LEVELS) return
    setCurrentLevel(storage, state, level)
  }

  /** 重新开始：清空全部进度 */
  function resetAll(): void {
    const fresh = resetAllProgress(storage)
    state.currentLevel = fresh.currentLevel
    state.completedLevels = fresh.completedLevels
    state.hintsUsed = fresh.hintsUsed
    state.startedAt = fresh.startedAt
    state.updatedAt = fresh.updatedAt
  }

  function hintsUsedFor(level: number): number {
    return state.hintsUsed[level] ?? 0
  }

  return {
    state,
    allCompleted,
    complete,
    useHint,
    setLevel,
    resetAll,
    hintsUsedFor,
  }
}
