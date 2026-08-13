import { computed, reactive, ref, watch } from 'vue'
import type { LabProgress } from '../types/lab'
import { LEVELS, TOTAL_LEVELS } from '../data/levels'
import { detectBlockingAnomalies, type ProgressDiagnostic } from '../services/progress-anomaly'
import { useAnomalyCenter } from '../services/anomaly-center'
import { log as bootLog } from '../services/boot-logger'
import { useLabPreferences } from './useLabPreferences'
import {
  completeLevel,
  completeLab,
  consumeProgressResetNotice,
  createSafeStorage,
  advanceGuideStep,
  advanceLabGuideStep,
  completeLearningStep,
  completeLabLearningStep,
  loadProgress,
  markGuidedAssistance,
  markLabGuidedAssistance,
  recordHint,
  recordLabHint,
  resetLevelAttempt,
  resetLabAttempt,
  resetAllProgress,
  setCurrentLevel,
  setCurrentLab,
} from '../services/progress-store'
import type { LevelCompletionRecord } from '../types/lab'

/**
 * 关卡进度（模块级单例，LocalStorage 持久化）。
 * 刷新页面后已完成关卡与提示使用情况都会保留。
 */
const storage = createSafeStorage()
const initial = loadProgress(storage, TOTAL_LEVELS)
const state = reactive<LabProgress>(initial)
const progressResetNotice = ref(consumeProgressResetNotice(storage))

const preferences = useLabPreferences()
const anomalyCenter = useAnomalyCenter()

/** B-only 等诊断线索每次启动只写一次日志，避免 watch 重跑刷爆 200 条缓冲 */
const loggedDiagnostics = new Set<string>()

function logDiagnosticOnce(diagnostic: ProgressDiagnostic): void {
  const key = `${diagnostic.kind}:${diagnostic.level}:${diagnostic.detail}`
  if (loggedDiagnostics.has(key)) return
  loggedDiagnostics.add(key)
  bootLog('progress', diagnostic.detail, 'warn')
}

/**
 * 阻断类异常检测：加载期跑一次，之后随 currentLevel / mode 变化重检。
 * 只观察两个标量，不 deep-watch 进度档；reconcile 会撤销不再成立的
 * pending（如从引导模式切到挑战模式后，A 类弹窗自动撤下）。
 */
function checkBlockingAnomalies(): void {
  const { blocking, diagnostics } = detectBlockingAnomalies({
    progress: state,
    levels: LEVELS,
    mode: preferences.state.mode,
  })
  blocking.forEach((anomaly) => anomalyCenter.report(anomaly))
  anomalyCenter.reconcile(blocking)
  diagnostics.forEach(logDiagnosticOnce)
}

checkBlockingAnomalies()
watch([() => state.currentLevel, () => preferences.state.mode], checkBlockingAnomalies)

export function useLabProgress() {
  const allCompleted = computed(() => state.completedLevels.length >= TOTAL_LEVELS)

  /** 标记关卡完成；重复完成同一关不会重复写入 */
  function complete(level: number, record: LevelCompletionRecord): boolean {
    return completeLevel(storage, state, level, record)
  }

  function completeByLabId(
    labId: string,
    chapterId: string,
    record: LevelCompletionRecord,
  ): boolean {
    return completeLab(storage, state, labId, chapterId, record)
  }

  /** 记录一次提示使用，返回该关累计提示数 */
  function useHint(level: number): number {
    return recordHint(storage, state, level)
  }

  function useLabHint(labId: string): number {
    return recordLabHint(storage, state, labId)
  }

  function setLevel(level: number): void {
    if (level < 1 || level > TOTAL_LEVELS) return
    setCurrentLevel(storage, state, level)
  }

  function setLab(labId: string, legacyLevel?: number): void {
    setCurrentLab(storage, state, labId, legacyLevel)
  }

  /** 重新开始：清空全部进度 */
  function resetAll(): void {
    const fresh = resetAllProgress(storage)
    state.schemaVersion = fresh.schemaVersion
    state.currentLevel = fresh.currentLevel
    state.currentLabId = fresh.currentLabId
    state.completedLevels = fresh.completedLevels
    state.completedLabIds = fresh.completedLabIds
    state.chapterProgress = fresh.chapterProgress
    state.labHintsUsed = fresh.labHintsUsed
    state.labGuideSteps = fresh.labGuideSteps
    state.labCompletedSteps = fresh.labCompletedSteps
    state.guidedAssistanceLabIds = fresh.guidedAssistanceLabIds
    state.labCompletionRecords = fresh.labCompletionRecords
    state.hintsUsed = fresh.hintsUsed
    state.guideSteps = fresh.guideSteps
    state.completedSteps = fresh.completedSteps
    state.guidedAssistanceLevels = fresh.guidedAssistanceLevels
    state.completionRecords = fresh.completionRecords
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

  function labGuideStepFor(labId: string, totalSteps: number): number {
    if (totalSteps <= 0) return 0
    return Math.min(state.labGuideSteps[labId] ?? 0, totalSteps - 1)
  }

  function advanceGuide(level: number, totalSteps: number): number {
    return advanceGuideStep(storage, state, level, totalSteps)
  }

  function advanceLabGuide(labId: string, totalSteps: number): number {
    return advanceLabGuideStep(storage, state, labId, totalSteps)
  }

  function resetLevel(level: number): void {
    resetLevelAttempt(storage, state, level)
  }

  function resetLab(labId: string): void {
    resetLabAttempt(storage, state, labId)
  }

  function completeStep(level: number, stepId: number): number[] {
    return completeLearningStep(storage, state, level, stepId)
  }

  function completeLabStep(labId: string, stepId: number): number[] {
    return completeLabLearningStep(storage, state, labId, stepId)
  }

  function completedStepsFor(level: number): number[] {
    return state.completedSteps[level] ?? []
  }

  function completedLabStepsFor(labId: string): number[] {
    return state.labCompletedSteps[labId] ?? []
  }

  function markGuided(level: number): boolean {
    return markGuidedAssistance(storage, state, level)
  }

  function markLabGuided(labId: string): boolean {
    return markLabGuidedAssistance(storage, state, labId)
  }

  function hasGuidedAssistance(level: number): boolean {
    return state.guidedAssistanceLevels.includes(level)
  }

  function hasLabGuidedAssistance(labId: string): boolean {
    return state.guidedAssistanceLabIds.includes(labId)
  }

  function labHintsUsedFor(labId: string): number {
    return state.labHintsUsed[labId] ?? 0
  }

  function dismissProgressResetNotice(): void {
    progressResetNotice.value = false
  }

  return {
    state,
    allCompleted,
    progressResetNotice,
    complete,
    completeByLabId,
    useHint,
    useLabHint,
    setLevel,
    setLab,
    resetAll,
    hintsUsedFor,
    guideStepFor,
    labGuideStepFor,
    advanceGuide,
    advanceLabGuide,
    resetLevel,
    resetLab,
    completeStep,
    completeLabStep,
    completedStepsFor,
    completedLabStepsFor,
    markGuided,
    markLabGuided,
    hasGuidedAssistance,
    hasLabGuidedAssistance,
    labHintsUsedFor,
    dismissProgressResetNotice,
  }
}
