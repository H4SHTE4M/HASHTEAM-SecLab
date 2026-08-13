import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { ModuleId } from '../telemetry/schema'
import type { BlockingAnomaly } from './progress-anomaly'

export interface AnomalyCenter {
  detected: Ref<BlockingAnomaly[]>
  /** 全局队首，仅供诊断和兼容测试；Workspace 必须使用 pendingFor(module)。 */
  pendingPopup: ComputedRef<BlockingAnomaly | null>
  pendingFor: (module: ModuleId) => BlockingAnomaly | null
  report: (anomaly: BlockingAnomaly) => void
  dismiss: (anomaly: BlockingAnomaly) => void
  resolve: (anomaly: BlockingAnomaly) => void
  /** 只撤销指定模块中已不成立的进度异常；运行时密钥异常不受影响。 */
  reconcile: (module: ModuleId, current: BlockingAnomaly[]) => void
}

function isProgressAnomaly(anomaly: BlockingAnomaly): boolean {
  return (
    anomaly.kind === 'guide-ahead-of-evidence' ||
    anomaly.kind === 'lab-guide-ahead-of-evidence'
  )
}

function anomalyKey(anomaly: BlockingAnomaly): string {
  switch (anomaly.kind) {
    case 'guide-ahead-of-evidence':
      return `${anomaly.module}:${anomaly.kind}:${anomaly.level}`
    case 'lab-guide-ahead-of-evidence':
      return `${anomaly.module}:${anomaly.kind}:${anomaly.labId}`
    default:
      return `${anomaly.module}:${anomaly.kind}`
  }
}

export function createAnomalyCenter(): AnomalyCenter {
  const detected = ref<BlockingAnomaly[]>([])
  const dismissedKeys = new Set<string>()
  const pendingPopup = computed(() => detected.value[0] ?? null)

  function pendingFor(module: ModuleId): BlockingAnomaly | null {
    return detected.value.find((anomaly) => anomaly.module === module) ?? null
  }

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

  function reconcile(module: ModuleId, current: BlockingAnomaly[]): void {
    const currentKeys = new Set(current.map(anomalyKey))
    detected.value = detected.value.filter(
      (existing) =>
        existing.module !== module ||
        !isProgressAnomaly(existing) ||
        currentKeys.has(anomalyKey(existing)),
    )
  }

  return { detected, pendingPopup, pendingFor, report, dismiss, resolve, reconcile }
}

let singleton: AnomalyCenter | null = null

export function useAnomalyCenter(): AnomalyCenter {
  singleton ??= createAnomalyCenter()
  return singleton
}
