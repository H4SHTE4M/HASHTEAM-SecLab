import { describe, expect, it } from 'vitest'
import { createAnomalyCenter } from '../src/services/anomaly-center'
import type { BlockingAnomaly } from '../src/services/progress-anomaly'

const GUIDE_AHEAD_3: BlockingAnomaly = {
  kind: 'guide-ahead-of-evidence',
  level: 3,
  guideStep: 7,
  missingPrefixSteps: [7],
  truncated: false,
}

const GUIDE_AHEAD_4: BlockingAnomaly = {
  kind: 'guide-ahead-of-evidence',
  level: 4,
  guideStep: 5,
  missingPrefixSteps: [5],
  truncated: false,
}

const MISSING_KEY: BlockingAnomaly = { kind: 'missing-session-key', keyPresent: false }
const CRYPTO_UNAVAILABLE: BlockingAnomaly = { kind: 'crypto-unavailable', isSecureContext: false }

describe('createAnomalyCenter', () => {
  it('report 入队，pendingPopup 取队首', () => {
    const center = createAnomalyCenter()
    expect(center.pendingPopup.value).toBeNull()
    center.report(GUIDE_AHEAD_3)
    expect(center.pendingPopup.value).toEqual(GUIDE_AHEAD_3)
  })

  it('同 key 重复 report 不双弹（内容不同也去重）', () => {
    const center = createAnomalyCenter()
    center.report(GUIDE_AHEAD_3)
    center.report({ ...GUIDE_AHEAD_3, guideStep: 99, missingPrefixSteps: [5, 6, 7] })
    expect(center.detected.value).toHaveLength(1)
  })

  it('不同 key（不同关卡/不同类别）各自入队并保持顺序', () => {
    const center = createAnomalyCenter()
    center.report(GUIDE_AHEAD_3)
    center.report(MISSING_KEY)
    center.report(GUIDE_AHEAD_4)
    center.report(CRYPTO_UNAVAILABLE)
    expect(center.detected.value.map((a) => a.kind)).toEqual([
      'guide-ahead-of-evidence',
      'missing-session-key',
      'guide-ahead-of-evidence',
      'crypto-unavailable',
    ])
    // 关闭队首后下一条顶上
    center.dismiss(GUIDE_AHEAD_3)
    expect(center.pendingPopup.value).toEqual(MISSING_KEY)
  })

  it('dismiss 后同 key 不再弹（用户未修复主动关闭）', () => {
    const center = createAnomalyCenter()
    center.report(GUIDE_AHEAD_3)
    center.dismiss(GUIDE_AHEAD_3)
    center.report(GUIDE_AHEAD_3)
    expect(center.pendingPopup.value).toBeNull()
  })

  it('resolve 后同 key 再次发生可以重弹（修复语义，v4 P0 回归）', () => {
    const center = createAnomalyCenter()
    center.report(GUIDE_AHEAD_3)
    // fix 动作只能调 resolve；若先 dismiss 再修复，key 会被永久压制
    center.resolve(GUIDE_AHEAD_3)
    center.report(GUIDE_AHEAD_3)
    expect(center.pendingPopup.value).toEqual(GUIDE_AHEAD_3)
  })

  it('resolve 从未 dismiss 的 key 也幂等可用', () => {
    const center = createAnomalyCenter()
    center.resolve(MISSING_KEY)
    center.report(MISSING_KEY)
    expect(center.pendingPopup.value).toEqual(MISSING_KEY)
  })

  it('密钥类去重 key 全局唯一（不携带关卡维度）', () => {
    const center = createAnomalyCenter()
    center.report(MISSING_KEY)
    center.report({ kind: 'missing-session-key', keyPresent: true })
    expect(center.detected.value).toHaveLength(1)
  })

  it('reconcile 撤销不再成立的进度类 pending（如 mode 切到挑战模式）', () => {
    const center = createAnomalyCenter()
    center.report(GUIDE_AHEAD_3)
    center.report(MISSING_KEY)
    // 重检结果为空（例如已切挑战模式）：A 被撤销，运行时密钥类不受影响
    center.reconcile([])
    expect(center.detected.value).toEqual([MISSING_KEY])
  })

  it('reconcile 保留仍成立的进度类 pending，且不计入 dismissed', () => {
    const center = createAnomalyCenter()
    center.report(GUIDE_AHEAD_3)
    center.reconcile([GUIDE_AHEAD_3])
    expect(center.pendingPopup.value).toEqual(GUIDE_AHEAD_3)
    // reconcile 撤销不是 dismiss：撤销后再次 report 可以重弹
    center.reconcile([])
    center.report(GUIDE_AHEAD_3)
    expect(center.pendingPopup.value).toEqual(GUIDE_AHEAD_3)
  })
})
