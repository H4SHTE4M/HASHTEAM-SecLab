import { ref } from 'vue'
import type { BootStage, LabMode, ProtocolMessage, VirtualMachineController } from '../types/lab'
import { V86Controller } from '../services/vm-controller'
import {
  importSessionKey,
  levelReadyMessage,
  levelResultMessage,
  verifySignature,
} from '../services/protocol-signing'
import { useSerialProtocol } from './useSerialProtocol'
import type { SerialProtocol } from './useSerialProtocol'
import { useLabProgress } from './useLabProgress'
import { useLabPreferences } from './useLabPreferences'
import { useAnomalyCenter } from '../services/anomaly-center'
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
  const anomalyCenter = useAnomalyCenter()
  const getMode =
    options.getMode ??
    (() => useLabPreferences().state.mode ?? 'guided')

  const createController =
    options.createController ??
    ((onStageChange: (nextStage: BootStage) => void) => new V86Controller(undefined, onStageChange))
  const readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS

  let controller: VirtualMachineController | null = null
  let protocol: SerialProtocol | null = null
  let readyTimer: number | null = null
  let bootPromise: Promise<void> | null = null
  let generation = 0
  /** 本次启动的评分会话密钥（来自首个 ready；换 VM 即失效） */
  let sessionKey: CryptoKey | null = null
  /** 首个 ready 一到即钉住（即使密钥缺失/非法，后续 ready 也不得补换密钥） */
  let readySeen = false
  /** dispose 代际：dispose 不禁止显式重 boot（注释承诺过），但能让在途的
   *  boot/restart continuation 发现代际已变、放弃复活虚拟机。 */
  let disposeGeneration = 0
  /** 协议消息按到达顺序串行处理（验签是异步的） */
  let messageChain: Promise<void> = Promise.resolve()

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
    sessionKey = null
    readySeen = false

    const currentProtocol = protocol
    const currentController = controller
    const pendingMessages = messageChain
    protocol = null
    controller = null
    // 新会话使用独立队列；旧队列会在 generation 检查处失效，并在释放完成前排空。
    messageChain = Promise.resolve()

    currentProtocol?.dispose()
    if (currentController !== null) {
      try {
        await currentController.stop()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log('boot', `释放旧虚拟机失败：${message}`, 'warn')
      }
    }
    await pendingMessages
  }

  async function failCurrentBoot(message: string, failedGeneration: number): Promise<void> {
    if (failedGeneration !== generation) return
    log('boot', `启动失败：${message}`, 'error')
    await releaseCurrentVm()
    stage.value = 'error'
    errorMessage.value = message
  }

  async function handleMessage(message: ProtocolMessage, messageGeneration: number): Promise<void> {
    if (messageGeneration !== generation) return
    const logMessage =
      message.type === 'ready' && message.key !== undefined
        ? { ...message, key: '[redacted]' }
        : message
    log('protocol', `收到 ${message.type}：${JSON.stringify(logMessage)}`)
    switch (message.type) {
      case 'ready': {
        // 无论首条 ready 是否携带有效密钥都立即钉住；否则攻击者可在异常启动后
        // 补发自选密钥。重复 ready 连阶段/恢复副作用也一并忽略。
        if (readySeen) {
          log('protocol', '忽略重复的 ready（首个 ready 已钉住本次会话）', 'warn')
          break
        }
        readySeen = true
        // 阻断类异常上报：先按 crypto.subtle 可用性分流——
        // 不可用时验签在原理上就不可能（E2），重启环境也救不了；
        // 可用但密钥缺失/导入失败才是可通过重启修复的 E1。
        // 注意必须走 globalThis：可选链护不住未声明的 crypto 标识符（如 jsdom）。
        const subtleUnavailable = globalThis.crypto?.subtle === undefined
        if (subtleUnavailable) {
          anomalyCenter.report({
            kind: 'crypto-unavailable',
            isSecureContext: window.isSecureContext,
          })
        }
        if (message.key === undefined) {
          log('protocol', 'ready 未携带会话密钥，本次启动的评分结果将被拒绝', 'warn')
          if (!subtleUnavailable) {
            anomalyCenter.report({ kind: 'missing-session-key', keyPresent: false })
          }
        } else {
          const importedKey = await importSessionKey(message.key)
          if (messageGeneration !== generation) return
          sessionKey = importedKey
          if (importedKey === null) {
            log('protocol', '会话密钥导入失败，本次启动的评分结果将被拒绝', 'warn')
            // subtle 缺失导致的导入失败已按 crypto-unavailable 上报，不重复
            if (!subtleUnavailable) {
              anomalyCenter.report({ kind: 'missing-session-key', keyPresent: true })
            }
          }
        }
        clearReadyTimer()
        log('stage', `ready 到达，进入关卡 ${progress.state.currentLevel}`)
        stage.value = 'ready'
        // VM 是内存环境，每次启动都是全新状态。把前端持久化的完成进度
        // 同步过去，否则刷新后恢复到后续关卡会被 VM 的顺序解锁校验拒绝。
        syncCompletionToVm(progress.state.completedLevels)
        void controller?.restoreLevel(progress.state.currentLevel)
        break
      }
      case 'level-ready': {
        if (!isKnownLevel(message.level)) break
        const readyVerified =
          sessionKey !== null &&
          message.sig !== undefined &&
          (await verifySignature(sessionKey, levelReadyMessage(message.level), message.sig))
        if (messageGeneration !== generation) return
        if (!readyVerified) {
          log('protocol', `忽略未通过验签的 level-ready（第 ${message.level} 关）`, 'warn')
          break
        }
        // 解锁门控：只接受顺序解锁范围内的关卡切换。
        // VM 内关卡状态文件可被学生篡改，前端进度不得盲目跟随。
        const unlocked =
          message.level === 1 || progress.state.completedLevels.includes(message.level - 1)
        if (!unlocked) {
          log('protocol', `忽略未解锁关卡的 level-ready（第 ${message.level} 关）`, 'warn')
          break
        }
        progress.setLevel(message.level)
        break
      }
      case 'level-result': {
        // 只接受当前关卡的通过消息，避免迟到或异常协议改写其他关卡进度。
        if (message.status !== 'passed' || message.level !== progress.state.currentLevel) break
        const resultVerified =
          sessionKey !== null &&
          message.sig !== undefined &&
          (await verifySignature(
            sessionKey,
            levelResultMessage(message.level, 'passed'),
            message.sig,
          ))
        if (messageGeneration !== generation) return
        if (!resultVerified) {
          log('protocol', `忽略未通过验签的 level-result（第 ${message.level} 关）`, 'warn')
          break
        }
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
        break
      }
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
    const seenDisposeGeneration = disposeGeneration
    if (controller !== null) await releaseCurrentVm()
    // 释放期间页面被 dispose：放弃本次启动，不重建控制器
    if (disposeGeneration !== seenDisposeGeneration) return

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
    // 验签是异步的：消息按到达顺序入队串行处理，保持 ready → level-ready 的时序
    protocol.onMessage((message) => {
      messageChain = messageChain
        .then(() => handleMessage(message, currentGeneration))
        .catch((error) => {
          log(
            'protocol',
            `消息处理异常：${error instanceof Error ? error.message : String(error)}`,
            'warn',
          )
        })
    })

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
    // 与切关保持一致：reset-level 的 init 是子进程，改不了交互 shell 的 cwd，
    // 重建环境后补一行 cd 把学生 shell 带回 HOME。
    sendSerial('reset-level\ncd "$HOME"\n')
  }

  function runCommand(command: string): void {
    clearLine()
    sendSerial(`${command}\n`)
  }

  /**
   * 无条件重启当前会话（阻断异常弹窗的修复动作）。
   * boot() 在 ready 等非 error 状态下幂等返回，修不了「判题密钥缺失」；
   * 这里先释放当前会话（重置 sessionKey/readySeen、代际失效），再走 boot()
   * 的幂等协调入口——restart 期间的并发 boot() 共享同一个 Promise。
   */
  async function restart(): Promise<void> {
    const seenDisposeGeneration = disposeGeneration
    await releaseCurrentVm()
    // 使在途旧 boot 的延迟 settle 不阻塞新代际；旧 finally 有 bootPromise===task
    // 身份检查，不会误清这里即将触发的新 Promise。
    bootPromise = null
    if (disposeGeneration !== seenDisposeGeneration) return
    await boot()
  }

  /** 等待当前会话已接收的协议消息处理完毕；用于生命周期收口与确定性测试。 */
  async function waitForProtocolIdle(): Promise<void> {
    await messageChain
  }

  /** 页面卸载或显式销毁时停止 VM，并解除全部外部监听。 */
  async function dispose(): Promise<void> {
    disposeGeneration += 1
    // 丢弃进行中的 boot 任务引用：dispose 之后必须能重新 boot（原实现在此泄漏 bootPromise）
    bootPromise = null
    await releaseCurrentVm()
    displayCallbacks.clear()
    stage.value = 'idle'
    errorMessage.value = null
  }

  return {
    stage,
    errorMessage,
    boot,
    restart,
    dispose,
    onDisplay,
    sendSerial,
    gotoLevel,
    resetCurrentLevel,
    runCommand,
    waitForProtocolIdle,
  }
}

let singleton: ReturnType<typeof createVirtualMachine> | null = null

/** 虚拟机生命周期 + 协议消息路由（应用级单例）。 */
export function useVirtualMachine() {
  singleton ??= createVirtualMachine()
  return singleton
}
