import type { LabProgress } from '../types/lab'

export const PROGRESS_STORAGE_KEY = 'hashteam-lab-progress-v1'

/** 可注入的存储接口，便于在测试中使用内存实现 */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function createDefaultProgress(now: number = Date.now()): LabProgress {
  return {
    currentLevel: 1,
    completedLevels: [],
    hintsUsed: {},
    startedAt: now,
    updatedAt: now,
  }
}

function isValidProgress(value: unknown, totalLevels: number): value is LabProgress {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Partial<LabProgress>
  if (typeof p.currentLevel !== 'number' || p.currentLevel < 1 || p.currentLevel > totalLevels) return false
  if (!Array.isArray(p.completedLevels)) return false
  if (p.completedLevels.some((l) => typeof l !== 'number' || l < 1 || l > totalLevels)) return false
  if (typeof p.hintsUsed !== 'object' || p.hintsUsed === null) return false
  if (typeof p.startedAt !== 'number' || typeof p.updatedAt !== 'number') return false
  return true
}

/** 从存储中读取进度；数据缺失或损坏时返回全新进度 */
export function loadProgress(storage: StorageLike, totalLevels: number): LabProgress {
  const raw = storage.getItem(PROGRESS_STORAGE_KEY)
  if (raw === null) return createDefaultProgress()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isValidProgress(parsed, totalLevels)) return parsed
  } catch {
    // 损坏的存档：从头开始
  }
  return createDefaultProgress()
}

export function saveProgress(storage: StorageLike, progress: LabProgress): void {
  progress.updatedAt = Date.now()
  storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress))
}

/**
 * 标记关卡完成。
 * @returns true 表示新完成；false 表示该关卡此前已完成（不重复写入）
 */
export function completeLevel(storage: StorageLike, progress: LabProgress, level: number): boolean {
  if (progress.completedLevels.includes(level)) return false
  progress.completedLevels.push(level)
  progress.completedLevels.sort((a, b) => a - b)
  saveProgress(storage, progress)
  return true
}

/** 记录一次提示使用，返回该关卡累计使用的提示数 */
export function recordHint(storage: StorageLike, progress: LabProgress, level: number): number {
  const used = (progress.hintsUsed[level] ?? 0) + 1
  progress.hintsUsed[level] = used
  saveProgress(storage, progress)
  return used
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
