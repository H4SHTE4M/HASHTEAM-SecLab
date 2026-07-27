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

  /** 切换到指定关卡（更新前端进度并通知虚拟机重建关卡环境） */
  function gotoLevel(level: number): void {
    if (level < 1 || level > TOTAL_LEVELS) return
    progress.setLevel(level)
    controller?.restoreLevel(level)
  }

  /** 重置本关：只重建当前关卡的实验环境，不影响完成状态 */
  function resetCurrentLevel(): void {
    sendSerial('reset-level\n')
  }

  /** 重新开始：清空进度并整机重启（回到全新 Linux 环境） */
  async function resetAll(): Promise<void> {
    progress.resetAll()
    if (controller === null) {
      await boot()
      return
    }
    stage.value = 'starting-linux'
    await controller.reset()
  }

  return {
    stage,
    errorMessage,
    boot,
    onDisplay,
    sendSerial,
    gotoLevel,
    resetCurrentLevel,
    resetAll,
  }
}
