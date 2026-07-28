import { computed, reactive, ref } from 'vue'
import type { LabProgress } from '../types/lab'
import { TOTAL_LEVELS } from '../data/levels'
import {
  completeLevel,
  consumeProgressResetNotice,
  createSafeStorage,
  advanceGuideStep,
  completeLearningStep,
  loadProgress,
  recordHint,
  resetGuideStep,
  resetAllProgress,
  setCurrentLevel,
} from '../services/progress-store'

/**
 * 关卡进度（模块级单例，LocalStorage 持久化）。
 * 刷新页面后已完成关卡与提示使用情况都会保留。
 */
const storage = createSafeStorage()
const initial = loadProgress(storage, TOTAL_LEVELS)
const state = reactive<LabProgress>(initial)
const progressResetNotice = ref(consumeProgressResetNotice(storage))

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
    state.guideSteps = fresh.guideSteps
    state.completedSteps = fresh.completedSteps
    state.startedAt = fresh.startedAt
    state.updatedAt = fresh.updatedAt
  }

  function hintsUsedFor(level: number): number {
    return state.hintsUsed[level] ?? 0
  }

  function guideStepFor(level: number, totalSteps: number): number {
    if (totalSteps <= 0) return 0
    return Math.min(state.guideSteps[level] ?? 0, totalSteps - 1)
  }

  function advanceGuide(level: number, totalSteps: number): number {
    return advanceGuideStep(storage, state, level, totalSteps)
  }

  function resetGuide(level: number): void {
    resetGuideStep(storage, state, level)
  }

  function completeStep(level: number, stepId: number): number[] {
    return completeLearningStep(storage, state, level, stepId)
  }

  function completedStepsFor(level: number): number[] {
    return state.completedSteps[level] ?? []
  }

  function dismissProgressResetNotice(): void {
    progressResetNotice.value = false
  }

  return {
    state,
    allCompleted,
    progressResetNotice,
    complete,
    useHint,
    setLevel,
    resetAll,
    hintsUsedFor,
    guideStepFor,
    advanceGuide,
    resetGuide,
    completeStep,
    completedStepsFor,
    dismissProgressResetNotice,
  }
}
