/**
 * HASHTEAM Security Lab 核心类型定义
 */

import type {
  BinaryWorkbenchSnapshot,
  BinaryWorkbenchTab,
  PayloadWorkbenchPreset,
} from './binary'
import type { ExternalCompanionDefinition } from './companion'

/** 一条首次出现、必须在操作前读到的概念。 */
export interface Concept {
  /** 跨步骤、跨关卡引用的稳定标识。 */
  id: string
  /** 展示名称。 */
  term: string
  /** 只解释当前任务所需的最小知识。 */
  explanation: string
}

export type LearningStepType =
  | 'explain'
  | 'observe'
  | 'partial-command'
  | 'manual-command'
  | 'question'
  | 'checkpoint'
  | 'reflection'

/** manifest v3 的扩展步骤；旧 v2 类型仍然是合法子集。 */
export type CourseStepType =
  | LearningStepType
  | 'concept'
  | 'terminal'
  | 'prediction'
  | 'visual-trace'
  | 'external-tool'
  | 'worksheet'
  | 'payload-builder'

export type StepCompletion = 'acknowledge' | 'run' | 'input' | 'answer' | 'confirm'

export interface CommandField {
  /** 对应 commandTemplate 中的 {{id}}。 */
  id: string
  label: string
  /** 输入框里的格式提示，不是可以照抄的答案。 */
  placeholder: string
}

export interface StepChoice {
  id: string
  label: string
}

export interface StepQuestion {
  prompt: string
  choices: StepChoice[]
  /** 正确选项只用于本地教学反馈，不参与最终判题。 */
  answer: string
  success: string
}

/**
 * 一个教学步骤。
 *
 * command 只用于允许一键运行的观察示例；需要学生独立完成的操作使用
 * commandTemplate + fields，或 manual-command 的空白输入框。
 */
export interface LearningStep {
  /** 关卡内从 1 开始连续编号。 */
  id: number
  type: LearningStepType
  title: string
  /** 这一步要获得的能力，而不是答案。 */
  objective: string
  /** 当前所需的操作说明。 */
  instruction: string
  /** UI 用什么证据解锁下一步。 */
  completion: StepCompletion
  /** 是否允许把 command 一键送入终端。 */
  allowRun: boolean
  /** 进入实验时由 VM 初始化脚本自动运行样本；引导模式只需核对输出。 */
  autoRun?: boolean
  /** 本步首次讲授的概念；UI 会在操作区之前展示。 */
  introduces?: Concept[]
  /** 本步使用的概念 id；内容校验器会检查它们已经出现。 */
  uses?: string[]
  /** 允许一键运行的完整观察命令。 */
  command?: string
  /** 带 {{field}} 空位的命令结构。 */
  commandTemplate?: string
  /** commandTemplate 中需要学生填写的字段。 */
  fields?: CommandField[]
  /** 明确要求学生观察的输出特征。 */
  observation?: string
  /** 判断题或选择题。 */
  question?: StepQuestion
  /** 失败时优先用于定位方向，不给最终答案。 */
  commonErrors?: string[]
  /** 完成操作后的一句话强化。 */
  reinforcement?: string
}

export interface HintLayer {
  level: 1 | 2 | 3
  kind: 'direction' | 'tool' | 'structure'
  text: string
}

export interface VerificationPlaceholder {
  /** 包含尖括号的完整 token，例如 <通行证>。 */
  token: string
  meaning: string
}

export interface VerificationFeedback {
  empty: string
  incorrect: string
  success: string
}

export interface VerificationDef {
  usage: string
  instruction: string
  placeholders: VerificationPlaceholder[]
  feedback: VerificationFeedback
}

export interface CompletionSummary {
  solved: string
  mastered: string[]
  next: string
}

interface CourseStepBase extends Omit<LearningStep, 'type'> {
  evidence?: 'observation' | 'prediction' | 'answer' | 'external-observation' | 'payload-replay'
  tool?: 'gdb' | 'pwndbg' | 'ida' | 'ghidra' | 'elf' | 'shell'
}

export interface VisualTraceCourseStep extends CourseStepBase {
  type: 'visual-trace'
  workbench: BinaryWorkbenchSnapshot
  initialTab?: Exclude<BinaryWorkbenchTab, 'payload'>
}

export interface PayloadBuilderCourseStep extends CourseStepBase {
  type: 'payload-builder'
  evidence: 'payload-replay'
  payload: PayloadWorkbenchPreset
}

export interface ExternalToolCourseStep extends CourseStepBase {
  type: 'external-tool'
  evidence: 'external-observation'
  companion: ExternalCompanionDefinition
}

export interface GeneralCourseStep extends CourseStepBase {
  type: Exclude<CourseStepType, LearningStepType | 'visual-trace' | 'payload-builder' | 'external-tool'>
}

/** v3 扩展步骤按 type 携带专属数据；旧 v2 LearningStep 仍是合法分支。 */
export type CourseStep =
  | LearningStep
  | GeneralCourseStep
  | VisualTraceCourseStep
  | PayloadBuilderCourseStep
  | ExternalToolCourseStep

/**
 * 课程领域模型（manifest v3）。数字关卡仍作为迁移期兼容层，长期身份使用
 * chapterId/labId；显示序号由课程清单派生，不参与进度寻址。
 */
export type LabKind =
  | 'terminal'
  | 'visual'
  | 'elf'
  | 'gdb'
  | 'external-tool'
  | 'pwn'

export type EnvironmentProfile = 'base' | 'binary'

export type VerificationType =
  | 'terminal-state'
  | 'answer'
  | 'payload-replay'
  | 'external-observation'

export interface LabArtifact {
  path: string
  architecture: 'i386' | 'x86_64' | 'any'
  sha256: string
  purpose: string
  downloadable: boolean
}

export interface LabVerification {
  type: VerificationType
  usage: string
  instruction: string
  placeholders: VerificationPlaceholder[]
  feedback: VerificationFeedback
}

export interface ChapterDef {
  chapterId: string
  title: string
  summary: string
  goals: string[]
  prerequisites: string[]
  estimatedMinutes: { min: number; max: number }
  labIds: string[]
  unlockAfter: string[]
  /** 本章可标记完成前必须形成的能力证据。 */
  completionDefinition: string[]
  status: 'available' | 'planned'
}

export interface CourseLabDef extends Omit<LevelDef, 'steps'> {
  labId: string
  chapterId: string
  title: string
  summary: string
  kind: LabKind
  environmentProfile: EnvironmentProfile
  estimatedMinutes: { min: number; max: number }
  unlockAfter: string[]
  artifacts: LabArtifact[]
  concepts: Concept[]
  verificationType: VerificationType
  steps: CourseStep[]
  /** 旧 v2 数字关卡的兼容身份；新实验不再分配数字运行时编号。 */
  legacyLevel?: number
}

export interface CourseDef {
  courseId: string
  title: string
  summary: string
  chapters: ChapterDef[]
  labs: CourseLabDef[]
}

export interface CourseLabManifest {
  $schema: '../course.schema.json'
  schemaVersion: 3
  courseId: string
  chapterId: string
  labId: string
  title: string
  summary: string
  goals: string[]
  prerequisites: string[]
  kind: LabKind
  environmentProfile: EnvironmentProfile
  estimatedMinutes: { min: number; max: number }
  unlockAfter: string[]
  artifacts: LabArtifact[]
  concepts: Concept[]
  steps: CourseStep[]
  hints: HintLayer[]
  verification: LabVerification
  completionSummary: CompletionSummary
}

/** 学习路径；不影响关卡环境与 VM 最终状态判题。 */
export type LabMode = 'guided' | 'challenge'

/** 首次通关时实际采用的学习路径。 */
export type CompletionPath = 'guided' | 'challenge' | 'mixed'

export interface LevelCompletionRecord {
  path: CompletionPath
  /** 通关前累计展开的提示层数；每关固定为 0–3。 */
  hintsUsed: number
}

/** 界面配色主题。 */
export type ThemeName = 'light' | 'dark'

/** 预设界面主强调色。 */
export type PresetAccentName = 'forest' | 'ocean' | 'indigo' | 'rose'

/** 界面主强调色；状态色仍保留各自的语义。 */
export type AccentName = PresetAccentName | 'custom'

/** 用户选择的原始颜色，以及为明暗界面校正后的可访问颜色。 */
export interface CustomAccent {
  source: string
  light: string
  dark: string
}

/** 关卡展示定义，由每关目录中的 challenge.json 提供。 */
export interface LevelDef {
  id: number
  name: string
  tagline: string
  /** 默认可见的短背景，不包含关键发现。 */
  storySummary: string
  /** 可展开的完整故事，也不承担命令教学职责。 */
  story: string
  goals: string[]
  prerequisites: string[]
  /** 本关实际首次引入的概念名称，用于能力梯度审计。 */
  newConcepts: string[]
  steps: LearningStep[]
  hints: HintLayer[]
  verification: VerificationDef
  completionSummary: CompletionSummary
}

/** 可加载的关卡 manifest；v2 是渐进式教学模型。 */
export interface ChallengeManifest extends LevelDef {
  schemaVersion: 2
  slug: string
}

/** 串口控制协议消息（@@HASHTEAM:{...}）
 *
 * 防伪约定（version 2 起）：
 * - ready 由 init（root）携带本次启动随机生成的会话密钥 key 签发，前端只采信首个 ready；
 * - level-result / level-ready 必须附带 sig（VM 内 SUID 评分检查器对消息的 HMAC-SHA256），
 *   缺失或验签失败的消息前端一律忽略，学生手敲的协议行因此无法伪造进度。
 */
export type ProtocolMessage =
  | { type: 'ready'; version?: number; key?: string }
  | { type: 'level-ready'; level: number; sig?: string }
  | { type: 'level-result'; level: number; status: 'passed' | 'failed'; sig?: string }
  | { type: 'lab-ready'; labId: string; sig?: string }
  | { type: 'lab-result'; labId: string; status: 'passed' | 'failed'; sig?: string }
  | { type: 'hint-request'; level?: number; labId?: string }
  | { type: 'progress'; level: number; value: number }
  | { type: 'telemetry-command'; command: string }
  | { type: 'error'; message: string }

/** 前端持久化的关卡进度 */
export interface LabProgress {
  /** 当前进度格式；v6 开始让非旧版实验的所有证据都以 labId 寻址。 */
  schemaVersion: 6
  currentLevel: number
  currentLabId: string
  completedLevels: number[]
  completedLabIds: string[]
  /** chapterId -> 已完成 labId 列表，便于章节导航和能力解锁。 */
  chapterProgress: Record<string, string[]>
  /** 以下稳定字段是 v3 课程的主存储；数字字段继续服务旧版 UI 与存档兼容。 */
  labHintsUsed: Record<string, number>
  labGuideSteps: Record<string, number>
  labCompletedSteps: Record<string, number[]>
  guidedAssistanceLabIds: string[]
  labCompletionRecords: Record<string, LevelCompletionRecord>
  hintsUsed: Record<number, number>
  /** 每关当前已揭示到的教学步骤索引（从 0 开始）。 */
  guideSteps: Record<number, number>
  /** 每关已经留下完成证据的步骤 id。 */
  completedSteps: Record<number, number[]>
  /** 最近一次重置本关后曾经打开过引导内容的关卡。 */
  guidedAssistanceLevels: number[]
  /** 新版首次通关记录；从旧存档迁移的已完成关卡允许没有记录。 */
  completionRecords: Record<number, LevelCompletionRecord>
  startedAt: number
  updatedAt: number
}

/** 独立于通关进度的界面偏好；「重新开始」不会清除这些设置。 */
export interface LabUiPreferences {
  mode: LabMode | null
  onboardingComplete: boolean
  /** xterm 正文使用的像素字号。 */
  terminalFontSize: number
  /** 工作台使用的主强调色。 */
  accent: AccentName
  /** 自选颜色及其明暗模式校正结果。 */
  customAccent: CustomAccent
}

/** 保留从核心类型入口导入伴侣消息的兼容路径。 */
export type { CompanionMessage } from './companion'

/** 虚拟机启动阶段（用于加载界面展示真实阶段，不伪造百分比） */
export type BootStage =
  | 'idle'
  | 'loading-assets'
  | 'starting-linux'
  | 'preparing-env'
  | 'ready'
  | 'error'

/** 共享 VM 单例的工作台所有者；每个工作台实例使用唯一 symbol 完成生命周期交接。 */
export type VirtualMachineOwner = symbol

/** 虚拟机控制器统一接口（便于后续替换为快照恢复等实现） */
export interface VirtualMachineController {
  start(): Promise<void>
  stop(): Promise<void>
  reset(): Promise<void>
  restoreLevel(level: number): Promise<void>
  restoreLab(labId: string): Promise<void>
  /** 运行面板提供的命令；旧控制器实现可省略，调用方会回退到 sendSerial。 */
  runCommand?(command: string): void
  sendSerial(input: string): void
  onSerialOutput(callback: (data: string) => void): () => void
}
