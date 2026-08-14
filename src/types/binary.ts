export type BinaryWorkbenchTab =
  | 'bytes'
  | 'memory'
  | 'registers'
  | 'stack'
  | 'trace'
  | 'protections'
  | 'payload'

export interface ByteSnapshot {
  baseAddress: number
  bytes: number[]
  endian: 'little' | 'big'
  selectedOffset?: number
  selectedLength?: number
}

export type MemoryCellKind = 'value' | 'pointer' | 'signed'

export interface MemoryCell {
  address: number
  name: string
  value: number
  kind: MemoryCellKind
  meaning: string
  targetAddress?: number
  targetName?: string
}

export interface MemorySnapshot {
  endian: 'little' | 'big'
  cells: MemoryCell[]
}

export interface RegisterDiffEntry {
  name: string
  before: number
  after: number
}

export interface RegisterDiffSnapshot {
  instruction?: string
  registers: RegisterDiffEntry[]
  flagsBefore?: string[]
  flagsAfter?: string[]
}

export type StackEntryKind = 'stack-pointer' | 'frame-pointer' | 'return-address' | 'local' | 'argument' | 'payload'

export interface StackEntry {
  address: number
  value: number
  label: string
  kind: StackEntryKind
}

export interface StackSnapshot {
  entries: StackEntry[]
}

export type CallTraceKind = 'call' | 'current' | 'return'

export interface CallTraceEntry {
  id: string
  kind: CallTraceKind
  functionName: string
  instruction: string
  stackPointer: number
}

export interface CallTraceSnapshot {
  entries: CallTraceEntry[]
}

/**
 * 汇编实验的静态单步状态。它只描述已由锁定 ELF 观察到的状态，
 * 不声称替代 VM 内的实时调试器。
 */
export interface AssemblyTuiState {
  id: string
  title: string
  instruction: string
  explanation: string
  registers?: RegisterDiffSnapshot
  stack?: StackSnapshot
  trace?: CallTraceSnapshot
}

export interface AssemblyTuiSnapshot {
  title?: string
  states: AssemblyTuiState[]
}

export type ProtectionName = 'architecture' | 'nx' | 'pie' | 'canary' | 'relro' | 'symbols'
export type ProtectionState = 'enabled' | 'disabled' | 'partial' | 'present' | 'stripped' | 'unknown'

export interface ProtectionEntry {
  name: ProtectionName
  state: ProtectionState
  evidence: string
}

export interface ProtectionSnapshot {
  entries: ProtectionEntry[]
}

export interface BinaryWorkbenchSnapshot {
  bytes?: ByteSnapshot
  memory?: MemorySnapshot
  registers?: RegisterDiffSnapshot
  stack?: StackSnapshot
  trace?: CallTraceSnapshot
  assemblyTui?: AssemblyTuiSnapshot
  protections?: ProtectionSnapshot
}

interface PayloadSegmentBase {
  id: string
  label: string
}

export interface PaddingPayloadSegment extends PayloadSegmentBase {
  kind: 'padding'
  byte: number
  length: number
}

export interface P32PayloadSegment extends PayloadSegmentBase {
  kind: 'p32'
  value: string
}

export interface HexPayloadSegment extends PayloadSegmentBase {
  kind: 'hex'
  value: string
}

export interface CyclicPayloadSegment extends PayloadSegmentBase {
  kind: 'cyclic'
  length: number
}

export interface TextPayloadSegment extends PayloadSegmentBase {
  kind: 'text'
  value: string
}

export type PayloadSegmentDefinition =
  | PaddingPayloadSegment
  | P32PayloadSegment
  | HexPayloadSegment
  | CyclicPayloadSegment
  | TextPayloadSegment

export interface PayloadWorkbenchPreset {
  outputPath: string
  maxBytes: number
  segments: PayloadSegmentDefinition[]
}
