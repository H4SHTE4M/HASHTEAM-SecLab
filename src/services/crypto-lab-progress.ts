import type { StorageLike } from './progress-store'

export const CRYPTO_LAB_PROGRESS_STORAGE_KEY = 'hashteam-cryptolab-progress-v1'

export const CRYPTO_LAB_LEVEL_IDS = [
  'level00',
  'level01',
  'level02',
  'level03',
  'sideA',
  'level04',
  'level04b',
  'sideB',
  'level05',
  'level07',
  'sideC',
] as const

export type CryptoLabLevelId = (typeof CRYPTO_LAB_LEVEL_IDS)[number]

export interface CryptoLabProgressSummary {
  completedCount: number
  solvedIds: readonly CryptoLabLevelId[]
}

const knownLevelIds = new Set<string>(CRYPTO_LAB_LEVEL_IDS)

function emptySummary(): CryptoLabProgressSummary {
  return { completedCount: 0, solvedIds: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseCryptoLabProgress(raw: string | null): CryptoLabProgressSummary {
  if (raw === null) return emptySummary()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return emptySummary()
  }

  if (!isRecord(parsed) || parsed.schemaVersion !== 1) return emptySummary()

  const solved = parsed.solved
  if (!isRecord(solved)) return emptySummary()

  const solvedEntries = Object.entries(solved)
  if (solvedEntries.some(([id, solved]) => !knownLevelIds.has(id) || typeof solved !== 'boolean')) {
    return emptySummary()
  }

  const solvedIds = CRYPTO_LAB_LEVEL_IDS.filter((id) => solved[id] === true)
  return { completedCount: solvedIds.length, solvedIds }
}

export function loadCryptoLabProgress(storage: StorageLike): CryptoLabProgressSummary {
  try {
    return parseCryptoLabProgress(storage.getItem(CRYPTO_LAB_PROGRESS_STORAGE_KEY))
  } catch {
    return emptySummary()
  }
}
