import { ref } from 'vue'
import type { BootStage, LabMode, ProtocolMessage, VirtualMachineController } from '../types/lab'
import { V86Controller } from '../services/vm-controller'
import { useSerialProtocol } from './useSerialProtocol'
import { useLabProgress } from './useLabProgress'
import { useLabPreferences } from './useLabPreferences'
import { getLevel, TOTAL_LEVELS } from '../data/levels'
import { log, clear as clearBootLog } from '../services/boot-logger'

const DEFAULT_READY_TIMEOUT_MS = 60_000

export interface VirtualMachineOptions {
  /** 控制器工厂可注入，便于验证失败重试、监听释放等生命周期行为。 */
  createController?: (onStageChange: (stage: BootStage) => void) => VirtualMachineController
  /** 从加载首个静态资源到 Linux 发出 ready 协议的全流程最长等待时间。 */
  readyTimeoutMs?: number
  /** 当前学习模式读取器；测试可注入以覆盖判题分流。 */
  getMode?: () => LabMode
}

function isKnownLevel(level: number): boolean {
  return Number.isInteger(level) && level >= 1 && level <= TOTAL_LEVELS
}

/**
 * 创建一套独立的虚拟机状态与协议路由。
 *
 * 应用通过 useVirtualMachine() 消费模块级单例；测试可直接调用本函数注入
 * 假控制器，验证启动失败、超时与销毁等故障路径。
 */
export function createVirtualMachine(options: VirtualMachineOptions = {}) {
  const stage = ref<BootStage>('idle')
  const errorMessage = ref<string | null>(null)
  const displayCallbacks = new Set<(data: string) => void>()
  const progress = useLabProgress()
  const getMode =
    options.getMode ??
    (() => useLabPreferences().state.mode ?? 'guided')

  const createController =
    options.createController ??
    ((onStageChange: (nextStage: BootStage) => void) => new V86Controller(undefined, onStageChange))
  const readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS

  let controller: VirtualMachineController | null = null
  let protocol: ReturnType<typeof useSerialProtocol> | null = null
  let readyTimer: number | null = null
  let bootPromise: Promise<void> | null = null
  let generation = 0

  function clearReadyTimer(): void {
    if (readyTimer === null) return
    window.clearTimeout(readyTimer)
    readyTimer = null
  }

  function hasReachedReady(): boolean {
    return stage.value === 'ready'
  }

  /**
   * 释放当前会话。先使 generation 失效，再解除协议监听和停止控制器，
   * 防止旧控制器的迟到回调覆盖新会话状态。
   */
  async function releaseCurrentVm(): Promise<void> {
    generation += 1
    clearReadyTimer()

    const currentProtocol = protocol
    const currentController = controller
    protocol = null
    controller = null

    currentProtocol?.dispose()
    if (currentController !== null) {
      try {
        await currentController.stop()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log('boot', `释放旧虚拟机失败：${message}`, 'warn')
      }
    }
  }

  async function failCurrentBoot(message: string, failedGeneration: number): Promise<void> {
    if (failedGeneration !== generation) return
    log('boot', `启动失败：${message}`, 'error')
    await releaseCurrentVm()
    stage.value = 'error'
    errorMessage.value = message
  }

  function handleMessage(message: ProtocolMessage): void {
    log('protocol', `收到 ${message.type}：${JSON.stringify(message)}`)
    switch (message.type) {
      case 'ready':
        clearReadyTimer()
        log('stage', `ready 到达，进入关卡 ${progress.state.currentLevel}`)
        stage.value = 'ready'
        // VM 是内存环境，每次启动都是全新状态。把前端持久化的完成进度
        // 同步过去，否则刷新后恢复到后续关卡会被 VM 的顺序解锁校验拒绝。
        syncCompletionToVm(progress.state.completedLevels)
        void controller?.restoreLevel(progress.state.currentLevel)
        break
      case 'level-ready':
        if (isKnownLevel(message.level)) progress.setLevel(message.level)
        break
      case 'level-result':
        // 只接受当前关卡的通过消息，避免迟到或异常协议改写其他关卡进度。
        if (message.status === 'passed' && message.level === progress.state.currentLevel) {
          const mode = getMode()
          const requiredSteps = getLevel(message.level)?.steps.map((step) => step.id) ?? []
          const completedSteps = new Set(progress.completedStepsFor(message.level))
          if (
            mode === 'challenge' ||
            requiredSteps.every((stepId) => completedSteps.has(stepId))
          ) {
            progress.complete(message.level, {
              path:
                mode === 'guided'
                  ? 'guided'
                  : progress.hasGuidedAssistance(message.level)
                    ? 'mixed'
                    : 'challenge',
              hintsUsed: progress.hintsUsedFor(message.level),
            })
          } else {
            const notice =
              '\r\n\x1b[33m环境结果已经正确，但还需要完成右侧当前教学步骤，' +
              '确认你观察过关键输出后再运行一次 check。\x1b[0m\r\n'
            displayCallbacks.forEach((callback) => callback(notice))
          }
        }
        break
      case 'hint-request':
        if (message.level === progress.state.currentLevel) progress.useHint(message.level)
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

  async function bootInternal(): Promise<void> {
    if (controller !== null) await releaseCurrentVm()

    errorMessage.value = null
    clearBootLog()
    stage.value = 'loading-assets'
    log('stage', '阶段：loading-assets')

    const currentGeneration = ++generation
    const nextController = createController((nextStage) => {
      if (generation !== currentGeneration) return
      if (stage.value !== nextStage) log('stage', `阶段：${nextStage}`)
      stage.value = nextStage
    })
    controller = nextController
    protocol = useSerialProtocol(nextController)
    protocol.onDisplay((data) => {
      displayCallbacks.forEach((callback) => callback(data))
    })
    protocol.onMessage(handleMessage)

    const deadline = Date.now() + readyTimeoutMs
    const timeoutMessage =
      `实验环境启动超过 ${Math.ceil(readyTimeoutMs / 1000)} 秒仍未就绪，` +
      '请检查网络和启动日志后重试。'
    let startTimer: number | null = null
    try {
      const startTimeout = new Promise<never>((_resolve, reject) => {
        startTimer = window.setTimeout(() => reject(new Error(timeoutMessage)), readyTimeoutMs)
      })
      try {
        await Promise.race([nextController.start(), startTimeout])
      } finally {
        if (startTimer !== null) window.clearTimeout(startTimer)
        startTimer = null
      }
      if (generation !== currentGeneration) return
      // 极快环境或测试控制器可能在 start() resolve 前已发出 ready。
      if (hasReachedReady()) return
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) throw new Error(timeoutMessage)
      readyTimer = window.setTimeout(() => {
        void failCurrentBoot(timeoutMessage, currentGeneration)
      }, remainingMs)
    } catch (error) {
      if (startTimer !== null) window.clearTimeout(startTimer)
      if (generation !== currentGeneration) return
      const message = error instanceof Error ? error.message : String(error)
      await failCurrentBoot(message, currentGeneration)
    }
  }

  /** 启动虚拟机；并发调用共享同一个 Promise，ready/error 状态下保持幂等。 */
  async function boot(): Promise<void> {
    if (bootPromise !== null) return bootPromise
    if (controller !== null && stage.value !== 'error') return

    const task = bootInternal()
    bootPromise = task
    try {
      await task
    } finally {
      if (bootPromise === task) bootPromise = null
    }
  }

  function onDisplay(callback: (data: string) => void): () => void {
    displayCallbacks.add(callback)
    return () => {
      displayCallbacks.delete(callback)
    }
  }

  function sendSerial(input: string): void {
    controller?.sendSerial(input)
  }

  function syncCompletionToVm(completedLevels: number[]): void {
    if (completedLevels.length === 0) return
    const maxCompleted = completedLevels.reduce((a, b) => (a > b ? a : b), 0)
    sendSerial(`hashteamctl mark-completed ${maxCompleted}\n`)
  }

  function clearLine(): void {
    sendSerial('\x15')
  }

  function interruptForeground(): void {
    sendSerial('\x03')
  }

  function gotoLevel(level: number): void {
    if (!isKnownLevel(level)) return
    const unlocked = level === 1 || progress.state.completedLevels.includes(level - 1)
    if (!unlocked) return
    clearLine()
    progress.setLevel(level)
    void controller?.restoreLevel(level)
  }

  function resetCurrentLevel(): void {
    interruptForeground()
    // 与切关保持一致：重建环境前离开可能会被 init.sh 清理的子目录。
    sendSerial('cd "$HOME" && reset-level\n')
  }

  function runCommand(command: string): void {
    clearLine()
    sendSerial(`${command}\n`)
  }

  /** 页面卸载或显式销毁时停止 VM，并解除全部外部监听。 */
  async function dispose(): Promise<void> {
    await releaseCurrentVm()
    displayCallbacks.clear()
    stage.value = 'idle'
    errorMessage.value = null
  }

  return {
    stage,
    errorMessage,
    boot,
    dispose,
    onDisplay,
    sendSerial,
    gotoLevel,
    resetCurrentLevel,
    runCommand,
  }
}

let singleton: ReturnType<typeof createVirtualMachine> | null = null

/** 虚拟机生命周期 + 协议消息路由（应用级单例）。 */
export function useVirtualMachine() {
  singleton ??= createVirtualMachine()
  return singleton
}
