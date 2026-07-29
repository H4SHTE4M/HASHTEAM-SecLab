/**
 * HASHTEAM Security Lab 核心类型定义
 */

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

/** 学习界面的提示密度；不影响关卡环境与判题。 */
export type LabMode = 'guided' | 'challenge'

/** 界面配色主题。 */
export type ThemeName = 'light' | 'dark'

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

/** 串口控制协议消息（@@HASHTEAM:{...}） */
export type ProtocolMessage =
  | { type: 'ready'; version?: number }
  | { type: 'level-ready'; level: number }
  | { type: 'level-result'; level: number; status: 'passed' | 'failed' }
  | { type: 'hint-request'; level: number }
  | { type: 'progress'; level: number; value: number }
  | { type: 'error'; message: string }

/** 前端持久化的关卡进度 */
export interface LabProgress {
  currentLevel: number
  completedLevels: number[]
  hintsUsed: Record<number, number>
  /** 每关当前已揭示到的教学步骤索引（从 0 开始）。 */
  guideSteps: Record<number, number>
  /** 每关已经留下完成证据的步骤 id。 */
  completedSteps: Record<number, number[]>
  startedAt: number
  updatedAt: number
}

/** 独立于通关进度的界面偏好；「重新开始」不会清除这些设置。 */
export interface LabUiPreferences {
  mode: LabMode | null
  onboardingComplete: boolean
  /** xterm 正文使用的像素字号。 */
  terminalFontSize: number
}

/** 虚拟机启动阶段（用于加载界面展示真实阶段，不伪造百分比） */
export type BootStage =
  | 'idle'
  | 'loading-assets'
  | 'starting-linux'
  | 'preparing-env'
  | 'ready'
  | 'error'

/** 虚拟机控制器统一接口（便于后续替换为快照恢复等实现） */
export interface VirtualMachineController {
  start(): Promise<void>
  stop(): Promise<void>
  reset(): Promise<void>
  restoreLevel(level: number): Promise<void>
  sendSerial(input: string): void
  onSerialOutput(callback: (data: string) => void): () => void
}
