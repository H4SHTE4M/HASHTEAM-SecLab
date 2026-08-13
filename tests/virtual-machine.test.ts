// @vitest-environment jsdom
import { createHmac, webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const telemetryMocks = vi.hoisted(() => ({
  trackCommand: vi.fn(),
  trackLevelComplete: vi.fn(),
  trackCheckResult: vi.fn(),
  trackHint: vi.fn(),
  trackReset: vi.fn(),
  trackActivityComplete: vi.fn(),
  trackActivityCheck: vi.fn(),
  trackActivityHint: vi.fn(),
  trackActivityReset: vi.fn(),
  trackVmBoot: vi.fn(),
  flush: vi.fn(async () => undefined),
  dispose: vi.fn(async () => undefined),
}))
vi.mock('../src/telemetry', () => ({
  useTelemetry: () => telemetryMocks,
}))
import {
  createVirtualMachine,
  detectVmCacheState,
} from '../src/composables/useVirtualMachine'
import { useLabProgress } from '../src/composables/useLabProgress'
import { useAnomalyCenter } from '../src/services/anomaly-center'
import { getLevel } from '../src/data/levels'
import type { BootStage, VirtualMachineController } from '../src/types/lab'

// jsdom 的 crypto 没有 subtle；验签服务走全局 crypto，测试注入 Node 的 WebCrypto
vi.stubGlobal('crypto', webcrypto)

/** 与 VM 内 init 等价的测试会话密钥（32 字节 → base64） */
const SESSION_KEY_BYTES = Buffer.alloc(32, 7)
const SESSION_KEY_BASE64 = SESSION_KEY_BYTES.toString('base64')

function sign(message: string, key: Buffer = SESSION_KEY_BYTES): string {
  return createHmac('sha256', key).update(message, 'utf8').digest('hex')
}

function protocolLine(payload: Record<string, unknown>): string {
  return `@@HASHTEAM:${JSON.stringify(payload)}\n`
}

function readyLine(key: string | null = SESSION_KEY_BASE64): string {
  return protocolLine({ type: 'ready', version: 2, ...(key === null ? {} : { key }) })
}

function passedLine(level: number, key: Buffer = SESSION_KEY_BYTES): string {
  return protocolLine({
    type: 'level-result',
    level,
    status: 'passed',
    sig: sign(`level-result:${level}:passed`, key),
  })
}

function levelReadyLine(level: number, key: Buffer = SESSION_KEY_BYTES): string {
  return protocolLine({ type: 'level-ready', level, sig: sign(`level-ready:${level}`, key) })
}

function labReadyLine(labId: string, key: Buffer = SESSION_KEY_BYTES): string {
  return protocolLine({ type: 'lab-ready', labId, sig: sign(`lab-ready:${labId}`, key) })
}

function labPassedLine(labId: string, key: Buffer = SESSION_KEY_BYTES): string {
  return protocolLine({
    type: 'lab-result',
    labId,
    status: 'passed',
    sig: sign(`lab-result:${labId}:passed`, key),
  })
}

class FakeController implements VirtualMachineController {
  readonly serialCallbacks = new Set<(data: string) => void>()
  readonly sent: string[] = []
  startCount = 0
  stopCount = 0

  constructor(
    private readonly onStageChange: (stage: BootStage) => void,
    private readonly startError?: Error,
  ) {}

  async start(): Promise<void> {
    this.startCount += 1
    this.onStageChange('starting-linux')
    if (this.startError !== undefined) throw this.startError
    this.onStageChange('preparing-env')
  }

  async stop(): Promise<void> {
    this.stopCount += 1
    this.serialCallbacks.clear()
  }

  async reset(): Promise<void> {}

  async restoreLevel(level: number): Promise<void> {
    this.sent.push(`goto:${level}`)
  }

  async restoreLab(labId: string): Promise<void> {
    this.sent.push(`goto-lab:${labId}`)
  }

  sendSerial(input: string): void {
    this.sent.push(input)
  }

  onSerialOutput(callback: (data: string) => void): () => void {
    this.serialCallbacks.add(callback)
    return () => this.serialCallbacks.delete(callback)
  }

  emit(data: string): void {
    this.serialCallbacks.forEach((callback) => callback(data))
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  useLabProgress().resetAll()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('VM cache state detection', () => {
  function resource(
    name: string,
    transferSize: number,
    decodedBodySize: number,
  ): PerformanceResourceTiming {
    return { name, transferSize, decodedBodySize } as PerformanceResourceTiming
  }

  it('两个关键资源有传输字节时判定 cold', () => {
    expect(
      detectVmCacheState([
        resource('https://lab.test/vm/bzImage', 1024, 4096),
        resource('https://lab.test/vm/rootfs.cpio.gz', 2048, 8192),
      ]),
    ).toBe('cold')
  })

  it('两个关键资源零传输且有解码体积时判定 warm', () => {
    expect(
      detectVmCacheState([
        resource('https://lab.test/vm/bzImage', 0, 4096),
        resource('https://lab.test/vm/rootfs.cpio.gz?hash=abc', 0, 8192),
      ]),
    ).toBe('warm')
  })

  it('资源 timing 不完整或体积被隐藏时保持 unknown', () => {
    expect(detectVmCacheState([resource('https://lab.test/vm/bzImage', 0, 4096)])).toBe(
      'unknown',
    )
    expect(
      detectVmCacheState([
        resource('https://lab.test/vm/bzImage', 0, 0),
        resource('https://lab.test/vm/rootfs.cpio.gz', 0, 0),
      ]),
    ).toBe('unknown')
  })
})

describe('virtual machine lifecycle', () => {
  it('启动失败会释放旧控制器，随后可以用新控制器重试', async () => {
    const controllers: FakeController[] = []
    let attempt = 0
    const vm = createVirtualMachine({
      readyTimeoutMs: 1000,
      createController: (onStageChange) => {
        const controller = new FakeController(
          onStageChange,
          attempt++ === 0 ? new Error('temporary failure') : undefined,
        )
        controllers.push(controller)
        return controller
      },
    })

    await vm.boot()
    expect(vm.stage.value).toBe('error')
    expect(controllers[0].stopCount).toBe(1)

    await vm.boot()
    expect(controllers[1].startCount).toBe(1)
    controllers[1].emit(readyLine())
    await vm.waitForProtocolIdle()
    expect(vm.stage.value).toBe('ready')

    await vm.dispose()
    expect(controllers[1].stopCount).toBe(1)
    expect(vm.stage.value).toBe('idle')
  })

  it('销毁后旧控制器输出不再分发', async () => {
    let controller: FakeController | undefined
    const vm = createVirtualMachine({
      createController: (onStageChange) => {
        controller = new FakeController(onStageChange)
        return controller
      },
    })
    const display: string[] = []
    vm.onDisplay((data) => display.push(data))

    await vm.boot()
    controller?.emit('hello\n')
    await vm.dispose()
    controller?.emit('stale\n')

    expect(display).toEqual(['hello\n'])
  })

  it('等待 ready 超时后进入可重试错误态并释放控制器', async () => {
    vi.useFakeTimers()
    let controller: FakeController | undefined
    const vm = createVirtualMachine({
      readyTimeoutMs: 10,
      createController: (onStageChange) => {
        controller = new FakeController(onStageChange)
        return controller
      },
    })

    await vm.boot()
    await vi.advanceTimersByTimeAsync(11)

    expect(vm.stage.value).toBe('error')
    expect(vm.errorMessage.value).toContain('仍未就绪')
    expect(controller?.stopCount).toBe(1)
  })

  it('资源加载本身悬挂时也会按同一总时限失败，并允许创建新控制器重试', async () => {
    vi.useFakeTimers()
    const controllers: FakeController[] = []
    let attempt = 0
    const vm = createVirtualMachine({
      readyTimeoutMs: 10,
      createController: (onStageChange) => {
        const controller = new FakeController(onStageChange)
        if (attempt++ === 0) {
          controller.start = vi.fn(async () => new Promise<void>(() => undefined))
        }
        controllers.push(controller)
        return controller
      },
    })

    const firstBoot = vm.boot()
    await vi.advanceTimersByTimeAsync(11)
    await firstBoot

    expect(vm.stage.value).toBe('error')
    expect(vm.errorMessage.value).toContain('实验环境启动超过')
    expect(controllers[0].stopCount).toBe(1)

    await vm.boot()
    // ready 的验签走 WebCrypto（libuv 宏任务），fake timers 驱动不了，切回真实时钟再断言
    vi.useRealTimers()
    controllers[1].emit(readyLine())
    await vm.waitForProtocolIdle()
    expect(vm.stage.value).toBe('ready')
    await vm.dispose()
  })

  it('重置关卡后把学生 shell 带回 HOME，避免停留在被重建的子目录', async () => {
    let controller: FakeController | undefined
    const vm = createVirtualMachine({
      createController: (onStageChange) => {
        controller = new FakeController(onStageChange)
        return controller
      },
    })

    await vm.boot()
    controller?.emit(readyLine())
    vm.resetCurrentLevel()

    expect(controller?.sent).toContain('\x03')
    expect(controller?.sent).toContain('reset-level\ncd "$HOME"\n')
    await vm.dispose()
  })

  it('环境 check 通过但教学步骤未完成时不解锁关卡', async () => {
    let controller: FakeController | undefined
    const vm = createVirtualMachine({
      getMode: () => 'guided',
      createController: (onStageChange) => {
        controller = new FakeController(onStageChange)
        return controller
      },
    })
    const display: string[] = []
    vm.onDisplay((data) => display.push(data))

    await vm.boot()
    controller?.emit(readyLine())
    await vm.waitForProtocolIdle()
    controller?.emit(passedLine(1))
    await vm.waitForProtocolIdle()

    const progress = useLabProgress()
    expect(progress.state.completedLevels).not.toContain(1)
    expect(display.join('')).toContain('还需要完成右侧当前教学步骤')

    for (const step of getLevel(1)!.steps) progress.completeStep(1, step.id)
    controller?.emit(passedLine(1))
    await vm.waitForProtocolIdle()
    expect(progress.state.completedLevels).toContain(1)
    expect(progress.state.completionRecords[1]).toEqual({ path: 'guided', hintsUsed: 0 })
    await vm.dispose()
  })

  it('挑战模式无需教学步骤即可通关，并记录提示使用量', async () => {
    let controller: FakeController | undefined
    const vm = createVirtualMachine({
      getMode: () => 'challenge',
      createController: (onStageChange) => {
        controller = new FakeController(onStageChange)
        return controller
      },
    })
    const progress = useLabProgress()
    progress.useHint(1)
    progress.useHint(1)

    await vm.boot()
    controller?.emit(readyLine())
    await vm.waitForProtocolIdle()
    controller?.emit(protocolLine({ type: 'level-result', level: 1, status: 'failed' }))
    await vm.waitForProtocolIdle()
    expect(progress.state.completedLevels).not.toContain(1)

    controller?.emit(passedLine(1))
    await vm.waitForProtocolIdle()
    expect(progress.state.completedLevels).toContain(1)
    expect(progress.state.completionRecords[1]).toEqual({
      path: 'challenge',
      hintsUsed: 2,
    })
    await vm.dispose()
  })

  it('看过引导后切回挑战通关会记录为混合完成', async () => {
    let controller: FakeController | undefined
    const vm = createVirtualMachine({
      getMode: () => 'challenge',
      createController: (onStageChange) => {
        controller = new FakeController(onStageChange)
        return controller
      },
    })
    const progress = useLabProgress()
    progress.markGuided(1)

    await vm.boot()
    controller?.emit(readyLine())
    await vm.waitForProtocolIdle()
    controller?.emit(passedLine(1))
    await vm.waitForProtocolIdle()

    expect(progress.state.completionRecords[1]).toEqual({ path: 'mixed', hintsUsed: 0 })
    await vm.dispose()
  })

  it('PwnHub ready 遥测使用真实缓存判定结果', async () => {
    let controller: FakeController | undefined
    const vm = createVirtualMachine({
      module: 'pwnhub',
      getMode: () => 'challenge',
      getVmCacheState: () => 'warm',
      createController: (onStageChange) => {
        controller = new FakeController(onStageChange)
        return controller
      },
    })

    await vm.boot()
    controller?.emit(readyLine())
    await vm.waitForProtocolIdle()
    expect(telemetryMocks.trackVmBoot).toHaveBeenCalledWith(
      'ready',
      expect.any(String),
      'warm',
    )
    await vm.dispose()
  })
})

describe('评分协议防伪与解锁门控', () => {
  function createTrackedVm(): { vm: ReturnType<typeof createVirtualMachine>; controllers: FakeController[] } {
    const controllers: FakeController[] = []
    const vm = createVirtualMachine({
      getMode: () => 'challenge',
      createController: (onStageChange) => {
        const controller = new FakeController(onStageChange)
        controllers.push(controller)
        return controller
      },
    })
    return { vm, controllers }
  }

  it('伪造的 level-result（错密钥或无签名）不被采信', async () => {
    const { vm, controllers } = createTrackedVm()
    const progress = useLabProgress()

    await vm.boot()
    controllers[0].emit(readyLine())
    await vm.waitForProtocolIdle()

    controllers[0].emit(passedLine(1, Buffer.alloc(32, 8)))
    controllers[0].emit(protocolLine({ type: 'level-result', level: 1, status: 'passed' }))
    await vm.waitForProtocolIdle()
    expect(progress.state.completedLevels).not.toContain(1)

    controllers[0].emit(passedLine(1))
    await vm.waitForProtocolIdle()
    expect(progress.state.completedLevels).toContain(1)
    await vm.dispose()
  })

  it('验签通过的 check 上报 check_result passed，重复通过也每次都计数', async () => {
    const { vm, controllers } = createTrackedVm()

    await vm.boot()
    controllers[0].emit(readyLine())
    await vm.waitForProtocolIdle()
    controllers[0].emit(passedLine(1))
    controllers[0].emit(passedLine(1))
    await vm.waitForProtocolIdle()

    expect(telemetryMocks.trackCheckResult).toHaveBeenCalledTimes(2)
    expect(telemetryMocks.trackCheckResult).toHaveBeenCalledWith(1, true)
  })

  it('未通过验签的 level-result 不上报 check_result', async () => {
    const { vm, controllers } = createTrackedVm()

    await vm.boot()
    controllers[0].emit(readyLine())
    await vm.waitForProtocolIdle()
    controllers[0].emit(passedLine(1, Buffer.alloc(32, 8)))
    controllers[0].emit(protocolLine({ type: 'level-result', level: 1, status: 'passed' }))
    await vm.waitForProtocolIdle()

    expect(telemetryMocks.trackCheckResult).not.toHaveBeenCalled()
  })

  it('check 失败的 error 协议消息上报 check_result failed', async () => {
    const { vm, controllers } = createTrackedVm()

    await vm.boot()
    controllers[0].emit(readyLine())
    await vm.waitForProtocolIdle()
    controllers[0].emit(protocolLine({ type: 'error', message: 'level 3 check failed' }))
    await vm.waitForProtocolIdle()

    expect(telemetryMocks.trackCheckResult).toHaveBeenCalledTimes(1)
    expect(telemetryMocks.trackCheckResult).toHaveBeenCalledWith(3, false)
  })

  it('与 check 无关的 error 消息不上报 check_result', async () => {
    const { vm, controllers } = createTrackedVm()

    await vm.boot()
    controllers[0].emit(readyLine())
    await vm.waitForProtocolIdle()
    controllers[0].emit(protocolLine({ type: 'error', message: 'grading signer unavailable' }))
    await vm.waitForProtocolIdle()

    expect(telemetryMocks.trackCheckResult).not.toHaveBeenCalled()
  })

  it('ready 未携带会话密钥时整局评分结果被拒绝', async () => {
    const { vm, controllers } = createTrackedVm()
    const progress = useLabProgress()
    const attackerKey = Buffer.alloc(32, 19)

    await vm.boot()
    controllers[0].emit(readyLine(null))
    await vm.waitForProtocolIdle()
    expect(vm.stage.value).toBe('ready')

    // 首条无密钥 ready 也必须钉住会话，后补攻击者密钥不能把失败会话修成自选密钥。
    controllers[0].emit(readyLine(attackerKey.toString('base64')))
    controllers[0].emit(passedLine(1, attackerKey))
    await vm.waitForProtocolIdle()
    expect(progress.state.completedLevels).not.toContain(1)
    await vm.dispose()
  })

  it('首个 ready 钉住会话密钥，后续 ready 不得替换', async () => {
    const { vm, controllers } = createTrackedVm()
    const progress = useLabProgress()
    const attackerKey = Buffer.alloc(32, 13)

    await vm.boot()
    controllers[0].emit(readyLine())
    await vm.waitForProtocolIdle()
    controllers[0].emit(readyLine(attackerKey.toString('base64')))
    await vm.waitForProtocolIdle()

    // 攻击者补发的 ready 密钥不得生效
    controllers[0].emit(passedLine(1, attackerKey))
    await vm.waitForProtocolIdle()
    expect(progress.state.completedLevels).not.toContain(1)

    // 原密钥签名的结果仍然有效
    controllers[0].emit(passedLine(1))
    await vm.waitForProtocolIdle()
    expect(progress.state.completedLevels).toContain(1)
    await vm.dispose()
  })

  it('level-ready 必须验签且只允许顺序解锁内的关卡切换', async () => {
    const { vm, controllers } = createTrackedVm()
    const progress = useLabProgress()

    await vm.boot()
    controllers[0].emit(readyLine())
    await vm.waitForProtocolIdle()
    expect(progress.state.currentLevel).toBe(1)

    // 未解锁的越级切换（第 3 关尚未解锁）：忽略
    controllers[0].emit(levelReadyLine(3))
    await vm.waitForProtocolIdle()
    expect(progress.state.currentLevel).toBe(1)

    // 伪造签名的切换：忽略
    controllers[0].emit(levelReadyLine(2, Buffer.alloc(32, 8)))
    await vm.waitForProtocolIdle()
    expect(progress.state.currentLevel).toBe(1)

    // 完成前两关后，签名正确的顺序切换生效
    progress.complete(1, { path: 'challenge', hintsUsed: 0 })
    progress.complete(2, { path: 'challenge', hintsUsed: 0 })
    controllers[0].emit(levelReadyLine(3))
    await vm.waitForProtocolIdle()
    expect(progress.state.currentLevel).toBe(3)

    // 未知关卡编号：忽略
    controllers[0].emit(levelReadyLine(99))
    await vm.waitForProtocolIdle()
    expect(progress.state.currentLevel).toBe(3)
    await vm.dispose()
  })

  it('gotoLevel 只允许顺序解锁内的跳转', async () => {
    const { vm, controllers } = createTrackedVm()
    const progress = useLabProgress()

    await vm.boot()
    controllers[0].emit(readyLine())
    await vm.waitForProtocolIdle()

    vm.gotoLevel(3)
    expect(controllers[0].sent).not.toContain('goto:3')

    progress.complete(1, { path: 'challenge', hintsUsed: 0 })
    progress.complete(2, { path: 'challenge', hintsUsed: 0 })
    vm.gotoLevel(3)
    expect(controllers[0].sent).toContain('goto:3')
    await vm.dispose()
  })

  it('dispose 之后可以重新 boot（bootPromise 不残留）', async () => {
    const { vm, controllers } = createTrackedVm()

    await vm.boot()
    controllers[0].emit(readyLine())
    await vm.waitForProtocolIdle()
    expect(vm.stage.value).toBe('ready')

    await vm.dispose()
    expect(vm.stage.value).toBe('idle')
    expect(controllers[0].stopCount).toBe(1)

    // M1 回归：dispose 必须丢弃 bootPromise，否则这里不会创建新控制器
    await vm.boot()
    expect(controllers).toHaveLength(2)
    controllers[1].emit(readyLine())
    await vm.waitForProtocolIdle()
    expect(vm.stage.value).toBe('ready')
    await vm.dispose()
  })

  it('dispose 使已排队的旧会话消息失效，且不污染下一次 boot', async () => {
    const { vm, controllers } = createTrackedVm()
    const progress = useLabProgress()
    const nextKey = Buffer.alloc(32, 23)

    await vm.boot()
    controllers[0].emit(readyLine())
    await vm.waitForProtocolIdle()

    // level-result 已入异步队列但尚未获得执行机会；dispose 必须先提升 generation，
    // 排空时只能丢弃它，不能在 VM 已释放后补写前端进度。
    controllers[0].emit(passedLine(1))
    await vm.dispose()
    expect(progress.state.completedLevels).not.toContain(1)

    await vm.boot()
    controllers[1].emit(readyLine(nextKey.toString('base64')))
    await vm.waitForProtocolIdle()
    controllers[1].emit(passedLine(1, nextKey))
    await vm.waitForProtocolIdle()
    expect(progress.state.completedLevels).toContain(1)
    await vm.dispose()
  })

  it('稳定实验临时解锁同步前置状态并接受验签 ready', async () => {
    const { vm, controllers } = createTrackedVm()
    const progress = useLabProgress()

    await vm.boot()
    controllers[0].emit(readyLine())
    await vm.waitForProtocolIdle()

    vm.temporarilyUnlockLab('memory-addresses-01')
    vm.gotoLab('memory-addresses-01')
    expect(controllers[0].sent).not.toContain('hashteamctl mark-completed 10\n')
    expect(controllers[0].sent).toContain('goto-lab:memory-addresses-01')

    progress.setLevel(1)
    controllers[0].emit(labReadyLine('memory-addresses-01'))
    await vm.waitForProtocolIdle()
    expect(progress.state.currentLabId).toBe('memory-addresses-01')
    await vm.dispose()
  })

  it('稳定实验只采信当前 labId 的有效签名通关结果', async () => {
    const { vm, controllers } = createTrackedVm()
    const progress = useLabProgress()
    const attackerKey = Buffer.alloc(32, 31)

    await vm.boot()
    controllers[0].emit(readyLine())
    await vm.waitForProtocolIdle()
    vm.temporarilyUnlockLab('memory-addresses-01')
    vm.gotoLab('memory-addresses-01')
    controllers[0].emit(labReadyLine('memory-addresses-01'))
    await vm.waitForProtocolIdle()

    controllers[0].emit(labPassedLine('memory-addresses-01', attackerKey))
    await vm.waitForProtocolIdle()
    expect(progress.state.completedLabIds).not.toContain('memory-addresses-01')

    controllers[0].emit(labPassedLine('memory-addresses-01'))
    await vm.waitForProtocolIdle()
    expect(progress.state.completedLabIds).toContain('memory-addresses-01')
    await vm.dispose()
  })
})

describe('阻断异常上报（ready 分支）', () => {
  const center = useAnomalyCenter()

  function createTrackedVm(): { vm: ReturnType<typeof createVirtualMachine>; controllers: FakeController[] } {
    const controllers: FakeController[] = []
    const vm = createVirtualMachine({
      getMode: () => 'challenge',
      createController: (onStageChange) => {
        const controller = new FakeController(onStageChange)
        controllers.push(controller)
        return controller
      },
    })
    return { vm, controllers }
  }

  beforeEach(() => {
    // resolve 幂等且同时清除 dismiss 记录：把单例中枢恢复到干净状态
    ;[...center.detected.value].forEach((anomaly) => center.resolve(anomaly))
    center.resolve({ kind: 'missing-session-key', module: 'seclab', keyPresent: false })
    center.resolve({ kind: 'missing-session-key', module: 'seclab', keyPresent: true })
    center.resolve({ kind: 'crypto-unavailable', module: 'seclab', isSecureContext: true })
    center.resolve({ kind: 'crypto-unavailable', module: 'seclab', isSecureContext: false })
  })

  it('ready 未携带密钥（subtle 可用）上报 missing-session-key', async () => {
    const { vm, controllers } = createTrackedVm()
    await vm.boot()
    controllers[0].emit(readyLine(null))
    await vm.waitForProtocolIdle()

    expect(center.detected.value).toContainEqual({ kind: 'missing-session-key', module: 'seclab', keyPresent: false })
    await vm.dispose()
  })

  it('ready 携带无法导入的密钥上报 missing-session-key（keyPresent）', async () => {
    const { vm, controllers } = createTrackedVm()
    await vm.boot()
    // 12 字节密钥：base64 恰好 16 字符能通过解析器（SESSION_KEY_PATTERN 下限），
    // 但不足 16 字节，importSessionKey 返回 null
    controllers[0].emit(readyLine(Buffer.alloc(12, 3).toString('base64')))
    await vm.waitForProtocolIdle()

    expect(center.detected.value).toContainEqual({ kind: 'missing-session-key', module: 'seclab', keyPresent: true })
    await vm.dispose()
  })

  it('crypto.subtle 缺失上报 crypto-unavailable 且不重复上报 missing-session-key', async () => {
    vi.stubGlobal('crypto', undefined)
    try {
      const { vm, controllers } = createTrackedVm()
      await vm.boot()
      controllers[0].emit(readyLine())
      await vm.waitForProtocolIdle()

      expect(center.detected.value).toContainEqual({ kind: 'crypto-unavailable', module: 'seclab', isSecureContext: window.isSecureContext })
      expect(
        center.detected.value.filter((anomaly) => anomaly.kind === 'missing-session-key'),
      ).toEqual([])
      await vm.dispose()
    } finally {
      vi.stubGlobal('crypto', webcrypto)
    }
  })

  it('正常 ready（密钥可用）不上报任何阻断异常', async () => {
    const { vm, controllers } = createTrackedVm()
    await vm.boot()
    controllers[0].emit(readyLine())
    await vm.waitForProtocolIdle()

    expect(center.detected.value).toEqual([])
    await vm.dispose()
  })
})

describe('restart 生命周期', () => {
  const center = useAnomalyCenter()

  function createTrackedVm(): { vm: ReturnType<typeof createVirtualMachine>; controllers: FakeController[] } {
    const controllers: FakeController[] = []
    const vm = createVirtualMachine({
      getMode: () => 'challenge',
      createController: (onStageChange) => {
        const controller = new FakeController(onStageChange)
        controllers.push(controller)
        return controller
      },
    })
    return { vm, controllers }
  }

  beforeEach(() => {
    ;[...center.detected.value].forEach((anomaly) => center.resolve(anomaly))
    center.resolve({ kind: 'missing-session-key', module: 'seclab', keyPresent: false })
    center.resolve({ kind: 'missing-session-key', module: 'seclab', keyPresent: true })
    center.resolve({ kind: 'crypto-unavailable', module: 'seclab', isSecureContext: true })
    center.resolve({ kind: 'crypto-unavailable', module: 'seclab', isSecureContext: false })
  })

  it('E1 修复闭环：无密钥会话 restart 后判题恢复', async () => {
    const { vm, controllers } = createTrackedVm()
    const progress = useLabProgress()

    await vm.boot()
    controllers[0].emit(readyLine(null))
    await vm.waitForProtocolIdle()
    expect(vm.stage.value).toBe('ready')
    expect(center.detected.value).toContainEqual({ kind: 'missing-session-key', module: 'seclab', keyPresent: false })

    await vm.restart()
    expect(controllers).toHaveLength(2)
    expect(controllers[0].stopCount).toBe(1)

    // readySeen/sessionKey 已重置：新 ready 被接受，带密钥的验签恢复
    controllers[1].emit(readyLine())
    await vm.waitForProtocolIdle()
    expect(vm.stage.value).toBe('ready')
    controllers[1].emit(passedLine(1))
    await vm.waitForProtocolIdle()
    expect(progress.state.completedLevels).toContain(1)
    await vm.dispose()
  })

  it('restart 期间并发 boot() 收敛为单会话', async () => {
    const { vm, controllers } = createTrackedVm()
    await vm.boot()
    controllers[0].emit(readyLine())
    await vm.waitForProtocolIdle()

    const restartPromise = vm.restart()
    const concurrentBoot = vm.boot()
    await Promise.all([restartPromise, concurrentBoot])

    // 并发窗口内可能短暂创建两个控制器，但最终只有最后一个存活
    expect(controllers.length).toBeGreaterThanOrEqual(2)
    const live = controllers[controllers.length - 1]
    expect(live.stopCount).toBe(0)
    expect(controllers.slice(0, -1).every((controller) => controller.stopCount >= 1)).toBe(true)

    live.emit(readyLine())
    await vm.waitForProtocolIdle()
    expect(vm.stage.value).toBe('ready')
    await vm.dispose()
  })

  it('dispose 中断在途 restart，不复活虚拟机', async () => {
    const { vm, controllers } = createTrackedVm()
    await vm.boot()
    controllers[0].emit(readyLine())
    await vm.waitForProtocolIdle()

    const restartPromise = vm.restart()
    await vm.dispose()
    await restartPromise

    expect(controllers).toHaveLength(1)
    expect(vm.stage.value).toBe('idle')
  })

  it('restart 撞上在途旧 boot（未就绪）也能收敛为新会话', async () => {
    const controllers: FakeController[] = []
    const vm = createVirtualMachine({
      readyTimeoutMs: 50,
      getMode: () => 'challenge',
      createController: (onStageChange) => {
        const controller = new FakeController(onStageChange)
        if (controllers.length === 0) {
          // 首个控制器 start 悬挂：模拟 restart 发起时旧 boot 仍在途
          controller.start = vi.fn(() => new Promise<void>(() => undefined))
        }
        controllers.push(controller)
        return controller
      },
    })

    const staleBoot = vm.boot()
    const restartPromise = vm.restart()
    await restartPromise

    expect(controllers).toHaveLength(2)
    controllers[1].emit(readyLine())
    await vm.waitForProtocolIdle()
    expect(vm.stage.value).toBe('ready')

    // 旧 boot 超时代际失效后静默收尾，不污染新会话
    await new Promise((resolve) => setTimeout(resolve, 60))
    await staleBoot
    expect(vm.stage.value).toBe('ready')
    expect(controllers[0].stopCount).toBe(1)
    await vm.dispose()
  })
})
