import { describe, expect, it } from 'vitest'
import { createAnomalyCenter } from '../src/services/anomaly-center'
import type { BlockingAnomaly } from '../src/services/progress-anomaly'

const GUIDE_AHEAD_3 = {
  kind: 'guide-ahead-of-evidence',
  module: 'seclab',
  level: 3,
  guideStep: 7,
  missingPrefixSteps: [7],
  truncated: false,
} satisfies BlockingAnomaly

const GUIDE_AHEAD_4 = {
  kind: 'guide-ahead-of-evidence',
  module: 'seclab',
  level: 4,
  guideStep: 5,
  missingPrefixSteps: [5],
  truncated: false,
} satisfies BlockingAnomaly

const LAB_GUIDE_AHEAD = {
  kind: 'lab-guide-ahead-of-evidence',
  module: 'pwnhub',
  labId: 'memory-addresses-01',
  guideStep: 2,
  missingPrefixSteps: [2],
  truncated: false,
} satisfies BlockingAnomaly

const MISSING_KEY = {
  kind: 'missing-session-key',
  module: 'seclab',
  keyPresent: false,
} satisfies BlockingAnomaly
const PWNHUB_MISSING_KEY = {
  kind: 'missing-session-key',
  module: 'pwnhub',
  keyPresent: false,
} satisfies BlockingAnomaly
const CRYPTO_UNAVAILABLE = {
  kind: 'crypto-unavailable',
  module: 'seclab',
  isSecureContext: false,
} satisfies BlockingAnomaly

describe('createAnomalyCenter', () => {
  it('按 module 返回各自队首，不让两个工作台串台', () => {
    const center = createAnomalyCenter()
    center.report(GUIDE_AHEAD_3)
    center.report(PWNHUB_MISSING_KEY)
    expect(center.pendingFor('seclab')).toEqual(GUIDE_AHEAD_3)
    expect(center.pendingFor('pwnhub')).toEqual(PWNHUB_MISSING_KEY)
  })

  it('同 key 重复 report 不双弹', () => {
    const center = createAnomalyCenter()
    center.report(GUIDE_AHEAD_3)
    center.report({ ...GUIDE_AHEAD_3, guideStep: 99, missingPrefixSteps: [5, 6, 7] })
    expect(center.detected.value).toHaveLength(1)
  })

  it('相同运行时异常在不同 module 中是独立事件', () => {
    const center = createAnomalyCenter()
    center.report(MISSING_KEY)
    center.report(PWNHUB_MISSING_KEY)
    expect(center.detected.value).toHaveLength(2)
  })

  it('不同 key 各自入队并保持顺序', () => {
    const center = createAnomalyCenter()
    center.report(GUIDE_AHEAD_3)
    center.report(MISSING_KEY)
    center.report(GUIDE_AHEAD_4)
    center.report(CRYPTO_UNAVAILABLE)
    expect(center.detected.value.map((anomaly) => anomaly.kind)).toEqual([
      'guide-ahead-of-evidence',
      'missing-session-key',
      'guide-ahead-of-evidence',
      'crypto-unavailable',
    ])
    center.dismiss(GUIDE_AHEAD_3)
    expect(center.pendingPopup.value).toEqual(MISSING_KEY)
  })

  it('dismiss 后同 key 不再弹', () => {
    const center = createAnomalyCenter()
    center.report(GUIDE_AHEAD_3)
    center.dismiss(GUIDE_AHEAD_3)
    center.report(GUIDE_AHEAD_3)
    expect(center.pendingFor('seclab')).toBeNull()
  })

  it('resolve 后同 key 再次发生可以重弹', () => {
    const center = createAnomalyCenter()
    center.report(GUIDE_AHEAD_3)
    center.resolve(GUIDE_AHEAD_3)
    center.report(GUIDE_AHEAD_3)
    expect(center.pendingFor('seclab')).toEqual(GUIDE_AHEAD_3)
  })

  it('reconcile 只撤销指定 module 的进度异常，保留运行时和另一 module', () => {
    const center = createAnomalyCenter()
    center.report(GUIDE_AHEAD_3)
    center.report(MISSING_KEY)
    center.report(LAB_GUIDE_AHEAD)
    center.reconcile('seclab', [])
    expect(center.detected.value).toEqual([MISSING_KEY, LAB_GUIDE_AHEAD])
  })

  it('reconcile 保留仍成立的进度异常且不计入 dismissed', () => {
    const center = createAnomalyCenter()
    center.report(LAB_GUIDE_AHEAD)
    center.reconcile('pwnhub', [LAB_GUIDE_AHEAD])
    expect(center.pendingFor('pwnhub')).toEqual(LAB_GUIDE_AHEAD)
    center.reconcile('pwnhub', [])
    center.report(LAB_GUIDE_AHEAD)
    expect(center.pendingFor('pwnhub')).toEqual(LAB_GUIDE_AHEAD)
  })
})
