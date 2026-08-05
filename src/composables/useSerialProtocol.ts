import { SerialProtocolParser } from '../services/protocol-parser'
import type { ProtocolMessage, VirtualMachineController } from '../types/lab'

/**
 * 串口协议胶水层返回的订阅句柄：
 * 原始串口输出 → 解析器 → （终端显示文本 | 协议消息）两路分发。
 */
export interface SerialProtocol {
  /** 订阅「应显示到终端」的文本 */
  onDisplay: (callback: (data: string) => void) => () => void
  /** 订阅协议消息 */
  onMessage: (callback: (message: ProtocolMessage) => void) => () => void
  /** 解除控制器上的监听并冲刷解析器残留缓冲 */
  dispose: () => void
}

/**
 * 串口协议胶水层：
 * 原始串口输出 → 解析器 → （终端显示文本 | 协议消息）两路分发。
 * 避免重复注册串口回调：dispose 时会解除控制器上的监听。
 */
export function useSerialProtocol(controller: VirtualMachineController): SerialProtocol {
  const parser = new SerialProtocolParser()
  const displayCallbacks = new Set<(data: string) => void>()
  const messageCallbacks = new Set<(message: ProtocolMessage) => void>()

  const unsubscribeSerial = controller.onSerialOutput((raw) => {
    const { display, messages } = parser.feed(raw)
    if (display !== '') {
      displayCallbacks.forEach((cb) => cb(display))
    }
    for (const message of messages) {
      messageCallbacks.forEach((cb) => cb(message))
    }
  })

  /** 订阅「应显示到终端」的文本 */
  function onDisplay(callback: (data: string) => void): () => void {
    displayCallbacks.add(callback)
    return () => {
      displayCallbacks.delete(callback)
    }
  }

  /** 订阅协议消息 */
  function onMessage(callback: (message: ProtocolMessage) => void): () => void {
    messageCallbacks.add(callback)
    return () => {
      messageCallbacks.delete(callback)
    }
  }

  function dispose(): void {
    unsubscribeSerial()
    const { display } = parser.flush()
    if (display !== '') {
      displayCallbacks.forEach((cb) => cb(display))
    }
    displayCallbacks.clear()
    messageCallbacks.clear()
  }

  return { onDisplay, onMessage, dispose }
}
