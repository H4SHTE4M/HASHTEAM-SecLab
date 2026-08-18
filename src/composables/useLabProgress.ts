import { computed, reactive, ref, watch } from 'vue'
import type { LabProgress } from '../types/lab'
import { LEVELS, TOTAL_LEVELS } from '../data/levels'
import {
  detectBlockingAnomalies,
  detectLabBlockingAnomalies,
  type ProgressDiagnostic,
} from '../services/progress-anomaly'
import { useAnomalyCenter } from '../services/anomaly-center'
import { log as bootLog } from '../services/boot-logger'
import { useLabPreferences } from './useLabPreferences'
import { COURSE } from '../modules/pwnhub/course'
import {
  applyProgressSnapshot,
  applySyncedProgress,
  completeLevel,
  completeLab,
  consumeProgressResetNotice,
  createSafeStorage,
  advanceGuideStep,
  advanceLabGuideStep,
  completeLearningStep,
  completeLabLearningStep,
  parseProgressSnapshot,
  loadProgress,
  markGuidedAssistance,
  markLabGuidedAssistance,
  recordHint,
  recordLabHint,
  resetLevelAttempt,
  resetLabAttempt,
  resetAllProgress,
  PROGRESS_STORAGE_KEY,
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

function syncExternalProgress(event: StorageEvent): void {
  if (event.key !== PROGRESS_STORAGE_KEY) return
  // 事件入队后本标签可能已完成了更新；始终读取此刻最新存储，避免旧事件反向覆盖。
  const latestRaw = storage.getItem(PROGRESS_STORAGE_KEY)
  if (latestRaw === null) return
  const external = parseProgressSnapshot(latestRaw, TOTAL_LEVELS)
  if (external === null) return
  // storage 事件只更新内存单例；不持久化，避免标签页间回写循环。
  // 完成记录等数据字段同步，选关保留本地：本标签的界面跟随本地终端环境，
  // 不能被其他标签的导航拽走（否则界面与终端脱关、通关结果无法归属）。
  applySyncedProgress(state, external, TOTAL_LEVELS)
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', syncExternalProgress)
}

const preferences = useLabPreferences()
const anomalyCenter = useAnomalyCenter()

/** B-only 等诊断线索每次启动只写一次日志，避免 watch 重跑刷爆 200 条缓冲 */
const loggedDiagnostics = new Set<string>()

function logDiagnosticOnce(diagnostic: ProgressDiagnostic): void {
  const target = diagnostic.level === undefined ? diagnostic.labId : diagnostic.level
  const key = `${diagnostic.module}:${diagnostic.kind}:${String(target)}:${diagnostic.detail}`
  if (loggedDiagnostics.has(key)) return
  loggedDiagnostics.add(key)
  bootLog('progress', diagnostic.detail, 'warn')
}

/** 加载期跑一次，之后随两个模块的当前位置和学习模式变化重检。 */
function checkBlockingAnomalies(): void {
  const seclab = detectBlockingAnomalies({
    progress: state,
    levels: LEVELS,
    mode: preferences.state.mode,
  })
  seclab.blocking.forEach((anomaly) => anomalyCenter.report(anomaly))
  anomalyCenter.reconcile('seclab', seclab.blocking)
  seclab.diagnostics.forEach(logDiagnosticOnce)

  const pwnhub = detectLabBlockingAnomalies({
    progress: state,
    labs: COURSE.labs,
    mode: preferences.state.mode,
  })
  pwnhub.blocking.forEach((anomaly) => anomalyCenter.report(anomaly))
  anomalyCenter.reconcile('pwnhub', pwnhub.blocking)
  pwnhub.diagnostics.forEach(logDiagnosticOnce)
}

checkBlockingAnomalies()
watch(
  [() => state.currentLevel, () => state.currentLabId, () => preferences.state.mode],
  checkBlockingAnomalies,
)

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
    applyProgressSnapshot(state, resetAllProgress(storage))
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
