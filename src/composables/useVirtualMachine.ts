import { ref } from 'vue'
import type { BootStage, ProtocolMessage } from '../types/lab'
import { V86Controller } from '../services/vm-controller'
import { useSerialProtocol } from './useSerialProtocol'
import { useLabProgress } from './useLabProgress'
import { TOTAL_LEVELS } from '../data/levels'
import { log, clear as clearBootLog } from '../services/boot-logger'

/**
 * 虚拟机生命周期 + 协议消息路由（模块级单例）。
 * 组件只消费这里的 ref 与方法，不直接接触 v86。
 */
const stage = ref<BootStage>('idle')
const errorMessage = ref<string | null>(null)

/** 终端显示文本订阅者（与协议层解耦，启动前注册也有效） */
const displayCallbacks = new Set<(data: string) => void>()

let controller: V86Controller | null = null
let protocol: ReturnType<typeof useSerialProtocol> | null = null

export function useVirtualMachine() {
  const progress = useLabProgress()

  function handleMessage(message: ProtocolMessage): void {
    log('protocol', `收到 ${message.type}：${JSON.stringify(message)}`)
    switch (message.type) {
      case 'ready':
        // Linux 启动并完成自动登录，进入已保存的关卡
        log('stage', `ready 到达，进入关卡 ${progress.state.currentLevel}`)
        stage.value = 'ready'
        // VM 是内存环境，每次启动都是全新状态，不记得任何关卡完成记录。
        // 把前端持久化的完成进度同步过去，否则 hashteamctl goto 的解锁校验
        // 会拒绝恢复到尚未在本次启动中完成的关卡（例如刷新页面续关）。
        syncCompletionToVm(progress.state.completedLevels)
        controller?.restoreLevel(progress.state.currentLevel)
        break
      case 'level-ready':
        progress.setLevel(message.level)
        break
      case 'level-result':
        if (message.status === 'passed') {
          progress.complete(message.level)
        }
        break
      case 'hint-request':
        progress.useHint(message.level)
        break
      case 'progress':
        // 预留：细粒度进度消息
        break
      case 'error':
        // 虚拟机内检查失败等信息已在终端中给出人类可读反馈
        console.warn('[hashteam] vm error:', message.message)
        break
    }
  }

  /** 启动虚拟机（幂等） */
  async function boot(): Promise<void> {
    if (controller !== null && stage.value !== 'error') return
    errorMessage.value = null
    clearBootLog()
    stage.value = 'loading-assets'
    log('stage', '阶段：loading-assets')

    controller = new V86Controller(undefined, (s) => {
      if (stage.value !== s) log('stage', `阶段：${s}`)
      stage.value = s
    })
    protocol = useSerialProtocol(controller)
    protocol.onDisplay((data) => {
      displayCallbacks.forEach((cb) => cb(data))
    })
    protocol.onMessage(handleMessage)

    try {
      await controller.start()
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      log('boot', `启动失败：${msg}`, 'error')
      stage.value = 'error'
      errorMessage.value = msg
    }
  }

  /** 向终端订阅显示文本 */
  function onDisplay(callback: (data: string) => void): () => void {
    displayCallbacks.add(callback)
    return () => {
      displayCallbacks.delete(callback)
    }
  }

  function sendSerial(input: string): void {
    controller?.sendSerial(input)
  }

  /**
   * 把前端记录的已完成关卡同步到 VM。关卡是顺序解锁的，只需回放最大已完成关卡号。
   * 仅在开机 ready 后调用一次，让 VM 的解锁校验放行到用户上次抵达的关卡。
   */
  function syncCompletionToVm(completedLevels: number[]): void {
    if (completedLevels.length === 0) return
    const maxCompleted = completedLevels.reduce((a, b) => (a > b ? a : b), 0)
    sendSerial(`hashteamctl mark-completed ${maxCompleted}\n`)
  }

  /**
   * 静默清除终端当前未提交的输入行（发送 Ctrl+U）。
   * 用于在送入新命令前清掉用户正在输入的内容，避免两条命令拼在同一行。
   * Ctrl+U 不会产生可见的 ^C 噪声，空行时也无副作用。
   */
  function clearLine(): void {
    sendSerial('\x15')
  }

  /**
   * 中断当前正在运行的命令并放弃未提交输入（发送 Ctrl+C）。
   * 用于「重置本关」等需要从任意状态（含卡住的命令）恢复的场景。
   */
  function interruptForeground(): void {
    sendSerial('\x03')
  }

  /**
   * 切换到指定关卡（更新前端进度并通知虚拟机重建关卡环境）。
   * 不允许跳关：只能进入已解锁的关卡——第 1 关默认解锁，
   * 其余关卡需上一关已完成。
   */
  function gotoLevel(level: number): void {
    if (level < 1 || level > TOTAL_LEVELS) return
    const unlocked = level === 1 || progress.state.completedLevels.includes(level - 1)
    if (!unlocked) return
    // 清除用户可能正在输入的内容，避免与 hashteamctl goto 命令拼接
    clearLine()
    progress.setLevel(level)
    controller?.restoreLevel(level)
  }

  /** 重置本关：只重建当前关卡的实验环境，不影响完成状态 */
  function resetCurrentLevel(): void {
    // 中断可能正在运行的命令，确保 reset-level 在干净的提示符下执行
    interruptForeground()
    sendSerial('reset-level\n')
  }

  /** 以干净的输入行运行一条命令：先清除未提交输入，再回车执行 */
  function runCommand(command: string): void {
    clearLine()
    sendSerial(`${command}\n`)
  }

  return {
    stage,
    errorMessage,
    boot,
    onDisplay,
    sendSerial,
    gotoLevel,
    resetCurrentLevel,
    runCommand,
  }
}
