/**
 * HASHTEAM Security Lab 核心类型定义
 */

/** 关卡静态定义（数据与组件分离，见 src/data/levels.ts） */
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
  /** 逐步展开的提示 */
  hints: string[]
  /** 教学目标 */
  teaches: string[]
  /** check 命令用法说明 */
  checkUsage: string
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
