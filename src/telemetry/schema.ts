import type { CompletionPath } from '../types/lab'

export type ModuleId = 'seclab' | 'pwnhub'
export type TelemetryProtocolVersion = 1 | 2

export const SECLAB_COMMAND_ALLOWLIST = [
  'find',
  'grep',
  'chmod',
  'ls',
  'cat',
  'cd',
  'pwd',
  'whoami',
  'check',
  'help',
  'su',
] as const

export const PWNHUB_COMMAND_ALLOWLIST = [
  'ls',
  'cat',
  'cd',
  'pwd',
  'check',
  'help',
  'readelf',
  'nm',
  'objdump',
  'file',
  'hexdump',
  'strings',
  'od',
] as const

export type SecLabCommand = (typeof SECLAB_COMMAND_ALLOWLIST)[number]
export type PwnHubCommand = (typeof PWNHUB_COMMAND_ALLOWLIST)[number]
export type TrackedCommand = SecLabCommand | PwnHubCommand
export type CompletionPathDimension = CompletionPath
export type VmBootOutcome = 'ready' | 'timeout' | 'asset_error' | 'linux_error'
export type VmBootDuration = '<3s' | '3-5s' | '5-10s' | '10-20s' | '>=20s'
export type VmCacheState = 'cold' | 'warm' | 'unknown'

export type TelemetryEventV1 =
  | { type: 'command'; command: SecLabCommand }
  | { type: 'level_complete'; level: number; path: CompletionPathDimension }
  | { type: 'check_result'; level: number; passed: boolean }
  | { type: 'hint'; level: number }
  | { type: 'reset'; level: number }

export type TelemetryEventV2 =
  | { type: 'command'; command: PwnHubCommand }
  | { type: 'activity_complete'; activityId: string; path: CompletionPathDimension }
  | { type: 'activity_check'; activityId: string; passed: boolean }
  | { type: 'activity_hint'; activityId: string }
  | { type: 'activity_reset'; activityId: string }
  | { type: 'vm_boot'; outcome: VmBootOutcome; duration: VmBootDuration; cache: VmCacheState }

export type TelemetryEvent = TelemetryEventV1 | TelemetryEventV2
export type TelemetryEventType = TelemetryEvent['type']

interface ModuleTelemetryDefinition {
  protocolVersion: TelemetryProtocolVersion
  events: readonly TelemetryEventType[]
  commands: readonly string[]
}

export const MODULES: Record<ModuleId, ModuleTelemetryDefinition> = {
  seclab: {
    protocolVersion: 1,
    events: ['command', 'level_complete', 'check_result', 'hint', 'reset'],
    commands: SECLAB_COMMAND_ALLOWLIST,
  },
  pwnhub: {
    protocolVersion: 2,
    events: [
      'command',
      'activity_complete',
      'activity_check',
      'activity_hint',
      'activity_reset',
      'vm_boot',
    ],
    commands: PWNHUB_COMMAND_ALLOWLIST,
  },
}

export const MAX_EVENTS_PER_BATCH = 50
export const MAX_QUEUE_SIZE = 200
export const MAX_EVENTS_PER_SESSION = 500
export const SESSION_TTL_MS = 30 * 60 * 1000
export const FLUSH_INTERVAL_MS = 5_000
export const FLUSH_THRESHOLD = 10
export const REQUEST_TIMEOUT_MS = 4_000

export function telemetryProtocolVersion(module: ModuleId): TelemetryProtocolVersion {
  return MODULES[module].protocolVersion
}

export function isRegisteredModule(value: string): value is ModuleId {
  return value in MODULES
}

export function isAllowedEvent(module: ModuleId, type: string): boolean {
  return MODULES[module].events.includes(type as TelemetryEventType)
}

export function isAllowedCommand(module: ModuleId, command: string): command is TrackedCommand {
  return MODULES[module].commands.includes(command)
}

export function isValidCompletionPath(value: string): value is CompletionPathDimension {
  return value === 'guided' || value === 'mixed' || value === 'challenge'
}
