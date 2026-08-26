import { describe, expect, it } from 'vitest'
import {
  CRYPTO_LAB_LEVEL_IDS,
  CRYPTO_LAB_PROGRESS_STORAGE_KEY,
  loadCryptoLabProgress,
  parseCryptoLabProgress,
} from '../src/services/crypto-lab-progress'
import type { StorageLike } from '../src/services/progress-store'

describe('CryptoLab progress summary', () => {
  it('只统计 schema v1 中白名单关卡的 true 值', () => {
    const summary = parseCryptoLabProgress(
      JSON.stringify({
        schemaVersion: 1,
        solved: {
          level00: true,
          level01: false,
          sideA: true,
          level07: true,
        },
      }),
    )

    expect(CRYPTO_LAB_LEVEL_IDS).toHaveLength(11)
    expect(summary).toEqual({
      completedCount: 3,
      solvedIds: ['level00', 'sideA', 'level07'],
    })
  })

  it.each([
    null,
    '{broken',
    JSON.stringify([]),
    JSON.stringify({ schemaVersion: 2, solved: {} }),
    JSON.stringify({ schemaVersion: 1, solved: [] }),
    JSON.stringify({ schemaVersion: 1, solved: { unknown: true } }),
    JSON.stringify({ schemaVersion: 1, solved: { level00: 1 } }),
  ])('损坏或不受支持的存档按 0/11 处理', (raw) => {
    expect(parseCryptoLabProgress(raw)).toEqual({ completedCount: 0, solvedIds: [] })
  })

  it('通过可注入存储读取固定键，并容忍读取异常', () => {
    let requestedKey = ''
    const storage: StorageLike = {
      getItem(key) {
        requestedKey = key
        return JSON.stringify({ schemaVersion: 1, solved: { sideC: true } })
      },
      setItem() {},
      removeItem() {},
    }

    expect(loadCryptoLabProgress(storage).completedCount).toBe(1)
    expect(requestedKey).toBe(CRYPTO_LAB_PROGRESS_STORAGE_KEY)

    const throwingStorage: StorageLike = {
      getItem() {
        throw new Error('blocked')
      },
      setItem() {},
      removeItem() {},
    }
    expect(loadCryptoLabProgress(throwingStorage).completedCount).toBe(0)
  })
})
