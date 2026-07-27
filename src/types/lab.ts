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
  startedAt: number
  updatedAt: number
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
