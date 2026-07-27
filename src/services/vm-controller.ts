import type { BootStage, VirtualMachineController } from '../types/lab'
import { log } from './boot-logger'

/** v86 模拟器的最小类型声明（libv86.js 无官方 d.ts，仅声明我们用到的 API） */
export interface V86Emulator {
  add_listener(event: 'serial0-output-byte', callback: (byte: number) => void): void
  remove_listener(event: 'serial0-output-byte', callback: (byte: number) => void): void
  serial0_send(data: string): void
  run(): void
  stop(): void
  restart(): void
  is_running(): boolean
}

export type V86Constructor = new (options: Record<string, unknown>) => V86Emulator

declare global {
  interface Window {
    V86?: V86Constructor
  }
}

export interface VmAssetConfig {
  /** libv86.js 脚本地址 */
  libv86Url: string
  wasmUrl: string
  biosUrl: string
  bzimageUrl: string
  initrdUrl: string
  memorySize: number
  cmdline: string
}

export const DEFAULT_VM_ASSETS: VmAssetConfig = {
  libv86Url: 'v86/libv86.js',
  wasmUrl: 'v86/v86.wasm',
  biosUrl: 'v86/bios/seabios-256k.bin',
  bzimageUrl: 'vm/bzImage',
  initrdUrl: 'vm/rootfs.cpio.gz',
  memorySize: 128 * 1024 * 1024,
  cmdline: 'console=ttyS0,115200n8 quiet loglevel=3',
}

let scriptLoadingPromise: Promise<void> | null = null

/** 动态加载 libv86.js（全局只加载一次） */
function loadLibV86(url: string): Promise<void> {
  if (window.V86 !== undefined) return Promise.resolve()
  if (scriptLoadingPromise !== null) return scriptLoadingPromise
  scriptLoadingPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.onload = () => {
      if (window.V86 !== undefined) resolve()
      else reject(new Error('libv86.js 已加载，但未找到 V86 全局对象'))
    }
    script.onerror = () => reject(new Error(`无法加载脚本：${url}`))
    document.head.appendChild(script)
  })
  return scriptLoadingPromise
}

/** 预检静态资源可达性，给出明确的缺失错误（而非 v86 内部的模糊失败） */
async function assertAssetsReachable(urls: string[]): Promise<void> {
  await Promise.all(
    urls.map(async (url) => {
      let response: Response
      try {
        response = await fetch(url, { method: 'HEAD' })
      } catch {
        throw new Error(`资源无法访问：${url}（网络错误）`)
      }
      if (!response.ok) {
        throw new Error(`资源缺失：${url}（HTTP ${response.status}）。请先运行 vm/build.sh 构建虚拟机资源，详见 README。`)
      }
    }),
  )
}

/**
 * 基于 v86 的虚拟机控制器。
 * 所有 v86 API 调用都封装在此类中，不散落在 Vue 组件里。
 */
export class V86Controller implements VirtualMachineController {
  private emulator: V86Emulator | null = null
  private readonly serialCallbacks = new Set<(data: string) => void>()
  private readonly decoder = new TextDecoder('utf-8')
  /** 串口原始输出行缓冲（仅用于日志，不影响显示/协议解析） */
  private serialLogLine = ''
  private readonly byteHandler = (byte: number): void => {
    const text = this.decoder.decode(new Uint8Array([byte]), { stream: true })
    if (text === '') return
    this.serialCallbacks.forEach((cb) => cb(text))
    // 把原始串口输出按行记录到日志，便于定位 init 是否输出 ready 协议
    this.serialLogLine += text
    let nl: number
    while ((nl = this.serialLogLine.indexOf('\n')) >= 0) {
      const line = this.serialLogLine.slice(0, nl).replace(/\r$/, '')
      this.serialLogLine = this.serialLogLine.slice(nl + 1)
      if (line !== '') log('serial', line)
    }
  }

  constructor(
    private readonly assets: VmAssetConfig = DEFAULT_VM_ASSETS,
    private readonly onStageChange: (stage: BootStage, detail?: string) => void = () => undefined,
  ) {}

  async start(): Promise<void> {
    if (this.emulator !== null) return
    this.onStageChange('loading-assets')
    log('boot', '加载 libv86.js…')
    await loadLibV86(this.assets.libv86Url)
    log('boot', 'libv86.js 已加载')
    const assetUrls = [this.assets.wasmUrl, this.assets.biosUrl, this.assets.bzimageUrl, this.assets.initrdUrl]
    log('boot', `预检资源可达性：${assetUrls.join(', ')}`)
    await assertAssetsReachable(assetUrls)
    log('boot', '资源预检通过，开始实例化 v86')

    const V86 = window.V86
    if (V86 === undefined) throw new Error('V86 构造器不可用')

    this.onStageChange('starting-linux')
    this.emulator = new V86({
      wasm_path: this.assets.wasmUrl,
      memory_size: this.assets.memorySize,
      vga_memory_size: 2 * 1024 * 1024,
      // 本实验只需要串口终端，不渲染 VGA 屏幕
      screen_dummy: true,
      bios: { url: this.assets.biosUrl },
      bzimage: { url: this.assets.bzimageUrl },
      initrd: { url: this.assets.initrdUrl },
      cmdline: this.assets.cmdline,
      // 不配置 net_device：虚拟机没有网卡，天然无法访问公网
      disable_keyboard: true,
      disable_mouse: true,
      disable_speaker: true,
      // autostart:true 让 v86 在 wasm 实例化完成后自行启动 CPU。
      // 不能用 autostart:false + 立即 run()：v86 的 run() 内部执行
      // this.v86.run()，而此时 wasm 异步加载尚未完成、this.v86 仍为
      // undefined，会抛 "Cannot read properties of undefined (reading 'run')"
      // 且 Promise reject 被静默吞掉，导致 VM 永不运行、串口零输出。
      autostart: true,
    })
    this.emulator.add_listener('serial0-output-byte', this.byteHandler)
    log('boot', 'v86 已构造（autostart），等待 Linux 内核引导与 init 发出 ready 协议…')
    this.onStageChange('preparing-env')
  }

  async stop(): Promise<void> {
    if (this.emulator === null) return
    this.emulator.remove_listener('serial0-output-byte', this.byteHandler)
    this.emulator.stop()
    this.emulator = null
    this.onStageChange('idle')
  }

  /** 整机重启：回到一个全新的 Linux 环境（内存环境，重启即还原） */
  async reset(): Promise<void> {
    if (this.emulator === null) {
      await this.start()
      return
    }
    this.onStageChange('starting-linux')
    this.emulator.restart()
    this.onStageChange('preparing-env')
  }

  /**
   * 恢复到指定关卡。
   * MVP 通过向虚拟机内的 hashteamctl 发送命令重建关卡环境；
   * 后续可替换为 v86 save_state/restore_state 快照实现，接口保持不变。
   */
  async restoreLevel(level: number): Promise<void> {
    this.sendSerial(`hashteamctl goto ${level}\n`)
  }

  sendSerial(input: string): void {
    if (this.emulator === null || !this.emulator.is_running()) return
    this.emulator.serial0_send(input)
  }

  onSerialOutput(callback: (data: string) => void): () => void {
    this.serialCallbacks.add(callback)
    return () => {
      this.serialCallbacks.delete(callback)
    }
  }
}
