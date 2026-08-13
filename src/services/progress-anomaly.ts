import type { CourseLabDef, LabMode, LabProgress, LevelDef } from '../types/lab'
import type { ModuleId } from '../telemetry/schema'

interface ManifestMismatch {
  unknownStepIds: number[]
  manifestStepCount: number
}

interface GuideAnomalyDetail {
  guideStep: number
  /** manifest 范围内缺失完成证据的步骤 id（有界，不含 manifest 外的 id） */
  missingPrefixSteps: number[]
  /** guide 越过 manifest 最后一步时为 true：缺失列表只覆盖 manifest 范围 */
  truncated: boolean
  /** 进度档与当前 manifest 不匹配（仅诊断，不单独触发弹窗） */
  manifestMismatch?: ManifestMismatch
}

/**
 * 「阻断通关」类异常：进度档自相矛盾或判题密钥缺失，学生无法靠自己推进。
 * 每条异常都携带 module，避免两个工作台共享 singleton 时串台。
 */
export type BlockingAnomaly =
  | ({ kind: 'guide-ahead-of-evidence'; module: 'seclab'; level: number } & GuideAnomalyDetail)
  | ({ kind: 'lab-guide-ahead-of-evidence'; module: 'pwnhub'; labId: string } & GuideAnomalyDetail)
  | { kind: 'missing-session-key'; module: ModuleId; keyPresent: boolean }
  | { kind: 'crypto-unavailable'; module: ModuleId; isSecureContext: boolean }

/** 不进弹窗、只写启动日志的进度档异常线索。 */
export interface ProgressDiagnostic {
  kind: 'manifest-mismatch' | 'invalid-guide-step'
  module: ModuleId
  level?: number
  labId?: string
  detail: string
}

export interface DetectInput {
  progress: LabProgress
  levels: readonly LevelDef[]
  mode: LabMode | null
}

export interface DetectLabInput {
  progress: LabProgress
  labs: readonly CourseLabDef[]
  mode: LabMode | null
}

export interface DetectResult {
  /** 实现只产出 0 或 1 条，只检测当前关卡或实验。 */
  blocking: BlockingAnomaly[]
  diagnostics: ProgressDiagnostic[]
}

const UNKNOWN_STEP_IDS_CAP = 20

interface GuideEvidence {
  guideValid: boolean
  rawGuide: number
  guide: number
  prefix: number
  missingPrefixSteps: number[]
  guideBeyondManifest: boolean
  manifestMismatch?: ManifestMismatch
}

function inspectGuideEvidence(
  rawGuide: number,
  completed: readonly number[],
  stepCount: number,
): GuideEvidence {
  const guideValid = Number.isSafeInteger(rawGuide) && rawGuide >= 0
  const guide = guideValid ? rawGuide : 0
  const completedSet = new Set(completed)
  let prefix = 0
  while (prefix < stepCount && completedSet.has(prefix + 1)) prefix += 1

  const unknownStepIds = completed
    .filter((id) => id > stepCount)
    .slice(0, UNKNOWN_STEP_IDS_CAP)
  const guideBeyondManifest = guideValid && guide > Math.max(0, stepCount - 1)
  const manifestMismatch =
    unknownStepIds.length > 0 || guideBeyondManifest
      ? { unknownStepIds, manifestStepCount: stepCount }
      : undefined
  const upperBound = Math.min(guide, stepCount)
  const missingPrefixSteps: number[] = []
  for (let id = prefix + 1; id <= upperBound; id += 1) {
    if (!completedSet.has(id)) missingPrefixSteps.push(id)
  }
  return {
    guideValid,
    rawGuide,
    guide,
    prefix,
    missingPrefixSteps,
    guideBeyondManifest,
    ...(manifestMismatch === undefined ? {} : { manifestMismatch }),
  }
}

/** SecLab 数字关卡异常检测。 */
export function detectBlockingAnomalies(input: DetectInput): DetectResult {
  const { progress, levels, mode } = input
  const blocking: BlockingAnomaly[] = []
  const diagnostics: ProgressDiagnostic[] = []
  const level = progress.currentLevel
  if (progress.completedLevels.includes(level)) return { blocking, diagnostics }
  const levelDef = levels.find((item) => item.id === level)
  if (levelDef === undefined) return { blocking, diagnostics }

  const evidence = inspectGuideEvidence(
    progress.guideSteps[level] ?? 0,
    progress.completedSteps[level] ?? [],
    levelDef.steps.length,
  )
  if (!evidence.guideValid) {
    diagnostics.push({
      kind: 'invalid-guide-step',
      module: 'seclab',
      level,
      detail: `第 ${level} 关 guideSteps 值非法（${String(evidence.rawGuide)}），按 0 处理`,
    })
  }
  if (mode === 'guided' && evidence.guide > evidence.prefix) {
    blocking.push({
      kind: 'guide-ahead-of-evidence',
      module: 'seclab',
      level,
      guideStep: evidence.rawGuide,
      missingPrefixSteps: evidence.missingPrefixSteps,
      truncated: evidence.guideBeyondManifest,
      ...(evidence.manifestMismatch === undefined
        ? {}
        : { manifestMismatch: evidence.manifestMismatch }),
    })
  } else if (evidence.manifestMismatch !== undefined) {
    const { unknownStepIds, manifestStepCount } = evidence.manifestMismatch
    diagnostics.push({
      kind: 'manifest-mismatch',
      module: 'seclab',
      level,
      detail:
        `第 ${level} 关进度档与当前 manifest（${manifestStepCount} 步）不匹配：` +
        `超界步骤 id [${unknownStepIds.join(', ')}]` +
        `${evidence.guideBeyondManifest ? `，guide 索引越界（${evidence.guide} > ${Math.max(0, manifestStepCount - 1)}）` : ''}`,
    })
  }
  return { blocking, diagnostics }
}

/** PwnHub 稳定 labId 实验异常检测。 */
export function detectLabBlockingAnomalies(input: DetectLabInput): DetectResult {
  const { progress, labs, mode } = input
  const blocking: BlockingAnomaly[] = []
  const diagnostics: ProgressDiagnostic[] = []
  const labId = progress.currentLabId
  if (progress.completedLabIds.includes(labId)) return { blocking, diagnostics }
  const lab = labs.find((item) => item.labId === labId && item.legacyLevel === undefined)
  if (lab === undefined) return { blocking, diagnostics }

  const evidence = inspectGuideEvidence(
    progress.labGuideSteps[labId] ?? 0,
    progress.labCompletedSteps[labId] ?? [],
    lab.steps.length,
  )
  if (!evidence.guideValid) {
    diagnostics.push({
      kind: 'invalid-guide-step',
      module: 'pwnhub',
      labId,
      detail: `实验 ${labId} 的 labGuideSteps 值非法（${String(evidence.rawGuide)}），按 0 处理`,
    })
  }
  if (mode === 'guided' && evidence.guide > evidence.prefix) {
    blocking.push({
      kind: 'lab-guide-ahead-of-evidence',
      module: 'pwnhub',
      labId,
      guideStep: evidence.rawGuide,
      missingPrefixSteps: evidence.missingPrefixSteps,
      truncated: evidence.guideBeyondManifest,
      ...(evidence.manifestMismatch === undefined
        ? {}
        : { manifestMismatch: evidence.manifestMismatch }),
    })
  } else if (evidence.manifestMismatch !== undefined) {
    const { unknownStepIds, manifestStepCount } = evidence.manifestMismatch
    diagnostics.push({
      kind: 'manifest-mismatch',
      module: 'pwnhub',
      labId,
      detail:
        `实验 ${labId} 的进度档与当前 manifest（${manifestStepCount} 步）不匹配：` +
        `超界步骤 id [${unknownStepIds.join(', ')}]` +
        `${evidence.guideBeyondManifest ? `，guide 索引越界（${evidence.guide} > ${Math.max(0, manifestStepCount - 1)}）` : ''}`,
    })
  }
  return { blocking, diagnostics }
}
