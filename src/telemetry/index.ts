/**
 * 遥测服务单例。
 *
 * 应用通过 useTelemetry() 消费模块级单例。
 * 未来其他 Lab 可用不同的 module 独立创建自己的 TelemetryClient，
 * 或在此扩展为多 module 注册表。
 */

import { TelemetryClient } from './client'
import type { ModuleId } from './schema'

let seclabClient: TelemetryClient | null = null

/**
 * SecLab 遥测客户端（模块级单例）。
 * 首次调用时惰性创建。
 */
export function useTelemetry(): TelemetryClient {
  if (seclabClient === null) {
    seclabClient = createTelemetry('seclab')
  }
  return seclabClient
}

/**
 * 创建一个绑定到指定 module 的遥测客户端。
 * 未来其他 Lab 调用此工厂注册自己的 module。
 */
export function createTelemetry(module: ModuleId): TelemetryClient {
  return new TelemetryClient({ module })
}

/** 测试用：重置单例并 dispose 旧客户端。 */
export async function resetTelemetryForTesting(): Promise<void> {
  if (seclabClient !== null) {
    await seclabClient.dispose()
  }
  seclabClient = null
}

export { TelemetryClient } from './client'
export type {
  TelemetryBatchRequest,
  SessionBootstrapResponse,
  TelemetryTransport,
} from './client'
export type {
  TelemetryEvent,
  TrackedCommand,
  ModuleId,
  CompletionPathDimension,
} from './schema'
