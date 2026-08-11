import type { LabMode, LabProgress, LevelDef } from '../types/lab'

/**
 * 「阻断通关」类异常：进度档自相矛盾或判题密钥缺失，学生无法靠自己推进。
 * 检测到后由 anomaly-center 汇总，弹窗引导重置修复 + 下载日志反馈。
 */
export type BlockingAnomaly =
  | {
      kind: 'guide-ahead-of-evidence'
      level: number
      /** 进度档中的 guide 索引（0 基）；超出 manifest 范围时为原始值，配合 truncated 阅读 */
      guideStep: number
      /** manifest 范围内缺失完成证据的步骤 id（有界，不含 manifest 外的 id） */
      missingPrefixSteps: number[]
      /** guide 越过 manifest 最后一步时为 true：缺失列表只覆盖 manifest 范围 */
      truncated: boolean
      /** B 类线索：进度档与当前 manifest 不匹配（仅诊断，不单独触发弹窗） */
      manifestMismatch?: { unknownStepIds: number[]; manifestStepCount: number }
    }
  | { kind: 'missing-session-key'; keyPresent: boolean }
  | { kind: 'crypto-unavailable'; isSecureContext: boolean }

/** 不进弹窗、只写启动日志的进度档异常线索（如 B-only manifest 错配）。 */
export interface ProgressDiagnostic {
  kind: 'manifest-mismatch' | 'invalid-guide-step'
  level: number
  detail: string
}

export interface DetectInput {
  progress: LabProgress
  levels: readonly LevelDef[]
  /** 当前学习模式；非 guided 时 A 类（步骤软锁）不阻断通关，不触发 */
  mode: LabMode | null
}

export interface DetectResult {
  /** 需要弹窗的阻断类异常；实现只产出 0 或 1 条（只检测 currentLevel） */
  blocking: BlockingAnomaly[]
  /** 仅日志的诊断线索，保持本函数纯净，由接入层写 boot-logger */
  diagnostics: ProgressDiagnostic[]
}

/** unknownStepIds 诊断截断上限：手改档可能塞入大量 id，日志与报告都不需要全量 */
const UNKNOWN_STEP_IDS_CAP = 20

/**
 * 进度档阻断异常检测（纯函数）。
 *
 * 只看 currentLevel：completedLevels 被 isValidProgress 强制连续前缀，
 * currentLevel 即最小未完成关，也是 resetLevel 修复动作的目标关。
 * 不变量：正常 UI 流程恒有 guideSteps[level] <= completedSteps 覆盖的最长前缀
 * （推进门控要求当前步已留证据，且证据与 guide 同步持久化）；
 * guide 越过前缀 = 进度档曾被外部写坏，引导模式软锁。
 *
 * 数值防线：guideSteps 可能被人为塞入超大/非法值，
 * 所有遍历与数组构造都限制在 manifest 步骤范围内，绝不按不可信 guide 构造无界数组。
 */
export function detectBlockingAnomalies(input: DetectInput): DetectResult {
  const { progress, levels, mode } = input
  const blocking: BlockingAnomaly[] = []
  const diagnostics: ProgressDiagnostic[] = []

  const level = progress.currentLevel
  // 全部通关后 currentLevel 本身也在 completedLevels 中，无可阻断
  if (progress.completedLevels.includes(level)) return { blocking, diagnostics }
  const levelDef = levels.find((item) => item.id === level)
  if (levelDef === undefined) return { blocking, diagnostics }

  const stepCount = levelDef.steps.length
  const rawGuide = progress.guideSteps[level] ?? 0
  const guideValid = Number.isSafeInteger(rawGuide) && rawGuide >= 0
  if (!guideValid) {
    diagnostics.push({
      kind: 'invalid-guide-step',
      level,
      detail: `第 ${level} 关 guideSteps 值非法（${String(rawGuide)}），按 0 处理`,
    })
  }
  const guide = guideValid ? rawGuide : 0

  const completed = progress.completedSteps[level] ?? []
  const completedSet = new Set(completed)

  // manifest 范围内的最长连续完成前缀（步骤 id 从 1 连续编号）
  let prefix = 0
  while (prefix < stepCount && completedSet.has(prefix + 1)) prefix += 1

  // B 类线索：与当前 manifest 不匹配（manifest 更新遗留或手改档）
  const unknownStepIds = completed.filter((id) => id > stepCount).slice(0, UNKNOWN_STEP_IDS_CAP)
  const guideBeyondManifest = guideValid && guide > stepCount - 1
  const manifestMismatch =
    unknownStepIds.length > 0 || guideBeyondManifest
      ? { unknownStepIds, manifestStepCount: stepCount }
      : undefined

  // A 类判定：guide 越过完成前缀。挑战模式只凭 check 通关，不构成阻断。
  if (mode === 'guided' && guide > prefix) {
    // 缺失步只枚举 manifest 范围；(prefix, guide] 内的空洞
    const upperBound = Math.min(guide, stepCount)
    const missingPrefixSteps: number[] = []
    for (let id = prefix + 1; id <= upperBound; id += 1) {
      if (!completedSet.has(id)) missingPrefixSteps.push(id)
    }
    blocking.push({
      kind: 'guide-ahead-of-evidence',
      level,
      guideStep: rawGuide,
      missingPrefixSteps,
      truncated: guideBeyondManifest,
      ...(manifestMismatch === undefined ? {} : { manifestMismatch }),
    })
  } else if (manifestMismatch !== undefined) {
    // B-only：学生可正常通关，只留日志线索
    diagnostics.push({
      kind: 'manifest-mismatch',
      level,
      detail:
        `第 ${level} 关进度档与当前 manifest（${stepCount} 步）不匹配：` +
        `超界步骤 id [${unknownStepIds.join(', ')}]` +
        `${guideBeyondManifest ? `，guide 索引越界（${guide} > ${stepCount - 1}）` : ''}`,
    })
  }

  return { blocking, diagnostics }
}
