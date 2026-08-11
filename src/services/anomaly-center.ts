import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { BlockingAnomaly } from './progress-anomaly'

/**
 * 阻断类异常中枢（叶子模块，不 import 任何 app 模块）。
 *
 * 三语义：
 * - report：检测层上报；同 key 已 pending 或已被 dismiss 时不重复入队。
 * - dismiss（「先自己看看」）：用户未修复主动关闭，本会话不再弹同 key。
 * - resolve（「已修复」）：修复动作成功后调用，移除 pending 且清除 dismiss 记录，
 *   同一异常再次发生时可以重弹（如 restart 后仍无密钥）。
 *
 * 不要用「resetDismissed + dismiss」组合表达 resolve：
 * 顺序执行后 key 仍留在 dismissedKeys，修复后同类异常会被永久压制。
 */
export interface AnomalyCenter {
  detected: Ref<BlockingAnomaly[]>
  pendingPopup: ComputedRef<BlockingAnomaly | null>
  report: (anomaly: BlockingAnomaly) => void
  dismiss: (anomaly: BlockingAnomaly) => void
  resolve: (anomaly: BlockingAnomaly) => void
  /** 撤销检测仍不成立的进度类 pending（如 mode 切到挑战模式）；运行时密钥类不受影响 */
  reconcile: (current: BlockingAnomaly[]) => void
}

/** 弹窗去重 key：进度类按关区分；密钥类是会话级，全局唯一 */
function anomalyKey(anomaly: BlockingAnomaly): string {
  return anomaly.kind === 'guide-ahead-of-evidence' ? `${anomaly.kind}:${anomaly.level}` : anomaly.kind
}

export function createAnomalyCenter(): AnomalyCenter {
  const detected = ref<BlockingAnomaly[]>([])
  const dismissedKeys = new Set<string>()

  const pendingPopup = computed(() => detected.value[0] ?? null)

  function report(anomaly: BlockingAnomaly): void {
    const key = anomalyKey(anomaly)
    if (dismissedKeys.has(key)) return
    if (detected.value.some((existing) => anomalyKey(existing) === key)) return
    detected.value = [...detected.value, anomaly]
  }

  function dismiss(anomaly: BlockingAnomaly): void {
    const key = anomalyKey(anomaly)
    detected.value = detected.value.filter((existing) => anomalyKey(existing) !== key)
    dismissedKeys.add(key)
  }

  function resolve(anomaly: BlockingAnomaly): void {
    const key = anomalyKey(anomaly)
    detected.value = detected.value.filter((existing) => anomalyKey(existing) !== key)
    dismissedKeys.delete(key)
  }

  function reconcile(current: BlockingAnomaly[]): void {
    const currentKeys = new Set(current.map(anomalyKey))
    detected.value = detected.value.filter(
      (existing) =>
        existing.kind !== 'guide-ahead-of-evidence' || currentKeys.has(anomalyKey(existing)),
    )
  }

  return { detected, pendingPopup, report, dismiss, resolve, reconcile }
}

let singleton: AnomalyCenter | null = null

export function useAnomalyCenter(): AnomalyCenter {
  singleton ??= createAnomalyCenter()
  return singleton
}
