// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createVirtualMachine } from '../src/composables/useVirtualMachine'
import { useLabProgress } from '../src/composables/useLabProgress'
import { getLevel } from '../src/data/levels'
import type { BootStage, VirtualMachineController } from '../src/types/lab'

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
  window.localStorage.clear()
  useLabProgress().resetAll()
})

afterEach(() => {
  vi.useRealTimers()
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
    controllers[1].emit('@@HASHTEAM:{"type":"ready","version":1}\n')
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

  it('重置关卡前先回到 HOME，避免停留在被重建的子目录', async () => {
    let controller: FakeController | undefined
    const vm = createVirtualMachine({
      createController: (onStageChange) => {
        controller = new FakeController(onStageChange)
        return controller
      },
    })

    await vm.boot()
    controller?.emit('@@HASHTEAM:{"type":"ready","version":1}\n')
    vm.resetCurrentLevel()

    expect(controller?.sent).toContain('\x03')
    expect(controller?.sent).toContain('cd "$HOME" && reset-level\n')
    await vm.dispose()
  })

  it('环境 check 通过但教学步骤未完成时不解锁关卡', async () => {
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
    controller?.emit('@@HASHTEAM:{"type":"ready","version":1}\n')
    controller?.emit('@@HASHTEAM:{"type":"level-result","level":1,"status":"passed"}\n')

    const progress = useLabProgress()
    expect(progress.state.completedLevels).not.toContain(1)
    expect(display.join('')).toContain('还需要完成右侧当前教学步骤')

    for (const step of getLevel(1)!.steps) progress.completeStep(1, step.id)
    controller?.emit('@@HASHTEAM:{"type":"level-result","level":1,"status":"passed"}\n')
    expect(progress.state.completedLevels).toContain(1)
    await vm.dispose()
  })
})
