import type { LabProgress, LevelCompletionRecord } from '../types/lab'
import {
  chapterIdForLegacyLevel,
  createStableProgressFields,
  legacyLabId,
} from './course-progress'

export const PROGRESS_STORAGE_KEY = 'hashteam-lab-progress-v6'
export const LEGACY_PROGRESS_STORAGE_KEY = 'hashteam-lab-progress-v1'
export const PREVIOUS_PROGRESS_STORAGE_KEY = 'hashteam-lab-progress-v2'
/** v3 是已有线上存档的迁移入口，保留导出名供旧客户端测试和用户存档使用。 */
export const MIGRATABLE_PROGRESS_STORAGE_KEY = 'hashteam-lab-progress-v3'
export const V4_PROGRESS_STORAGE_KEY = 'hashteam-lab-progress-v4'
export const V5_PROGRESS_STORAGE_KEY = 'hashteam-lab-progress-v5'
const MIGRATION_NOTICE_STORAGE_KEY = 'hashteam-lab-progress-v6-migration-notice'

/** 可注入的存储接口，便于在测试中使用内存实现 */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  /** 持久化是否已降级；问题日志用。 */
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

  isDegraded(): boolean {
    return !this.primaryAvailable
  }
}

const trackedStorages = new Set<StorageLike>()
const storageTotalLevels = new WeakMap<StorageLike, number>()

/**
 * 返回可用的持久化存储：优先 window.localStorage；若访问或写入被浏览器拒绝
 * （Safari 隐私模式、存储被禁用等），降级为内存存储。
 * useLabProgress 在模块加载阶段调用本函数，因此这里必须不抛--否则整个应用白屏。
 */
export function createSafeStorage(): StorageLike {
  if (typeof window === 'undefined') {
    const memory = new MemoryStorage()
    trackedStorages.add(memory)
    return memory
  }
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
    const memory = new MemoryStorage()
    trackedStorages.add(memory)
    return memory
  }
}

export function isStorageDegraded(): boolean {
  for (const storage of trackedStorages) {
    if (storage.isDegraded?.() === true) return true
  }
  return false
}

export function createDefaultProgress(now: number = Date.now()): LabProgress {
  const stable = createStableProgressFields(1, [])
  return {
    schemaVersion: 6,
    currentLevel: 1,
    ...stable,
    completedLevels: [],
    labHintsUsed: {},
    labGuideSteps: {},
    labCompletedSteps: {},
    guidedAssistanceLabIds: [],
    labCompletionRecords: {},
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
  if (p.schemaVersion !== 6) return false
  if (!isLevelNumber(p.currentLevel, totalLevels)) return false
  if (!isLabId(p.currentLabId)) return false
  if (!Array.isArray(p.completedLevels)) return false
  if (
    !Array.isArray(p.completedLabIds) ||
    p.completedLabIds.some((labId) => !isLabId(labId)) ||
    new Set(p.completedLabIds).size !== p.completedLabIds.length
  ) {
    return false
  }
  if (p.completedLevels.some((level) => !isLevelNumber(level, totalLevels))) return false
  if (new Set(p.completedLevels).size !== p.completedLevels.length) return false
  if (p.completedLevels.some((level) => !p.completedLabIds?.includes(legacyLabId(level)))) return false
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
  if (typeof p.chapterProgress !== 'object' || p.chapterProgress === null) return false
  if (
    Object.entries(p.chapterProgress).some(
      ([chapterId, labIds]) =>
        chapterId.length === 0 ||
        !Array.isArray(labIds) ||
        labIds.some((labId) => typeof labId !== 'string' || !p.completedLabIds?.includes(labId)),
    )
  ) {
    return false
  }
  if (!isValidLabNumberMap(p.labHintsUsed, totalLevels, 'hint')) return false
  if (!isValidLabNumberMap(p.labGuideSteps, totalLevels, 'guide')) return false
  if (!isValidLabStepsMap(p.labCompletedSteps)) return false
  if (
    !Array.isArray(p.guidedAssistanceLabIds) ||
    p.guidedAssistanceLabIds.some((labId) => !isLabId(labId)) ||
    new Set(p.guidedAssistanceLabIds).size !== p.guidedAssistanceLabIds.length
  ) {
    return false
  }
  if (typeof p.labCompletionRecords !== 'object' || p.labCompletionRecords === null) return false
  if (
    Object.entries(p.labCompletionRecords).some(
      ([labId, record]) =>
        !p.completedLabIds?.includes(labId) || !isCompletionRecord(record),
    )
  ) {
    return false
  }
  if (typeof p.completionRecords !== 'object' || p.completionRecords === null) return false
  if (
    Object.entries(p.completionRecords).some(([rawLevel, record]) => {
      const level = Number(rawLevel)
      if (!isLevelNumber(level, totalLevels) || !p.completedLevels?.includes(level)) return true
      return !isCompletionRecord(record)
    })
  ) {
    return false
  }
  if (!isValidTimestamp(p.startedAt) || !isValidTimestamp(p.updatedAt)) return false
  return true
}

function normalizeProgress(value: unknown, totalLevels: number): LabProgress | null {
  if (typeof value !== 'object' || value === null) return null
  const source = value as Partial<LabProgress>
  if (!isLevelNumber(source.currentLevel, totalLevels) || !Array.isArray(source.completedLevels)) {
    return null
  }
  const stable = createStableProgressFields(source.currentLevel, source.completedLevels)
  const hintsUsed = source.hintsUsed ?? {}
  const guideSteps = source.guideSteps ?? {}
  const completedSteps = source.completedSteps ?? {}
  const guidedAssistanceLevels = source.guidedAssistanceLevels ?? []
  const completionRecords = source.completionRecords ?? {}
  const completedLabIds = [
    ...new Set([
      ...(Array.isArray(source.completedLabIds)
        ? source.completedLabIds.filter(isLabId)
        : []),
      ...stable.completedLabIds,
    ]),
  ]
  const labHintsUsed =
    typeof source.labHintsUsed === 'object' && source.labHintsUsed !== null
      ? source.labHintsUsed
      : mapLegacyRecord(hintsUsed)
  const labGuideSteps =
    typeof source.labGuideSteps === 'object' && source.labGuideSteps !== null
      ? source.labGuideSteps
      : mapLegacyRecord(guideSteps)
  const labCompletedSteps =
    typeof source.labCompletedSteps === 'object' && source.labCompletedSteps !== null
      ? source.labCompletedSteps
      : mapLegacyRecord(completedSteps)
  const guidedAssistanceLabIds =
    Array.isArray(source.guidedAssistanceLabIds)
      ? source.guidedAssistanceLabIds
      : guidedAssistanceLevels.map(legacyLabId)
  const labCompletionRecords =
    typeof source.labCompletionRecords === 'object' && source.labCompletionRecords !== null
      ? source.labCompletionRecords
      : mapLegacyRecord(completionRecords)
  const candidate = {
    ...source,
    schemaVersion: 6 as const,
    currentLabId:
      isLabId(source.currentLabId)
        ? source.currentLabId
        : stable.currentLabId,
    completedLabIds,
    chapterProgress:
      typeof source.chapterProgress === 'object' && source.chapterProgress !== null
        ? source.chapterProgress
        : stable.chapterProgress,
    labHintsUsed,
    labGuideSteps,
    labCompletedSteps,
    guidedAssistanceLabIds,
    labCompletionRecords,
    hintsUsed,
    guideSteps,
    completedSteps,
    guidedAssistanceLevels,
    completionRecords,
  }
  return isValidProgress(candidate, totalLevels) ? candidate : null
}

interface PersistProgressOptions {
  keepLocalSelection?: boolean
  replace?: boolean
  resetLevels?: readonly number[]
  resetLabIds?: readonly string[]
}

/** 解析 storage 事件或写前快照；只接受可规范化的 v6 数据，不触发迁移或回写。 */
export function parseProgressSnapshot(raw: string, totalLevels: number): LabProgress | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as Partial<LabProgress>).schemaVersion !== 6
    ) {
      return null
    }
    return normalizeProgress(parsed, totalLevels)
  } catch {
    return null
  }
}

function readCurrentProgress(storage: StorageLike): LabProgress | null {
  const totalLevels = storageTotalLevels.get(storage)
  if (totalLevels === undefined) return null
  const raw = storage.getItem(PROGRESS_STORAGE_KEY)
  return raw === null ? null : parseProgressSnapshot(raw, totalLevels)
}

/** 用独立容器替换单例字段，既触发 Vue reactive 更新，也不共享外部快照引用。 */
export function applyProgressSnapshot(target: LabProgress, source: LabProgress): void {
  target.schemaVersion = source.schemaVersion
  target.currentLevel = source.currentLevel
  target.currentLabId = source.currentLabId
  target.completedLevels = [...source.completedLevels]
  target.completedLabIds = [...source.completedLabIds]
  target.chapterProgress = Object.fromEntries(
    Object.entries(source.chapterProgress).map(([chapterId, labIds]) => [
      chapterId,
      [...labIds],
    ]),
  )
  target.labHintsUsed = { ...source.labHintsUsed }
  target.labGuideSteps = { ...source.labGuideSteps }
  target.labCompletedSteps = Object.fromEntries(
    Object.entries(source.labCompletedSteps).map(([labId, steps]) => [labId, [...steps]]),
  )
  target.guidedAssistanceLabIds = [...source.guidedAssistanceLabIds]
  target.labCompletionRecords = { ...source.labCompletionRecords }
  target.hintsUsed = { ...source.hintsUsed }
  target.guideSteps = { ...source.guideSteps }
  target.completedSteps = Object.fromEntries(
    Object.entries(source.completedSteps).map(([level, steps]) => [level, [...steps]]),
  )
  target.guidedAssistanceLevels = [...source.guidedAssistanceLevels]
  target.completionRecords = { ...source.completionRecords }
  target.startedAt = source.startedAt
  target.updatedAt = source.updatedAt
}

/**
 * 选关越界钳制：完成集收缩（如另一标签重置全部进度）后，本地选关可能超出
 * 可解锁范围；钳回上限并保持 legacy 选关对（currentLevel/currentLabId）一致。
 * 与 isValidProgress 的上限规则一致：currentLevel ≤ 已完成数 + 1。
 */
function clampSelectionToCompletion(progress: LabProgress, totalLevels: number): void {
  const maxLevel = Math.min(progress.completedLevels.length + 1, totalLevels)
  if (progress.currentLevel <= maxLevel) return
  const previousLevel = progress.currentLevel
  progress.currentLevel = maxLevel
  if (progress.currentLabId === legacyLabId(previousLevel)) {
    progress.currentLabId = legacyLabId(maxLevel)
  }
}

/**
 * 把外部快照（storage 事件、写前读到的较新落盘档）套用到内存单例：
 * 完成记录等数据字段全部采纳，但选关保留本地——本标签的界面必须跟随本地
 * 终端环境，不能被其他标签的导航拽走；仅当完成集收缩使本地选关越界时钳制。
 */
export function applySyncedProgress(
  target: LabProgress,
  source: LabProgress,
  totalLevels: number,
): void {
  const { currentLevel, currentLabId } = target
  applyProgressSnapshot(target, source)
  target.currentLevel = currentLevel
  target.currentLabId = currentLabId
  clampSelectionToCompletion(target, totalLevels)
}

function cloneProgress(progress: LabProgress): LabProgress {
  const clone = createDefaultProgress(progress.startedAt)
  applyProgressSnapshot(clone, progress)
  return clone
}

function mergeNumberMaps(
  local: Record<string, number>,
  stored: Record<string, number>,
): Record<string, number> {
  const merged = { ...local }
  for (const [key, value] of Object.entries(stored)) {
    merged[key] = Math.max(merged[key] ?? 0, value)
  }
  return merged
}

function mergeStepMaps(
  local: Record<string, number[]>,
  stored: Record<string, number[]>,
): Record<string, number[]> {
  const keys = new Set([...Object.keys(stored), ...Object.keys(local)])
  return Object.fromEntries(
    [...keys].map((key) => [
      key,
      [...new Set([...(stored[key] ?? []), ...(local[key] ?? [])])].sort(
        (left, right) => left - right,
      ),
    ]),
  )
}

function mergeProgressSnapshots(
  local: LabProgress,
  stored: LabProgress,
  options: PersistProgressOptions = {},
): LabProgress {
  const completedLevels = [...new Set([...stored.completedLevels, ...local.completedLevels])].sort(
    (left, right) => left - right,
  )
  const completedLabIds = [...new Set([...stored.completedLabIds, ...local.completedLabIds])]
  const chapterIds = new Set([
    ...Object.keys(stored.chapterProgress),
    ...Object.keys(local.chapterProgress),
  ])
  const chapterProgress = Object.fromEntries(
    [...chapterIds].map((chapterId) => [
      chapterId,
      [
        ...new Set([
          ...(stored.chapterProgress[chapterId] ?? []),
          ...(local.chapterProgress[chapterId] ?? []),
        ]),
      ],
    ]),
  )
  const merged: LabProgress = {
    schemaVersion: 6,
    currentLevel: options.keepLocalSelection ? local.currentLevel : stored.currentLevel,
    currentLabId: options.keepLocalSelection ? local.currentLabId : stored.currentLabId,
    completedLevels,
    completedLabIds,
    chapterProgress,
    labHintsUsed: mergeNumberMaps(local.labHintsUsed, stored.labHintsUsed),
    labGuideSteps: mergeNumberMaps(local.labGuideSteps, stored.labGuideSteps),
    labCompletedSteps: mergeStepMaps(local.labCompletedSteps, stored.labCompletedSteps),
    guidedAssistanceLabIds: [
      ...new Set([...stored.guidedAssistanceLabIds, ...local.guidedAssistanceLabIds]),
    ],
    // 已落盘的首次完成记录优先，迟到的旧标签不能覆盖它。
    labCompletionRecords: { ...local.labCompletionRecords, ...stored.labCompletionRecords },
    hintsUsed: mergeNumberMaps(
      local.hintsUsed as Record<string, number>,
      stored.hintsUsed as Record<string, number>,
    ),
    guideSteps: mergeNumberMaps(
      local.guideSteps as Record<string, number>,
      stored.guideSteps as Record<string, number>,
    ),
    completedSteps: mergeStepMaps(
      local.completedSteps as Record<string, number[]>,
      stored.completedSteps as Record<string, number[]>,
    ),
    guidedAssistanceLevels: [
      ...new Set([...stored.guidedAssistanceLevels, ...local.guidedAssistanceLevels]),
    ].sort((left, right) => left - right),
    completionRecords: { ...local.completionRecords, ...stored.completionRecords },
    startedAt: Math.min(local.startedAt, stored.startedAt),
    updatedAt: Math.max(local.updatedAt, stored.updatedAt),
  }

  for (const level of options.resetLevels ?? []) {
    delete merged.hintsUsed[level]
    merged.guideSteps[level] = 0
    merged.completedSteps[level] = []
    merged.guidedAssistanceLevels = merged.guidedAssistanceLevels.filter(
      (assistedLevel) => assistedLevel !== level,
    )
  }
  for (const labId of options.resetLabIds ?? []) {
    delete merged.labHintsUsed[labId]
    merged.labGuideSteps[labId] = 0
    merged.labCompletedSteps[labId] = []
    merged.guidedAssistanceLabIds = merged.guidedAssistanceLabIds.filter(
      (assistedLabId) => assistedLabId !== labId,
    )
  }
  return merged
}

function syncBeforeMutation(storage: StorageLike, progress: LabProgress): void {
  const totalLevels = storageTotalLevels.get(storage)
  if (totalLevels === undefined) return
  const stored = readCurrentProgress(storage)
  if (stored === null) return
  // 每个公开操作都会先同步、再只修改本次目标字段。较新的落盘快照的数据字段
  // 必须整体优先，否则旧标签的旧 attempt 字段会在操作其他实验时通过并集合并
  // 复活；选关除外——始终保留本地，其他标签不能把本标签界面拽离终端所在关。
  const next =
    stored.startedAt > progress.startedAt || stored.updatedAt > progress.updatedAt
      ? stored
      : mergeProgressSnapshots(progress, stored)
  applySyncedProgress(progress, next, totalLevels)
}

function persistProgress(
  storage: StorageLike,
  progress: LabProgress,
  options: PersistProgressOptions = {},
): void {
  const totalLevels = storageTotalLevels.get(storage)
  const stored = options.replace ? null : readCurrentProgress(storage)
  const next =
    stored === null
      ? cloneProgress(progress)
      : stored.startedAt > progress.startedAt
        ? cloneProgress(stored)
        : mergeProgressSnapshots(progress, stored, options)
  next.updatedAt = Math.max(Date.now(), next.updatedAt + 1, (stored?.updatedAt ?? 0) + 1)
  // 落盘内容沿用既有规则（仅导航通过 keepLocalSelection 导出选关）；内存单例的
  // 选关始终保留本地，防止其他标签的选关借回写把本标签界面拽离终端所在关。
  if (totalLevels === undefined) {
    applyProgressSnapshot(progress, next)
  } else {
    applySyncedProgress(progress, next, totalLevels)
  }
  storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(next))
}

function mapLegacyRecord<T>(record: Record<number, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).map(([level, item]) => [legacyLabId(Number(level)), item]),
  )
}

function migrateProgress(raw: string, totalLevels: number): LabProgress | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    return normalizeProgress(parsed, totalLevels)
  } catch {
    return null
  }
}

function isLevelNumber(value: unknown, totalLevels: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= totalLevels
}

const LAB_ID_PATTERN = /^[a-z][a-z0-9-]{0,95}$/

function isLabId(value: unknown): value is string {
  return typeof value === 'string' && LAB_ID_PATTERN.test(value)
}

function isCompletionRecord(value: unknown): value is LevelCompletionRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Partial<LevelCompletionRecord>
  return (
    ['guided', 'challenge', 'mixed'].includes(record.path ?? '') &&
    Number.isInteger(record.hintsUsed) &&
    (record.hintsUsed ?? -1) >= 0 &&
    (record.hintsUsed ?? 4) <= 3
  )
}

function isValidLabNumberMap(
  value: unknown,
  _totalLevels: number,
  kind: 'hint' | 'guide',
): value is Record<string, number> {
  if (typeof value !== 'object' || value === null) return false
  return !Object.entries(value).some(([labId, count]) => {
    if (!isLabId(labId) || !Number.isInteger(count) || (count as number) < 0) return true
    return kind === 'hint' && (count as number) > 3
  })
}

function isValidLabStepsMap(value: unknown): value is Record<string, number[]> {
  if (typeof value !== 'object' || value === null) return false
  return !Object.entries(value).some(
    ([labId, steps]) =>
      !isLabId(labId) ||
      !Array.isArray(steps) ||
      steps.some((step) => !Number.isInteger(step) || step < 1) ||
      new Set(steps).size !== steps.length,
  )
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** 从存储中读取进度；数据缺失或损坏时返回全新进度 */
export function loadProgress(storage: StorageLike, totalLevels: number): LabProgress {
  storageTotalLevels.set(storage, totalLevels)
  const raw = storage.getItem(PROGRESS_STORAGE_KEY)
  if (raw === null) {
    const migratableKeys = [
      V5_PROGRESS_STORAGE_KEY,
      V4_PROGRESS_STORAGE_KEY,
      MIGRATABLE_PROGRESS_STORAGE_KEY,
      PREVIOUS_PROGRESS_STORAGE_KEY,
      LEGACY_PROGRESS_STORAGE_KEY,
    ]
    for (const key of migratableKeys) {
      const previousRaw = storage.getItem(key)
      if (previousRaw === null) continue
      const migrated = migrateProgress(previousRaw, totalLevels)
      if (migrated !== null) {
        storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(migrated))
        return migrated
      }
    }
    const hasUnmigratedProgress = migratableKeys.some((key) => storage.getItem(key) !== null)
    if (hasUnmigratedProgress) storage.setItem(MIGRATION_NOTICE_STORAGE_KEY, '1')
    const fresh = createDefaultProgress()
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(fresh))
    return fresh
  }
  const normalized = migrateProgress(raw, totalLevels)
  if (normalized !== null) {
    if (JSON.stringify(normalized) !== raw) {
      storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(normalized))
    }
    return normalized
  }
  storage.setItem(MIGRATION_NOTICE_STORAGE_KEY, '1')
  const fresh = createDefaultProgress()
  storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(fresh))
  return fresh
}

/** 返回并消费一次性迁移提示，确保刷新后不会重复显示。 */
export function consumeProgressResetNotice(storage: StorageLike): boolean {
  const shouldShow = storage.getItem(MIGRATION_NOTICE_STORAGE_KEY) === '1'
  if (shouldShow) storage.removeItem(MIGRATION_NOTICE_STORAGE_KEY)
  return shouldShow
}

export function saveProgress(storage: StorageLike, progress: LabProgress): void {
  persistProgress(storage, progress)
}

interface LegacyV4Progress {
  currentLevel: number
  completedLevels: number[]
  hintsUsed: Record<number, number>
  guideSteps: Record<number, number>
  completedSteps: Record<number, number[]>
  guidedAssistanceLevels: number[]
  completionRecords: Record<number, LevelCompletionRecord>
  startedAt: number
  updatedAt: number
}

function saveLevelProgress(
  storage: StorageLike,
  progress: LabProgress,
  options: PersistProgressOptions = {},
): void {
  persistProgress(storage, progress, options)
  const legacy: LegacyV4Progress = {
    currentLevel: progress.currentLevel,
    completedLevels: [...progress.completedLevels],
    hintsUsed: { ...progress.hintsUsed },
    guideSteps: { ...progress.guideSteps },
    completedSteps: Object.fromEntries(
      Object.entries(progress.completedSteps).map(([level, steps]) => [level, [...steps]]),
    ),
    guidedAssistanceLevels: [...progress.guidedAssistanceLevels],
    completionRecords: { ...progress.completionRecords },
    startedAt: progress.startedAt,
    updatedAt: progress.updatedAt,
  }
  storage.setItem(V4_PROGRESS_STORAGE_KEY, JSON.stringify(legacy))
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
  syncBeforeMutation(storage, progress)
  if (progress.completedLevels.includes(level)) return false
  progress.completedLevels.push(level)
  progress.completedLevels.sort((a, b) => a - b)
  progress.completionRecords[level] = {
    path: record.path,
    hintsUsed: Math.min(3, Math.max(0, Math.round(record.hintsUsed))),
  }
  const labId = legacyLabId(level)
  if (!progress.completedLabIds.includes(labId)) progress.completedLabIds.push(labId)
  progress.labCompletionRecords[labId] = progress.completionRecords[level]
  const chapterId = chapterIdForLegacyLevel(level)
  const chapterLabs = progress.chapterProgress[chapterId] ?? []
  if (!chapterLabs.includes(labId)) chapterLabs.push(labId)
  progress.chapterProgress[chapterId] = chapterLabs
  saveLevelProgress(storage, progress)
  return true
}

/** 标记稳定实验完成；新实验不会占用或伪造数字关卡编号。 */
export function completeLab(
  storage: StorageLike,
  progress: LabProgress,
  labId: string,
  chapterId: string,
  record: LevelCompletionRecord,
): boolean {
  if (!isLabId(labId) || !isLabId(chapterId)) return false
  syncBeforeMutation(storage, progress)
  if (progress.completedLabIds.includes(labId)) return false
  progress.completedLabIds.push(labId)
  progress.labCompletionRecords[labId] = {
    path: record.path,
    hintsUsed: Math.min(3, Math.max(0, Math.round(record.hintsUsed))),
  }
  const chapterLabs = progress.chapterProgress[chapterId] ?? []
  if (!chapterLabs.includes(labId)) chapterLabs.push(labId)
  progress.chapterProgress[chapterId] = chapterLabs
  saveProgress(storage, progress)
  return true
}

/** 记录一次提示使用，返回该关卡累计使用的提示数 */
export function recordHint(storage: StorageLike, progress: LabProgress, level: number): number {
  syncBeforeMutation(storage, progress)
  const used = Math.min((progress.hintsUsed[level] ?? 0) + 1, 3)
  progress.hintsUsed[level] = used
  progress.labHintsUsed[legacyLabId(level)] = used
  saveLevelProgress(storage, progress)
  return progress.hintsUsed[level] ?? used
}

export function recordLabHint(storage: StorageLike, progress: LabProgress, labId: string): number {
  if (!isLabId(labId)) return 0
  syncBeforeMutation(storage, progress)
  const used = Math.min((progress.labHintsUsed[labId] ?? 0) + 1, 3)
  progress.labHintsUsed[labId] = used
  saveProgress(storage, progress)
  return progress.labHintsUsed[labId] ?? used
}

/** 揭示下一条 guide；返回钳制后的当前步骤索引。 */
export function advanceGuideStep(
  storage: StorageLike,
  progress: LabProgress,
  level: number,
  totalSteps: number,
): number {
  if (totalSteps <= 0) return 0
  syncBeforeMutation(storage, progress)
  const current = Math.min(progress.guideSteps[level] ?? 0, totalSteps - 1)
  const next = Math.min(current + 1, totalSteps - 1)
  progress.guideSteps[level] = next
  progress.labGuideSteps[legacyLabId(level)] = next
  saveLevelProgress(storage, progress)
  return progress.guideSteps[level] ?? next
}

export function advanceLabGuideStep(
  storage: StorageLike,
  progress: LabProgress,
  labId: string,
  totalSteps: number,
): number {
  if (!isLabId(labId) || totalSteps <= 0) return 0
  syncBeforeMutation(storage, progress)
  const current = Math.min(progress.labGuideSteps[labId] ?? 0, totalSteps - 1)
  const next = Math.min(current + 1, totalSteps - 1)
  progress.labGuideSteps[labId] = next
  saveProgress(storage, progress)
  return progress.labGuideSteps[labId] ?? next
}

export function resetLevelAttempt(
  storage: StorageLike,
  progress: LabProgress,
  level: number,
): void {
  syncBeforeMutation(storage, progress)
  delete progress.hintsUsed[level]
  progress.guideSteps[level] = 0
  progress.completedSteps[level] = []
  progress.guidedAssistanceLevels = progress.guidedAssistanceLevels.filter(
    (assistedLevel) => assistedLevel !== level,
  )
  resetLabAttemptFields(progress, legacyLabId(level))
  const labId = legacyLabId(level)
  saveLevelProgress(storage, progress, { resetLevels: [level], resetLabIds: [labId] })
}

function resetLabAttemptFields(progress: LabProgress, labId: string): void {
  delete progress.labHintsUsed[labId]
  progress.labGuideSteps[labId] = 0
  progress.labCompletedSteps[labId] = []
  progress.guidedAssistanceLabIds = progress.guidedAssistanceLabIds.filter(
    (assistedLabId) => assistedLabId !== labId,
  )
}

export function resetLabAttempt(
  storage: StorageLike,
  progress: LabProgress,
  labId: string,
): void {
  if (!isLabId(labId)) return
  syncBeforeMutation(storage, progress)
  resetLabAttemptFields(progress, labId)
  persistProgress(storage, progress, { resetLabIds: [labId] })
}

/** 记录本关已经展示过引导内容；重复记录不产生额外写入。 */
export function markGuidedAssistance(
  storage: StorageLike,
  progress: LabProgress,
  level: number,
): boolean {
  syncBeforeMutation(storage, progress)
  if (progress.guidedAssistanceLevels.includes(level)) return false
  progress.guidedAssistanceLevels.push(level)
  progress.guidedAssistanceLevels.sort((left, right) => left - right)
  const labId = legacyLabId(level)
  if (!progress.guidedAssistanceLabIds.includes(labId)) {
    progress.guidedAssistanceLabIds.push(labId)
  }
  saveLevelProgress(storage, progress)
  return true
}

export function markLabGuidedAssistance(
  storage: StorageLike,
  progress: LabProgress,
  labId: string,
): boolean {
  if (!isLabId(labId)) return false
  syncBeforeMutation(storage, progress)
  if (progress.guidedAssistanceLabIds.includes(labId)) return false
  progress.guidedAssistanceLabIds.push(labId)
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
  syncBeforeMutation(storage, progress)
  const completed = progress.completedSteps[level] ?? []
  if (!completed.includes(stepId)) completed.push(stepId)
  completed.sort((left, right) => left - right)
  progress.completedSteps[level] = completed
  progress.labCompletedSteps[legacyLabId(level)] = [...completed]
  saveLevelProgress(storage, progress)
  return progress.completedSteps[level] ?? completed
}

export function completeLabLearningStep(
  storage: StorageLike,
  progress: LabProgress,
  labId: string,
  stepId: number,
): number[] {
  if (!isLabId(labId) || !Number.isInteger(stepId) || stepId < 1) return []
  syncBeforeMutation(storage, progress)
  const completed = progress.labCompletedSteps[labId] ?? []
  if (!completed.includes(stepId)) completed.push(stepId)
  completed.sort((left, right) => left - right)
  progress.labCompletedSteps[labId] = completed
  saveProgress(storage, progress)
  return progress.labCompletedSteps[labId] ?? completed
}

export function setCurrentLevel(storage: StorageLike, progress: LabProgress, level: number): void {
  syncBeforeMutation(storage, progress)
  progress.currentLevel = level
  progress.currentLabId = legacyLabId(level)
  saveLevelProgress(storage, progress, { keepLocalSelection: true })
}

export function setCurrentLab(
  storage: StorageLike,
  progress: LabProgress,
  labId: string,
  legacyLevel?: number,
): void {
  if (!isLabId(labId)) return
  syncBeforeMutation(storage, progress)
  progress.currentLabId = labId
  if (legacyLevel !== undefined) progress.currentLevel = legacyLevel
  persistProgress(storage, progress, { keepLocalSelection: true })
}

export function resetAllProgress(storage: StorageLike): LabProgress {
  const stored = readCurrentProgress(storage)
  const resetAt = Math.max(Date.now(), (stored?.startedAt ?? 0) + 1)
  const fresh = createDefaultProgress(resetAt)
  saveLevelProgress(storage, fresh, { replace: true })
  return fresh
}
