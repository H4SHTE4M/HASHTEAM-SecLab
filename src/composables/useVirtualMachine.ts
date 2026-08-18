import { ref } from 'vue'
import type {
  BootStage,
  CourseLabDef,
  LabMode,
  ProtocolMessage,
  VirtualMachineController,
  VirtualMachineOwner,
} from '../types/lab'
import { V86Controller } from '../services/vm-controller'
import {
  importSessionKey,
  labReadyMessage,
  labResultMessage,
  levelReadyMessage,
  levelResultMessage,
  verifySignature,
} from '../services/protocol-signing'
import { useSerialProtocol } from './useSerialProtocol'
import type { SerialProtocol } from './useSerialProtocol'
import { useLabProgress } from './useLabProgress'
import { useLabPreferences } from './useLabPreferences'
import { useAnomalyCenter } from '../services/anomaly-center'
import { useTelemetry } from '../telemetry'
import type { ModuleId, VmBootDuration, VmBootOutcome, VmCacheState } from '../telemetry'
import { getLevel, TOTAL_LEVELS } from '../data/levels'
import { COURSE, getCourseLab } from '../modules/pwnhub/course'
import { isLabUnlocked, legacyLabId } from '../services/course-progress'
import { log, clear as clearBootLog } from '../services/boot-logger'

function vmBootDuration(elapsedMs: number): VmBootDuration {
  if (elapsedMs < 3_000) return '<3s'
  if (elapsedMs < 5_000) return '3-5s'
  if (elapsedMs < 10_000) return '5-10s'
  if (elapsedMs < 20_000) return '10-20s'
  return '>=20s'
}

const VM_BOOT_RESOURCE_SUFFIXES = ['/vm/bzImage', '/vm/rootfs.cpio.gz'] as const

/**
 * 根据本次页面最近的两个 VM 资源 timing 判断缓存状态。
 * transferSize=0 且 decodedBodySize>0 表示资源来自浏览器缓存；资源 timing
 * 缺失或浏览器隐藏体积时返回 unknown，不猜测。
 */
export function detectVmCacheState(
  entries: readonly PerformanceEntry[] = globalThis.performance?.getEntriesByType('resource') ?? [],
): VmCacheState {
  const latestByAsset = new Map<string, PerformanceResourceTiming>()
  for (const entry of entries) {
    const resource = entry as PerformanceResourceTiming
    const resourceName = resource.name.split(/[?#]/, 1)[0] ?? resource.name
    const suffix = VM_BOOT_RESOURCE_SUFFIXES.find((candidate) => resourceName.endsWith(candidate))
    if (suffix !== undefined) latestByAsset.set(suffix, resource)
  }
  if (latestByAsset.size !== VM_BOOT_RESOURCE_SUFFIXES.length) return 'unknown'
  const resources = [...latestByAsset.values()]
  if (
    resources.some(
      (resource) =>
        typeof resource.transferSize !== 'number' ||
        typeof resource.decodedBodySize !== 'number' ||
        resource.decodedBodySize <= 0,
    )
  ) {
    return 'unknown'
  }
  if (resources.some((resource) => resource.transferSize > 0)) return 'cold'
  return resources.every((resource) => resource.transferSize === 0) ? 'warm' : 'unknown'
}

const DEFAULT_READY_TIMEOUT_MS = 60_000
/** 稳态切关等待 guest 签名确认（level-ready/lab-ready）的最长时间 */
const NAVIGATION_CONFIRM_TIMEOUT_MS = 8_000
/**
 * guest 登录 shell 提示符（与 scripts/integration-test.mjs 的 GUEST_PROMPT 同源）。
 * init 先签发 ready 再 setsid cttyhack 启动 shell，tty 切换会吞掉 ready 后先到
 * 的串口字节；启动期的进度恢复命令必须等首个提示符出现（shell 开始读输入）。
 */
const SHELL_PROMPT_PATTERN = /guest@hashteam(?:\x1b\[[0-9;]*m)*:(?:\x1b\[[0-9;]*m)*/

export interface VirtualMachineOptions {
  /** 控制器工厂可注入，便于验证失败重试、监听释放等生命周期行为。 */
  createController?: (onStageChange: (stage: BootStage) => void) => VirtualMachineController
  /** 从加载首个静态资源到 Linux 发出 ready 协议的全流程最长等待时间。 */
  readyTimeoutMs?: number
  /** 当前学习模式读取器；测试可注入以覆盖判题分流。 */
  getMode?: () => LabMode
  /** 当前工作台所属 module；单例可在路由切换后通过 setModule 更新。 */
  module?: ModuleId
  /** 测试可注入；默认从 PerformanceResourceTiming 判断 VM 资产冷热缓存。 */
  getVmCacheState?: () => VmCacheState
}

function isKnownLevel(level: number): boolean {
  return Number.isInteger(level) && level >= 1 && level <= TOTAL_LEVELS
}

function isKnownLab(labId: string): boolean {
  return getCourseLab(labId) !== undefined
}

/**
 * 创建一套独立的虚拟机状态与协议路由。
 *
 * 应用通过 useVirtualMachine() 消费模块级单例；测试可直接调用本函数注入
 * 假控制器，验证启动失败、超时与销毁等故障路径。
 */
export function createVirtualMachine(options: VirtualMachineOptions = {}) {
  const stage = ref<BootStage>('idle')
  const debuggerState = ref<'idle' | Extract<ProtocolMessage, { type: 'debugger-state' }>['state']>('idle')
  const errorMessage = ref<string | null>(null)
  const defaultOwner: VirtualMachineOwner = Symbol('default-vm-owner')
  const displayCallbacks = new Map<
    VirtualMachineOwner,
    Set<(data: string) => void>
  >()
  const progress = useLabProgress()
  const anomalyCenter = useAnomalyCenter()
  let activeModule: ModuleId = options.module ?? 'seclab'
  const getTelemetry = () => useTelemetry(activeModule)
  const getMode =
    options.getMode ??
    (() => useLabPreferences().state.mode ?? 'guided')

  const createController =
    options.createController ??
    ((onStageChange: (nextStage: BootStage) => void) => new V86Controller(undefined, onStageChange))
  const readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS
  const getVmCacheState = options.getVmCacheState ?? detectVmCacheState

  let controller: VirtualMachineController | null = null
  let protocol: SerialProtocol | null = null
  let terminalSize: { cols: number; rows: number } | null = null
  let readyTimer: number | null = null
  let bootTask: {
    generation: number
    owner: VirtualMachineOwner
    ownerGeneration: number
    promise: Promise<void>
  } | null = null
  let generation = 0
  let releaseBarrier: Promise<void> = Promise.resolve()
  let releasePendingCount = 0
  let activeOwner: VirtualMachineOwner | null = defaultOwner
  let ownerGeneration = 0
  /** 本次启动的评分会话密钥（来自首个 ready；换 VM 即失效） */
  let sessionKey: CryptoKey | null = null
  /** 首个 ready 一到即钉住（即使密钥缺失/非法，后续 ready 也不得补换密钥） */
  let readySeen = false
  /** 协议消息按到达顺序串行处理（验签是异步的） */
  let messageChain: Promise<void> = Promise.resolve()
  /** 当前页面会话临时放行的实验；不进入进度存储，也不参与完成判定。 */
  const temporarilyUnlockedLabIds = new Set<string>()
  let bootStartedAt = 0
  /** 已下发串口、仍在等待 guest 签名确认的稳态切关；确认前不提交进度选关。 */
  let pendingNavigation: { kind: 'level' | 'lab'; target: number | string; timer: number } | null =
    null
  /** ready 已到但首个 shell 提示符未出现：进度恢复命令推迟到提示符后下发 */
  let bootRestorePending = false
  /** 提示符匹配的滚动尾缓冲（提示符可能横跨多个串口数据块） */
  let promptTail = ''

  function isActiveOwner(owner: VirtualMachineOwner, seenOwnerGeneration?: number): boolean {
    return (
      activeOwner === owner &&
      (seenOwnerGeneration === undefined || ownerGeneration === seenOwnerGeneration)
    )
  }

  function activateDefaultOwner(owner: VirtualMachineOwner): boolean {
    if (activeOwner === null && owner === defaultOwner) {
      activeOwner = owner
      ownerGeneration += 1
    }
    return activeOwner === owner
  }

  function emitDisplay(data: string): void {
    if (activeOwner === null) return
    displayCallbacks.get(activeOwner)?.forEach((callback) => callback(data))
  }

  function isTemporarilyUnlocked(labId: string): boolean {
    return temporarilyUnlockedLabIds.has(labId)
  }

  function canNavigateToLab(lab: CourseLabDef): boolean {
    return (
      isTemporarilyUnlocked(lab.labId) ||
      isLabUnlocked(lab, progress.state.completedLabIds, progress.state.completedLevels)
    )
  }

  function canNavigateToLevel(level: number): boolean {
    return (
      isTemporarilyUnlocked(legacyLabId(level)) ||
      level === 1 ||
      progress.state.completedLevels.includes(level - 1)
    )
  }

  function clearReadyTimer(): void {
    if (readyTimer === null) return
    window.clearTimeout(readyTimer)
    readyTimer = null
  }

  function hasReachedReady(): boolean {
    return stage.value === 'ready'
  }

  function cancelNavigationConfirmation(): void {
    if (pendingNavigation === null) return
    window.clearTimeout(pendingNavigation.timer)
    pendingNavigation = null
  }

  /** guest 回了签名 level-ready/lab-ready：切关确认到达，撤销失败计时。 */
  function confirmNavigation(kind: 'level' | 'lab', target: number | string): void {
    if (pendingNavigation?.kind !== kind || pendingNavigation.target !== target) return
    cancelNavigationConfirmation()
  }

  /**
   * 稳态切关改为「确认后提交」：命令被前台交互程序（如 python REPL）吞掉或
   * guest 执行失败时不会有确认消息；超时给出终端提示，界面选关保持原关，
   * 避免界面与终端脱钩。
   */
  function armNavigationConfirmation(kind: 'level' | 'lab', target: number | string): void {
    cancelNavigationConfirmation()
    const timer = window.setTimeout(() => {
      pendingNavigation = null
      emitDisplay(
        '\r\n\x1b[33m关卡切换未生效：终端环境正忙或没有响应。\x1b[0m\r\n' +
          '\x1b[33m请退出终端里的前台程序（如 python、cat）后重新选择关卡。\x1b[0m\r\n',
      )
    }, NAVIGATION_CONFIRM_TIMEOUT_MS)
    pendingNavigation = { kind, target, timer }
  }

  /**
   * 释放当前会话。控制器先从当前代际摘除，再把 stop 串到释放屏障；
   * 后续 boot 必须等所有旧 stop 完成，避免连续 restart 遗留并行 v86。
   */
  async function releaseCurrentVm(): Promise<void> {
    generation += 1
    clearReadyTimer()
    cancelNavigationConfirmation()
    bootRestorePending = false
    promptTail = ''
    sessionKey = null
    readySeen = false

    const currentProtocol = protocol
    const currentController = controller
    const pendingMessages = messageChain
    const previousRelease = releaseBarrier
    protocol = null
    controller = null
    // 新会话使用独立队列；旧队列会在 generation 检查处失效，并在释放完成前排空。
    messageChain = Promise.resolve()
    currentProtocol?.dispose()

    releasePendingCount += 1
    const task = (async () => {
      try {
        await previousRelease
        if (currentController !== null) {
          try {
            await currentController.stop()
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            log('boot', `释放旧虚拟机失败：${message}`, 'warn')
          }
        }
        await pendingMessages
      } finally {
        releasePendingCount -= 1
      }
    })()
    releaseBarrier = task
    await task
  }

  async function failCurrentBoot(message: string, failedGeneration: number): Promise<void> {
    if (failedGeneration !== generation) return
    log('boot', `启动失败：${message}`, 'error')
    if (activeModule === 'pwnhub') {
      const outcome: VmBootOutcome = message.includes('启动超过')
        ? 'timeout'
        : stage.value === 'loading-assets'
          ? 'asset_error'
          : 'linux_error'
      getTelemetry().trackVmBoot(outcome, vmBootDuration(Date.now() - bootStartedAt), getVmCacheState())
    }
    const release = releaseCurrentVm()
    const releasedGeneration = generation
    await release
    if (generation !== releasedGeneration) return
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
            module: activeModule,
            isSecureContext: window.isSecureContext,
          })
        }
        if (message.key === undefined) {
          log('protocol', 'ready 未携带会话密钥，本次启动的评分结果将被拒绝', 'warn')
          if (!subtleUnavailable) {
            anomalyCenter.report({
              kind: 'missing-session-key',
              module: activeModule,
              keyPresent: false,
            })
          }
        } else {
          const importedKey = await importSessionKey(message.key)
          if (messageGeneration !== generation) return
          sessionKey = importedKey
          if (importedKey === null) {
            log('protocol', '会话密钥导入失败，本次启动的评分结果将被拒绝', 'warn')
            // subtle 缺失导致的导入失败已按 crypto-unavailable 上报，不重复
            if (!subtleUnavailable) {
              anomalyCenter.report({
                kind: 'missing-session-key',
                module: activeModule,
                keyPresent: true,
              })
            }
          }
        }
        clearReadyTimer()
        log('stage', `ready 到达，进入实验 ${progress.state.currentLabId}`)
        if (activeModule === 'pwnhub') {
          getTelemetry().trackVmBoot(
            'ready',
            vmBootDuration(Date.now() - bootStartedAt),
            getVmCacheState(),
          )
        }
        stage.value = 'ready'
        // 进度恢复推迟到首个 shell 提示符：init 先签 ready 再 setsid cttyhack
        // 启动登录 shell，tty 切换会吞掉 ready 后立即下发的串口字节（实测
        // mark-completed 丢失导致 guest 解锁检查拒绝 goto，界面与终端脱关）。
        bootRestorePending = true
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
        const unlocked = canNavigateToLevel(message.level)
        if (!unlocked) {
          log('protocol', `忽略未解锁关卡的 level-ready（第 ${message.level} 关）`, 'warn')
          break
        }
        confirmNavigation('level', message.level)
        progress.setLevel(message.level)
        break
      }
      case 'level-result': {
        if (message.status !== 'passed') break
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
        // 验签通过但关卡与界面选关不符：终端环境已被拽离界面所在关（如 guest 内
        // 手动 goto 或跨标签重置钳制）。结果真实却无法归属当前关，给出可见提示
        // 而非静默丢弃——用户据此可知通关为何没有记录。
        if (message.level !== progress.state.currentLevel) {
          log(
            'protocol',
            `第 ${message.level} 关的通过结果与界面当前关（${progress.state.currentLevel}）不一致，未计入`,
            'warn',
          )
          emitDisplay(
            `\r\n\x1b[33m第 ${message.level} 关已在终端环境中通过，但界面当前停留在第 ` +
              `${progress.state.currentLevel} 关，结果未计入。\x1b[0m\r\n` +
              '\x1b[33m请在左侧选择终端实际所在的关卡（环境会重建），再运行一次 check。\x1b[0m\r\n',
          )
          break
        }
        // 每次验证通过的 check 都计入正确率（与首次通关统计独立，不去重）
        getTelemetry().trackCheckResult(message.level, true)
        const mode = getMode()
        const requiredSteps = getLevel(message.level)?.steps.map((step) => step.id) ?? []
        const completedSteps = new Set(progress.completedStepsFor(message.level))
        if (
          mode === 'challenge' ||
          requiredSteps.every((stepId) => completedSteps.has(stepId))
        ) {
          const path =
            mode === 'guided'
              ? 'guided'
              : progress.hasGuidedAssistance(message.level)
                ? 'mixed'
                : 'challenge'
          const wasNewCompletion = progress.complete(message.level, {
            path,
            hintsUsed: progress.hintsUsedFor(message.level),
          })
          // 只有首次完成才产生遥测事件：重复 check、协议重放、页面刷新均不重复统计
          if (wasNewCompletion) getTelemetry().trackLevelComplete(message.level, path)
        } else {
          const notice =
            '\r\n\x1b[33m环境结果已经正确，但还需要完成右侧当前教学步骤，' +
            '确认你观察过关键输出后再运行一次 check。\x1b[0m\r\n'
          emitDisplay(notice)
        }
        break
      }
      case 'lab-ready': {
        const lab = getCourseLab(message.labId)
        if (lab === undefined || lab.legacyLevel !== undefined) break
        const readyVerified =
          sessionKey !== null &&
          message.sig !== undefined &&
          (await verifySignature(sessionKey, labReadyMessage(message.labId), message.sig))
        if (messageGeneration !== generation) return
        if (!readyVerified) {
          log('protocol', `忽略未通过验签的 lab-ready（${message.labId}）`, 'warn')
          break
        }
        if (!canNavigateToLab(lab)) {
          log('protocol', `忽略未解锁实验的 lab-ready（${message.labId}）`, 'warn')
          break
        }
        confirmNavigation('lab', message.labId)
        progress.setLab(message.labId)
        debuggerState.value = 'idle'
        break
      }
      case 'lab-result': {
        if (message.status !== 'passed') break
        const lab = getCourseLab(message.labId)
        if (lab === undefined || lab.legacyLevel !== undefined) break
        const resultVerified =
          sessionKey !== null &&
          message.sig !== undefined &&
          (await verifySignature(
            sessionKey,
            labResultMessage(message.labId, 'passed'),
            message.sig,
          ))
        if (messageGeneration !== generation) return
        if (!resultVerified) {
          log('protocol', `忽略未通过验签的 lab-result（${message.labId}）`, 'warn')
          break
        }
        // 与 level-result 同理：验签通过但实验与界面选关不符时给出可见提示。
        if (message.labId !== progress.state.currentLabId) {
          log(
            'protocol',
            `实验 ${message.labId} 的通过结果与界面当前实验（${progress.state.currentLabId}）不一致，未计入`,
            'warn',
          )
          emitDisplay(
            `\r\n\x1b[33m实验「${lab.title}」已在终端环境中通过，但界面当前停留在其他实验，结果未计入。\x1b[0m\r\n` +
              '\x1b[33m请在左侧选择终端实际所在的实验（环境会重建），再运行一次 check。\x1b[0m\r\n',
          )
          break
        }
        getTelemetry().trackActivityCheck(message.labId, true)
        const mode = getMode()
        const completedSteps = new Set(progress.completedLabStepsFor(message.labId))
        if (mode === 'challenge' || lab.steps.every((step) => completedSteps.has(step.id))) {
          const path =
            mode === 'guided'
              ? 'guided'
              : progress.hasLabGuidedAssistance(message.labId)
                ? 'mixed'
                : 'challenge'
          const wasNewCompletion = progress.completeByLabId(message.labId, lab.chapterId, {
            path,
            hintsUsed: progress.labHintsUsedFor(message.labId),
          })
          if (wasNewCompletion) getTelemetry().trackActivityComplete(message.labId, path)
        } else {
          const notice =
            '\r\n\x1b[33m环境结果已经正确，但还需要完成右侧当前教学步骤，' +
            '确认你观察过关键输出后再运行一次 check。\x1b[0m\r\n'
          emitDisplay(notice)
        }
        break
      }
      case 'debugger-state':
        debuggerState.value = message.state
        break
      case 'telemetry-command':
        // VM wrapper 上报命令执行；allowlist 由 telemetry 层校验，非白名单静默忽略
        getTelemetry().trackCommand(message.command)
        break
      case 'hint-request':
        if (message.level !== undefined && message.level === progress.state.currentLevel) {
          progress.useHint(message.level)
          getTelemetry().trackHint(message.level)
        }
        if (message.labId !== undefined && message.labId === progress.state.currentLabId) {
          progress.useLabHint(message.labId)
          getTelemetry().trackActivityHint(message.labId)
        }
        break
      case 'progress':
        // 预留：细粒度进度消息
        break
      case 'error': {
        // htcheck 对未通过的 check 发 "level N check failed"；计入正确率分母。
        // 该消息未签名，与 telemetry-command 同属尽力而为统计（威胁模型已接受）。
        const failedLevel = /^level (\d+) check failed$/.exec(message.message)
        if (failedLevel !== null) {
          getTelemetry().trackCheckResult(Number.parseInt(failedLevel[1], 10), false)
        }
        const failedLab = /^lab ([a-z0-9-]+) check failed$/.exec(message.message)
        if (failedLab !== null) getTelemetry().trackActivityCheck(failedLab[1], false)
        // 虚拟机内检查失败等信息已在终端中给出人类可读反馈
        console.warn('[hashteam] vm error:', message.message)
        break
      }
    }
  }

  async function bootInternal(
    owner: VirtualMachineOwner,
    seenOwnerGeneration: number,
    requestedGeneration: number,
  ): Promise<void> {
    if (releasePendingCount > 0) await releaseBarrier
    if (
      generation !== requestedGeneration ||
      !isActiveOwner(owner, seenOwnerGeneration) ||
      controller !== null
    ) {
      return
    }

    errorMessage.value = null
    clearBootLog()
    stage.value = 'loading-assets'
    debuggerState.value = 'idle'
    bootRestorePending = false
    promptTail = ''
    log('stage', '阶段：loading-assets')
    bootStartedAt = Date.now()

    const currentGeneration = ++generation
    const nextController = createController((nextStage) => {
      if (generation !== currentGeneration) return
      if (stage.value !== nextStage) log('stage', `阶段：${nextStage}`)
      stage.value = nextStage
    })
    controller = nextController
    if (terminalSize !== null) nextController.setTerminalSize?.(terminalSize.cols, terminalSize.rows)
    protocol = useSerialProtocol(nextController)
    protocol.onDisplay((data) => {
      if (generation !== currentGeneration) return
      emitDisplay(data)
      // 启动恢复等待首个 shell 提示符（guest 开始读输入的标志）
      if (bootRestorePending) {
        promptTail = (promptTail + data).slice(-512)
        if (SHELL_PROMPT_PATTERN.test(promptTail)) {
          bootRestorePending = false
          promptTail = ''
          runBootRestore()
        }
      }
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
      let rejectStartTimeout!: (reason: Error) => void
      const startTimeout = new Promise<never>((_resolve, reject) => {
        rejectStartTimeout = reject
      })
      startTimer = window.setTimeout(
        () => rejectStartTimeout(new Error(timeoutMessage)),
        readyTimeoutMs,
      )
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

  /** 启动虚拟机；同 owner/代际的并发调用共享 Promise，释放完成前不会创建新控制器。 */
  async function boot(owner: VirtualMachineOwner = defaultOwner): Promise<void> {
    if (!activateDefaultOwner(owner)) return
    const seenOwnerGeneration = ownerGeneration
    const requestedGeneration = generation
    if (controller !== null && stage.value !== 'error') return
    if (
      bootTask !== null &&
      bootTask.generation === requestedGeneration &&
      bootTask.owner === owner &&
      bootTask.ownerGeneration === seenOwnerGeneration
    ) {
      return bootTask.promise
    }

    const task = bootInternal(owner, seenOwnerGeneration, requestedGeneration)
    bootTask = {
      generation: requestedGeneration,
      owner,
      ownerGeneration: seenOwnerGeneration,
      promise: task,
    }
    try {
      await task
    } finally {
      if (bootTask?.promise === task) bootTask = null
    }
  }

  function onDisplay(
    callback: (data: string) => void,
    owner: VirtualMachineOwner = defaultOwner,
  ): () => void {
    if (!activateDefaultOwner(owner)) return () => undefined
    let callbacks = displayCallbacks.get(owner)
    if (callbacks === undefined) {
      callbacks = new Set()
      displayCallbacks.set(owner, callbacks)
    }
    callbacks.add(callback)
    return () => {
      callbacks.delete(callback)
      if (callbacks.size === 0) displayCallbacks.delete(owner)
    }
  }

  function sendSerial(input: string): void {
    controller?.sendSerial(input)
  }

  function syncCompletionToVm(completedLevels: number[], completedLabIds: string[]): void {
    if (completedLevels.length > 0) {
      const maxCompleted = completedLevels.reduce((a, b) => (a > b ? a : b), 0)
      sendSerial(`hashteamctl mark-completed ${maxCompleted}\n`)
    }
    for (const labId of completedLabIds) {
      const lab = getCourseLab(labId)
      if (lab !== undefined && lab.legacyLevel === undefined) {
        sendSerial(`hashteamctl mark-lab-completed ${labId}\n`)
      }
    }
  }

  function syncTemporaryUnlockToVm(lab: CourseLabDef): void {
    if (!isTemporarilyUnlocked(lab.labId)) return

    const prerequisiteIds = new Set(lab.unlockAfter)
    const chapter = COURSE.chapters.find((item) => item.chapterId === lab.chapterId)
    chapter?.unlockAfter.forEach((labId) => prerequisiteIds.add(labId))

    let maxLegacyLevel = lab.legacyLevel === undefined ? 0 : Math.max(0, lab.legacyLevel - 1)
    for (const prerequisiteId of prerequisiteIds) {
      const prerequisite = getCourseLab(prerequisiteId)
      if (prerequisite?.legacyLevel !== undefined) {
        maxLegacyLevel = Math.max(maxLegacyLevel, prerequisite.legacyLevel)
      } else if (prerequisite !== undefined) {
        sendSerial(`hashteamctl mark-lab-completed ${prerequisite.labId}\n`)
      }
    }
    if (maxLegacyLevel > 0) sendSerial(`hashteamctl mark-completed ${maxLegacyLevel}\n`)
  }

  function clearLine(): void {
    sendSerial('\x15')
  }

  /**
   * 首个 shell 提示符出现后执行的启动恢复：回放完成集与临时解锁，再把环境
   * 切到进度选关。读取执行时刻的最新进度——恢复等待期间用户的选关点击
   * 会被采纳。同样武装确认计时：guest 拒绝恢复（如部署后实验已下架）时
   * 给出终端提示而不是无声脱关。
   */
  function runBootRestore(): void {
    syncCompletionToVm(progress.state.completedLevels, progress.state.completedLabIds)
    const currentLab = getCourseLab(progress.state.currentLabId)
    if (currentLab?.legacyLevel !== undefined) {
      syncTemporaryUnlockToVm(currentLab)
      armNavigationConfirmation('level', currentLab.legacyLevel)
      void controller?.restoreLevel(currentLab.legacyLevel)
    } else if (currentLab !== undefined) {
      syncTemporaryUnlockToVm(currentLab)
      armNavigationConfirmation('lab', currentLab.labId)
      void controller?.restoreLab(currentLab.labId)
    } else {
      armNavigationConfirmation('level', progress.state.currentLevel)
      void controller?.restoreLevel(progress.state.currentLevel)
    }
  }

  function interruptForeground(): void {
    sendSerial('\x03')
  }

  function gotoLevel(level: number): void {
    if (!isKnownLevel(level) || !canNavigateToLevel(level)) return
    debuggerState.value = 'idle'
    const lab = getCourseLab(legacyLabId(level))
    if (lab !== undefined) syncTemporaryUnlockToVm(lab)
    if (stage.value !== 'ready' || controller === null || bootRestorePending) {
      // 启动中/未启动/错误态/启动恢复窗口（ready 已到、shell 提示符未出）：
      // 直接提交选关——提示符出现时的启动恢复会按最新进度重建环境。
      progress.setLevel(level)
      void controller?.restoreLevel(level)
      return
    }
    // 稳态切换确认后提交：guest 回签名 level-ready 才移动界面选关（见
    // level-ready 分支）。先把最新完成集回放给 guest，避免跨标签刚完成的
    // 关卡在 guest 侧尚未解锁导致 goto 被拒。
    syncCompletionToVm(progress.state.completedLevels, progress.state.completedLabIds)
    armNavigationConfirmation('level', level)
    void controller.restoreLevel(level)
  }

  function gotoLab(labId: string): void {
    const lab = getCourseLab(labId)
    if (lab === undefined || !canNavigateToLab(lab)) return
    if (lab.legacyLevel !== undefined) {
      gotoLevel(lab.legacyLevel)
      return
    }
    debuggerState.value = 'idle'
    syncTemporaryUnlockToVm(lab)
    if (stage.value !== 'ready' || controller === null || bootRestorePending) {
      progress.setLab(labId)
      void controller?.restoreLab(labId)
      return
    }
    syncCompletionToVm(progress.state.completedLevels, progress.state.completedLabIds)
    armNavigationConfirmation('lab', labId)
    void controller.restoreLab(labId)
  }

  function temporarilyUnlockLab(labId: string): void {
    if (!isKnownLab(labId)) return
    temporarilyUnlockedLabIds.add(labId)
  }

  function resetCurrentLevel(): void {
    debuggerState.value = 'idle'
    if (controller?.resetLevel !== undefined) {
      void controller.resetLevel()
    } else {
      interruptForeground()
      // 与切关保持一致：reset-level 的 init 是子进程，改不了交互 shell 的 cwd，
      // 重建环境后补一行 cd 把学生 shell 带回 HOME。
      sendSerial('reset-level\ncd "$HOME"\n')
    }
    if (activeModule === 'pwnhub') {
      getTelemetry().trackActivityReset(progress.state.currentLabId)
    } else {
      getTelemetry().trackReset(progress.state.currentLevel)
    }
  }

  function handoff(owner: VirtualMachineOwner, module: ModuleId): void {
    const ownerChanged = activeOwner !== owner
    if (ownerChanged) {
      activeOwner = owner
      ownerGeneration += 1
    }
    activeModule = module
    // 跨工作台不能复用已经 ready 的环境：新工作台需要自己的 ready 恢复流程。
    // 先同步摘除旧 controller，随后 boot 会在 release 屏障后创建新代际。
    if (ownerChanged && (controller !== null || protocol !== null)) {
      void releaseCurrentVm()
    }
  }

  function setModule(
    module: ModuleId,
    owner: VirtualMachineOwner = defaultOwner,
  ): void {
    if (activateDefaultOwner(owner)) activeModule = module
  }

  function runCommand(command: string): void {
    if (controller?.runCommand !== undefined) {
      controller.runCommand(command)
      return
    }
    interruptForeground()
    clearLine()
    sendSerial(`${command}\n`)
  }

  function setTerminalSize(cols: number, rows: number): void {
    terminalSize = { cols, rows }
    controller?.setTerminalSize?.(cols, rows)
  }

  /**
   * 无条件重启当前 owner 的会话（阻断异常弹窗的修复动作）。
   * release 屏障让并发 restart/boot 收敛到同一新代际，且新控制器只会在旧 stop
   * 完整 settle 后创建。
   */
  async function restart(owner: VirtualMachineOwner = defaultOwner): Promise<void> {
    if (!activateDefaultOwner(owner)) return
    const seenOwnerGeneration = ownerGeneration
    await releaseCurrentVm()
    if (!isActiveOwner(owner, seenOwnerGeneration)) return
    await boot(owner)
  }

  /** 等待当前会话已接收的协议消息处理完毕；用于生命周期收口与确定性测试。 */
  async function waitForProtocolIdle(): Promise<void> {
    await messageChain
  }

  /** 释放指定工作台 owner；旧 owner 的延迟 dispose 只能清理自己的显示回调。 */
  async function dispose(owner: VirtualMachineOwner = defaultOwner): Promise<void> {
    displayCallbacks.delete(owner)
    if (!isActiveOwner(owner)) return

    activeOwner = null
    ownerGeneration += 1
    const disposeOwnerGeneration = ownerGeneration
    const release = releaseCurrentVm()
    const releasedGeneration = generation
    await release
    if (
      activeOwner !== null ||
      ownerGeneration !== disposeOwnerGeneration ||
      generation !== releasedGeneration
    ) {
      return
    }
    stage.value = 'idle'
    debuggerState.value = 'idle'
    errorMessage.value = null
  }

  return {
    stage,
    debuggerState,
    errorMessage,
    boot,
    restart,
    dispose,
    onDisplay,
    sendSerial,
    gotoLevel,
    gotoLab,
    setTerminalSize,
    temporarilyUnlockLab,
    handoff,
    setModule,
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
