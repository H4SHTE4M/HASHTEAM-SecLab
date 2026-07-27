/**
 * HASHTEAM Security Lab 核心类型定义
 */

/** 命令讲解中的一个步骤：可点击运行的命令 + 这一步在做什么 */
export interface GuideStep {
  /** 可点击送入终端运行的命令；留空则只展示说明文字 */
  command?: string
  /** 这一步在做什么、为什么这样做 */
  note: string
}

/** 核心概念讲解：一个安全术语/原理 + 它在现实安全工作中的意义 */
export interface Concept {
  /** 术语或原理名称，例如「最小权限原则」 */
  term: string
  /** 这个概念是什么、为什么它在真实安全工作中重要 */
  explanation: string
}

/** 学习界面的提示密度；不影响关卡环境与判题。 */
export type LabMode = 'guided' | 'challenge'

/** 关卡展示定义，由每关目录中的 challenge.json 提供。 */
export interface LevelDef {
  /** 关卡编号，从 1 开始 */
  id: number
  /** 关卡名称，例如「欢迎来到服务器」 */
  name: string
  /** 一句话副标题 */
  tagline: string
  /** 剧情描述 */
  story: string
  /** 当前目标列表 */
  goals: string[]
  /** 建议尝试的命令（仅提示，不作为判题依据） */
  suggestedCommands: string[]
  /** 命令讲解：分步骤常驻引导，用于命令密度突然增大的关卡（如管道组合） */
  guide?: GuideStep[]
  /** 核心概念：把本关技能对应到现实安全原理与意义，供想跳脱操作看本质的学生阅读 */
  concepts?: Concept[]
  /** 通关后展示的意义回顾：你刚做的事在真实安全工作里叫什么、有什么用 */
  takeaway?: string
  /** 逐步展开的提示 */
  hints: string[]
  /** 教学目标 */
  teaches: string[]
  /** check 命令用法说明 */
  checkUsage: string
}

/** 可加载的关卡 manifest；schemaVersion 用于后续平滑升级配置格式。 */
export interface ChallengeManifest extends LevelDef {
  /** 当前只支持第 1 版 manifest。 */
  schemaVersion: 1
  /** 稳定、可读的关卡标识，不随展示标题变化。 */
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
  /** 每关当前已揭示到的 guide 步骤索引（从 0 开始）。 */
  guideSteps: Record<number, number>
  startedAt: number
  updatedAt: number
}

/** 独立于通关进度的界面偏好；「重新开始」不会清除这些设置。 */
export interface LabUiPreferences {
  /** null 表示首次进入，尚未明确选择模式。 */
  mode: LabMode | null
  onboardingComplete: boolean
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
