import { describe, expect, it } from 'vitest'
import {
  detectBlockingAnomalies,
  detectLabBlockingAnomalies,
} from '../src/services/progress-anomaly'
import { createDefaultProgress } from '../src/services/progress-store'
import type { LabMode, LabProgress, LearningStep, LevelDef } from '../src/types/lab'
import { COURSE } from '../src/modules/pwnhub/course'

function makeStep(id: number): LearningStep {
  return {
    id,
    type: 'explain',
    title: `步骤 ${id}`,
    objective: '目标',
    instruction: '说明',
    completion: 'acknowledge',
    allowRun: false,
  }
}

function makeLevel(id: number, stepCount: number): LevelDef {
  return {
    id,
    name: `第 ${id} 关`,
    tagline: '',
    storySummary: '',
    story: '',
    goals: [],
    prerequisites: [],
    newConcepts: [],
    steps: Array.from({ length: stepCount }, (_, index) => makeStep(index + 1)),
    hints: [],
    verification: {
      usage: '',
      instruction: '',
      placeholders: [],
      feedback: { empty: '', incorrect: '', success: '' },
    },
    completionSummary: { solved: '', mastered: [], next: '' },
  }
}

const LEVELS = [makeLevel(1, 4), makeLevel(2, 6), makeLevel(3, 8), makeLevel(4, 8)]

function makeProgress(overrides: Partial<LabProgress>): LabProgress {
  return { ...createDefaultProgress(0), ...overrides }
}

function detect(
  overrides: Partial<LabProgress>,
  mode: LabMode | null = 'guided',
  levels: readonly LevelDef[] = LEVELS,
) {
  return detectBlockingAnomalies({ progress: makeProgress(overrides), levels, mode })
}

/** 第 3 关（8 步）异常现场：guide 越过完成前缀 */
const SOFT_LOCKED_LEVEL_3: Partial<LabProgress> = {
  currentLevel: 3,
  completedLevels: [1, 2],
  guideSteps: { 3: 7 },
  completedSteps: { 3: [1, 2, 3, 4, 5, 6] },
}

describe('detectBlockingAnomalies', () => {
  it('A 正例：guide 越过完成前缀，报出缺失步骤', () => {
    const result = detect(SOFT_LOCKED_LEVEL_3)
    expect(result.blocking).toHaveLength(1)
    const anomaly = result.blocking[0]
    expect(anomaly).toMatchObject({
      kind: 'guide-ahead-of-evidence',
      module: 'seclab',
      level: 3,
      guideStep: 7,
      missingPrefixSteps: [7],
      truncated: false,
    })
    expect('manifestMismatch' in anomaly && anomaly.manifestMismatch).toBeFalsy()
    expect(result.diagnostics).toEqual([])
  })

  it('A 负例：前缀完整（guide 恰等于前缀长度）不报', () => {
    const result = detect({
      ...SOFT_LOCKED_LEVEL_3,
      guideSteps: { 3: 6 },
    })
    expect(result.blocking).toEqual([])
    expect(result.diagnostics).toEqual([])
  })

  it('A 负例：在步中常态（当前步尚未留证据）不报', () => {
    const result = detect({
      ...SOFT_LOCKED_LEVEL_3,
      guideSteps: { 3: 2 },
      completedSteps: { 3: [1, 2] },
    })
    expect(result.blocking).toEqual([])
  })

  it('A 负例：空进度不报', () => {
    expect(detect({}).blocking).toEqual([])
  })

  it('A 负例：completed 含空洞但 guide 未越过不报（学生仍可补当前步）', () => {
    const result = detect({
      ...SOFT_LOCKED_LEVEL_3,
      guideSteps: { 3: 1 },
      completedSteps: { 3: [1, 3] },
    })
    expect(result.blocking).toEqual([])
  })

  it.each([['challenge'], [null]] as const)('mode=%s 时 A 不触发（挑战模式只凭 check 通关）', (mode) => {
    const result = detect(SOFT_LOCKED_LEVEL_3, mode)
    expect(result.blocking).toEqual([])
  })

  it('B-only：completedSteps 含超 manifest 步数 id，不弹窗只进诊断', () => {
    const result = detect({
      ...SOFT_LOCKED_LEVEL_3,
      guideSteps: { 3: 7 },
      completedSteps: { 3: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    })
    expect(result.blocking).toEqual([])
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]).toMatchObject({ kind: 'manifest-mismatch', level: 3 })
  })

  it('B-only：guide 超出 manifest 最后一步且前缀完整，不弹窗只进诊断', () => {
    const result = detect({
      ...SOFT_LOCKED_LEVEL_3,
      guideSteps: { 3: 8 },
      completedSteps: { 3: [1, 2, 3, 4, 5, 6, 7, 8] },
    })
    expect(result.blocking).toEqual([])
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0].kind).toBe('manifest-mismatch')
  })

  it('A+B 同关：manifestMismatch 并入 A 的 details', () => {
    const result = detect({
      ...SOFT_LOCKED_LEVEL_3,
      completedSteps: { 3: [1, 2, 3, 4, 5, 6, 9] },
    })
    expect(result.blocking).toHaveLength(1)
    const anomaly = result.blocking[0]
    expect(anomaly.kind).toBe('guide-ahead-of-evidence')
    if (anomaly.kind !== 'guide-ahead-of-evidence') return
    expect(anomaly.missingPrefixSteps).toEqual([7])
    expect(anomaly.manifestMismatch).toEqual({ unknownStepIds: [9], manifestStepCount: 8 })
  })

  it('非 currentLevel 的异常关不报', () => {
    const result = detect({
      currentLevel: 3,
      completedLevels: [1, 2],
      guideSteps: { 3: 0, 4: 7 },
      completedSteps: { 4: [1, 2, 3, 4, 5, 6] },
    })
    expect(result.blocking).toEqual([])
    expect(result.diagnostics).toEqual([])
  })

  it('已完成关不报（全部通关后 currentLevel 已在 completedLevels 中）', () => {
    const result = detect({
      currentLevel: 3,
      completedLevels: [1, 2, 3],
      guideSteps: { 3: 7 },
      completedSteps: { 3: [1, 2, 3, 4, 5, 6] },
    })
    expect(result.blocking).toEqual([])
  })

  it('数值防线：guide 为超大安全整数时不构造无界数组，missing 限 manifest 范围', () => {
    const result = detect({
      ...SOFT_LOCKED_LEVEL_3,
      guideSteps: { 3: Number.MAX_SAFE_INTEGER },
      completedSteps: { 3: [1, 2, 3, 4, 5, 6] },
    })
    expect(result.blocking).toHaveLength(1)
    const anomaly = result.blocking[0]
    if (anomaly.kind !== 'guide-ahead-of-evidence') throw new Error('kind 不符')
    expect(anomaly.missingPrefixSteps).toEqual([7, 8])
    expect(anomaly.truncated).toBe(true)
  })

  it.each([[Infinity], [-Infinity], [-1], [1.5], [NaN]] as const)(
    '数值防线：guide=%s 非法时按 0 处理并留诊断，不卡死',
    (badGuide) => {
      const result = detect({
        ...SOFT_LOCKED_LEVEL_3,
        guideSteps: { 3: badGuide },
      })
      expect(result.blocking).toEqual([])
      expect(result.diagnostics).toHaveLength(1)
      expect(result.diagnostics[0].kind).toBe('invalid-guide-step')
    },
  )

  it('数值防线：unknownStepIds 诊断截断到 20 个', () => {
    const flooded = [
      1, 2, 3, 4, 5, 6,
      ...Array.from({ length: 32 }, (_, index) => index + 9),
    ]
    const result = detect({
      ...SOFT_LOCKED_LEVEL_3,
      completedSteps: { 3: flooded },
    })
    expect(result.blocking).toHaveLength(1)
    const anomaly = result.blocking[0]
    if (anomaly.kind !== 'guide-ahead-of-evidence') throw new Error('kind 不符')
    expect(anomaly.manifestMismatch?.unknownStepIds).toHaveLength(20)
  })
})

describe('detectLabBlockingAnomalies', () => {
  function detectLab(
    overrides: Partial<LabProgress>,
    mode: LabMode | null = 'guided',
  ) {
    return detectLabBlockingAnomalies({
      progress: makeProgress(overrides),
      labs: COURSE.labs,
      mode,
    })
  }

  it('稳定 labId 的 guide 越过证据前缀时阻断当前实验', () => {
    const result = detectLab({
      currentLabId: 'memory-addresses-01',
      labGuideSteps: { 'memory-addresses-01': 2 },
      labCompletedSteps: { 'memory-addresses-01': [1] },
    })
    expect(result.blocking).toEqual([
      {
        kind: 'lab-guide-ahead-of-evidence',
        module: 'pwnhub',
        labId: 'memory-addresses-01',
        guideStep: 2,
        missingPrefixSteps: [2],
        truncated: false,
      },
    ])
  })

  it('挑战模式或已完成实验不触发阻断', () => {
    const state = {
      currentLabId: 'memory-addresses-01',
      labGuideSteps: { 'memory-addresses-01': 2 },
      labCompletedSteps: { 'memory-addresses-01': [1] },
    }
    expect(detectLab(state, 'challenge').blocking).toEqual([])
    expect(
      detectLab({
        ...state,
        completedLabIds: ['memory-addresses-01'],
      }).blocking,
    ).toEqual([])
  })

  it('非法 guide 值只留诊断，不构造无界缺失数组', () => {
    const result = detectLab({
      currentLabId: 'memory-addresses-01',
      labGuideSteps: { 'memory-addresses-01': Number.POSITIVE_INFINITY },
      labCompletedSteps: { 'memory-addresses-01': [1] },
    })
    expect(result.blocking).toEqual([])
    expect(result.diagnostics[0]).toMatchObject({
      kind: 'invalid-guide-step',
      module: 'pwnhub',
      labId: 'memory-addresses-01',
    })
  })
})
