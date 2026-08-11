import type { LabProgress, LevelCompletionRecord } from '../types/lab'

export const PROGRESS_STORAGE_KEY = 'hashteam-lab-progress-v4'
export const LEGACY_PROGRESS_STORAGE_KEY = 'hashteam-lab-progress-v1'
export const PREVIOUS_PROGRESS_STORAGE_KEY = 'hashteam-lab-progress-v2'
export const MIGRATABLE_PROGRESS_STORAGE_KEY = 'hashteam-lab-progress-v3'
const MIGRATION_NOTICE_STORAGE_KEY = 'hashteam-lab-progress-v3-reset-notice'

/** 可注入的存储接口，便于在测试中使用内存实现 */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  /** 持久化是否已降级（配额/权限失败回退内存，或本就是内存实现）；问题日志用 */
  isDegraded?(): boolean
}

/** 内存兜底存储：localStorage 不可用时使用，保证进度层不抛错、不白屏 */
class MemoryStorage implements StorageLike {
  private readonly store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  /** 内存实现本身就是降级形态 */
  isDegraded(): boolean {
    return true
  }
}

/**
 * 对真实 Storage 做逐次容错。初始探针成功后仍可能因配额耗尽或浏览器策略变化
 * 抛错，因此每次操作都同步一份内存副本，并在主存储失败时无缝降级。
 */
class ResilientStorage implements StorageLike {
  private readonly fallback = new MemoryStorage()
  private primaryAvailable = true

  constructor(private readonly primary: Storage) {}

  getItem(key: string): string | null {
    if (!this.primaryAvailable) return this.fallback.getItem(key)
    try {
      const value = this.primary.getItem(key)
      if (value !== null) this.fallback.setItem(key, value)
      return value ?? this.fallback.getItem(key)
    } catch {
      this.primaryAvailable = false
      return this.fallback.getItem(key)
    }
  }

  setItem(key: string, value: string): void {
    this.fallback.setItem(key, value)
    if (!this.primaryAvailable) return
    try {
      this.primary.setItem(key, value)
    } catch {
      this.primaryAvailable = false
      // 内存副本已写入，调用方无需处理浏览器配额或权限异常。
    }
  }

  removeItem(key: string): void {
    this.fallback.removeItem(key)
    if (!this.primaryAvailable) return
    try {
      this.primary.removeItem(key)
    } catch {
      this.primaryAvailable = false
      // 主存储不可用时，内存副本仍保持正确状态。
    }
  }

  /** 主存储已失败、正在用内存副本支撑本会话 */
  isDegraded(): boolean {
    return !this.primaryAvailable
  }
}

/** 本模块创建过的全部存储实例（进度档与界面偏好各一个），用于降级观测 */
const trackedStorages = new Set<StorageLike>()

/**
 * 返回可用的持久化存储：优先 window.localStorage；若访问或写入被浏览器拒绝
 * （Safari 隐私模式、存储被禁用等），降级为内存存储。
 * useLabProgress 在模块加载阶段调用本函数，因此这里必须不抛--否则整个应用白屏。
 */
export function createSafeStorage(): StorageLike {
  if (typeof window === 'undefined') return new MemoryStorage()
  try {
    const storage = window.localStorage
    // Safari 隐私模式下 localStorage 对象存在但 setItem 抛 SecurityError，需实测探针
    const probe = '__hashteam_probe__'
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    const resilient = new ResilientStorage(storage)
    trackedStorages.add(resilient)
    return resilient
  } catch {
    // 探针失败即降级形态，纳入跟踪
    const memory = new MemoryStorage()
    trackedStorages.add(memory)
    return memory
  }
}

/** 任一已创建的存储实例曾发生降级（刷新后进度静默回滚的成因，随问题日志上报） */
export function isStorageDegraded(): boolean {
  for (const storage of trackedStorages) {
    if (storage.isDegraded?.() === true) return true
  }
  return false
}

export function createDefaultProgress(now: number = Date.now()): LabProgress {
  return {
    currentLevel: 1,
    completedLevels: [],
    hintsUsed: {},
    guideSteps: {},
    completedSteps: {},
    guidedAssistanceLevels: [],
    completionRecords: {},
    startedAt: now,
    updatedAt: now,
  }
}

function isValidProgress(value: unknown, totalLevels: number): value is LabProgress {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Partial<LabProgress>
  if (!isLevelNumber(p.currentLevel, totalLevels)) return false
  if (!Array.isArray(p.completedLevels)) return false
  if (p.completedLevels.some((level) => !isLevelNumber(level, totalLevels))) return false
  if (new Set(p.completedLevels).size !== p.completedLevels.length) return false
  const completedInOrder = [...p.completedLevels].sort((left, right) => left - right)
  if (completedInOrder.some((level, index) => level !== index + 1)) return false
  if (p.currentLevel > Math.min(completedInOrder.length + 1, totalLevels)) return false
  if (typeof p.hintsUsed !== 'object' || p.hintsUsed === null) return false
  if (
    Object.entries(p.hintsUsed).some(([rawLevel, count]) => {
      const level = Number(rawLevel)
      return !isLevelNumber(level, totalLevels) || !Number.isInteger(count) || count < 0
    })
  ) {
    return false
  }
  if (typeof p.guideSteps !== 'object' || p.guideSteps === null) return false
  if (
    Object.entries(p.guideSteps).some(([rawLevel, step]) => {
      const level = Number(rawLevel)
      return !isLevelNumber(level, totalLevels) || !Number.isInteger(step) || step < 0
    })
  ) {
    return false
  }
  if (typeof p.completedSteps !== 'object' || p.completedSteps === null) return false
  if (
    Object.entries(p.completedSteps).some(([rawLevel, steps]) => {
      const level = Number(rawLevel)
      return (
        !isLevelNumber(level, totalLevels) ||
        !Array.isArray(steps) ||
        steps.some((step) => !Number.isInteger(step) || step < 1) ||
        new Set(steps).size !== steps.length
      )
    })
  ) {
    return false
  }
  if (!Array.isArray(p.guidedAssistanceLevels)) return false
  if (
    p.guidedAssistanceLevels.some((level) => !isLevelNumber(level, totalLevels)) ||
    new Set(p.guidedAssistanceLevels).size !== p.guidedAssistanceLevels.length
  ) {
    return false
  }
  if (typeof p.completionRecords !== 'object' || p.completionRecords === null) return false
  if (
    Object.entries(p.completionRecords).some(([rawLevel, record]) => {
      const level = Number(rawLevel)
      if (!isLevelNumber(level, totalLevels) || !p.completedLevels?.includes(level)) return true
      if (typeof record !== 'object' || record === null) return true
      const value = record as Partial<LevelCompletionRecord>
      return (
        !['guided', 'challenge', 'mixed'].includes(value.path ?? '') ||
        !Number.isInteger(value.hintsUsed) ||
        (value.hintsUsed ?? -1) < 0 ||
        (value.hintsUsed ?? 4) > 3
      )
    })
  ) {
    return false
  }
  if (!isValidTimestamp(p.startedAt) || !isValidTimestamp(p.updatedAt)) return false
  return true
}

function isLevelNumber(value: unknown, totalLevels: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= totalLevels
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** 从存储中读取进度；数据缺失或损坏时返回全新进度 */
export function loadProgress(storage: StorageLike, totalLevels: number): LabProgress {
  const raw = storage.getItem(PROGRESS_STORAGE_KEY)
  if (raw === null) {
    const previousRaw = storage.getItem(MIGRATABLE_PROGRESS_STORAGE_KEY)
    if (previousRaw !== null) {
      try {
        const previous: unknown = JSON.parse(previousRaw)
        if (typeof previous === 'object' && previous !== null) {
          const migrated = {
            ...previous,
            guidedAssistanceLevels: [],
            completionRecords: {},
          }
          if (isValidProgress(migrated, totalLevels)) {
            storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(migrated))
            storage.removeItem(MIGRATABLE_PROGRESS_STORAGE_KEY)
            return migrated
          }
        }
      } catch {
        // 损坏的 v3 存档不能迁移，按全新进度处理。
      }
      storage.removeItem(MIGRATABLE_PROGRESS_STORAGE_KEY)
    }
    if (
      storage.getItem(LEGACY_PROGRESS_STORAGE_KEY) !== null ||
      storage.getItem(PREVIOUS_PROGRESS_STORAGE_KEY) !== null
    ) {
      storage.removeItem(LEGACY_PROGRESS_STORAGE_KEY)
      storage.removeItem(PREVIOUS_PROGRESS_STORAGE_KEY)
      storage.setItem(MIGRATION_NOTICE_STORAGE_KEY, '1')
    }
    return createDefaultProgress()
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isValidProgress(parsed, totalLevels)) return parsed
  } catch {
    // 损坏的存档：从头开始
  }
  storage.removeItem(PROGRESS_STORAGE_KEY)
  return createDefaultProgress()
}

/** 返回并消费一次性迁移提示，确保刷新后不会重复显示。 */
export function consumeProgressResetNotice(storage: StorageLike): boolean {
  const shouldShow = storage.getItem(MIGRATION_NOTICE_STORAGE_KEY) === '1'
  if (shouldShow) storage.removeItem(MIGRATION_NOTICE_STORAGE_KEY)
  return shouldShow
}

export function saveProgress(storage: StorageLike, progress: LabProgress): void {
  progress.updatedAt = Date.now()
  storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress))
}

/**
 * 标记关卡完成。
 * @returns true 表示新完成；false 表示该关卡此前已完成（不重复写入）
 */
export function completeLevel(
  storage: StorageLike,
  progress: LabProgress,
  level: number,
  record: LevelCompletionRecord,
): boolean {
  if (progress.completedLevels.includes(level)) return false
  progress.completedLevels.push(level)
  progress.completedLevels.sort((a, b) => a - b)
  progress.completionRecords[level] = {
    path: record.path,
    hintsUsed: Math.min(3, Math.max(0, Math.round(record.hintsUsed))),
  }
  saveProgress(storage, progress)
  return true
}

/** 记录一次提示使用，返回该关卡累计使用的提示数 */
export function recordHint(storage: StorageLike, progress: LabProgress, level: number): number {
  const used = Math.min((progress.hintsUsed[level] ?? 0) + 1, 3)
  progress.hintsUsed[level] = used
  saveProgress(storage, progress)
  return used
}

/** 揭示下一条 guide；返回钳制后的当前步骤索引。 */
export function advanceGuideStep(
  storage: StorageLike,
  progress: LabProgress,
  level: number,
  totalSteps: number,
): number {
  if (totalSteps <= 0) return 0
  const current = Math.min(progress.guideSteps[level] ?? 0, totalSteps - 1)
  const next = Math.min(current + 1, totalSteps - 1)
  progress.guideSteps[level] = next
  saveProgress(storage, progress)
  return next
}

export function resetLevelAttempt(
  storage: StorageLike,
  progress: LabProgress,
  level: number,
): void {
  delete progress.hintsUsed[level]
  progress.guideSteps[level] = 0
  progress.completedSteps[level] = []
  progress.guidedAssistanceLevels = progress.guidedAssistanceLevels.filter(
    (assistedLevel) => assistedLevel !== level,
  )
  saveProgress(storage, progress)
}

/** 记录本关已经展示过引导内容；重复记录不产生额外写入。 */
export function markGuidedAssistance(
  storage: StorageLike,
  progress: LabProgress,
  level: number,
): boolean {
  if (progress.guidedAssistanceLevels.includes(level)) return false
  progress.guidedAssistanceLevels.push(level)
  progress.guidedAssistanceLevels.sort((left, right) => left - right)
  saveProgress(storage, progress)
  return true
}

/** 记录一步已经通过 UI 留下必要操作/判断证据。 */
export function completeLearningStep(
  storage: StorageLike,
  progress: LabProgress,
  level: number,
  stepId: number,
): number[] {
  const completed = progress.completedSteps[level] ?? []
  if (!completed.includes(stepId)) completed.push(stepId)
  completed.sort((left, right) => left - right)
  progress.completedSteps[level] = completed
  saveProgress(storage, progress)
  return completed
}

export function setCurrentLevel(storage: StorageLike, progress: LabProgress, level: number): void {
  progress.currentLevel = level
  saveProgress(storage, progress)
}

export function resetAllProgress(storage: StorageLike): LabProgress {
  const fresh = createDefaultProgress()
  storage.removeItem(PROGRESS_STORAGE_KEY)
  saveProgress(storage, fresh)
  return fresh
}
