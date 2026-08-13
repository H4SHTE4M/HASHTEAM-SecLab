export type ExternalToolId = 'ida' | 'ghidra' | 'objdump'
export type CompanionObservationKind = 'address' | 'function-name' | 'integer' | 'text'

export interface CompanionArtifact {
  name: string
  downloadUrl: string
  architecture: 'i386' | 'x86_64'
  sha256: string
  purpose: string
}

export interface CompanionToolRoute {
  tool: ExternalToolId
  label: string
  versionNote: string
  installNote: string
  steps: string[]
}

export interface CompanionTask {
  id: string
  title: string
  description: string
}

export interface CompanionObservationField {
  id: string
  label: string
  kind: CompanionObservationKind
  placeholder: string
  required: boolean
}

export interface ExternalCompanionDefinition {
  labId: string
  title: string
  artifact: CompanionArtifact
  tools: CompanionToolRoute[]
  tasks: CompanionTask[]
  observations: CompanionObservationField[]
  verificationCommandTemplate: string
}

export interface CompanionSessionState {
  schemaVersion: 1
  labId: string
  selectedTool: ExternalToolId
  completedTaskIds: string[]
  observations: Record<string, string>
  updatedAt: number
}

interface CompanionMessageMeta {
  messageId: string
  labId: string
  updatedAt: number
}

export type CompanionMessage = CompanionMessageMeta & (
  | { type: 'companion-ready' }
  | { type: 'observation'; field: string; value: string }
  | { type: 'companion-progress'; stepId: string; completed: boolean }
  | { type: 'tool-selected'; tool: ExternalToolId }
)

export type CompanionMessagePayload =
  | { type: 'companion-ready'; labId: string }
  | { type: 'observation'; labId: string; field: string; value: string }
  | { type: 'companion-progress'; labId: string; stepId: string; completed: boolean }
  | { type: 'tool-selected'; labId: string; tool: ExternalToolId }
