import { TelemetryClient } from './client'
import type { ModuleId } from './schema'

const clients = new Map<ModuleId, TelemetryClient>()

export function useTelemetry(module: ModuleId = 'seclab'): TelemetryClient {
  let client = clients.get(module)
  if (client === undefined) {
    client = createTelemetry(module)
    clients.set(module, client)
  }
  return client
}

export function createTelemetry(module: ModuleId): TelemetryClient {
  return new TelemetryClient({ module })
}

export async function resetTelemetryForTesting(): Promise<void> {
  await Promise.all([...clients.values()].map((client) => client.dispose()))
  clients.clear()
}

export { TelemetryClient } from './client'
export type {
  TelemetryBatchRequest,
  SessionBootstrapResponse,
  TelemetryTransport,
} from './client'
export type {
  CompletionPathDimension,
  ModuleId,
  TelemetryEvent,
  TelemetryEventV1,
  TelemetryEventV2,
  TrackedCommand,
  VmBootDuration,
  VmBootOutcome,
  VmCacheState,
} from './schema'
