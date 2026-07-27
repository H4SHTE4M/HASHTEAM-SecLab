/**
 * 启动期日志总线。
 *
 * 用途：当虚拟机卡在「正在准备实验环境」等阶段时，把串口原始输出、
 * 协议消息、阶段切换等关键事件收集起来，既打到浏览器 console，
 * 也供 LoadingScreen 在界面上实时显示，方便定位是资源加载、
 * VM 启动还是 init 未发出 ready 协议的问题。
 *
 * 设计为模块级单例，组件外可直接调用 log()，界面通过 subscribe() 订阅。
 */

export interface BootLogEntry {
  /** 单调递增序号（界面渲染 key） */
  seq: number
  /** 时间戳（ms，相对页面加载） */
  time: number
  /** 日志级别 */
  level: 'info' | 'warn' | 'error'
  /** 来源标签，如 serial / protocol / stage / boot */
  source: string
  /** 文本内容 */
  text: string
}

type Listener = (entries: BootLogEntry[]) => void

const MAX_ENTRIES = 200
const entries: BootLogEntry[] = []
const listeners = new Set<Listener>()
let seq = 0
const startTime = performance.now()

function emit(): void {
  const snapshot = entries.slice()
  listeners.forEach((cb) => cb(snapshot))
}

function push(level: BootLogEntry['level'], source: string, text: string): void {
  const entry: BootLogEntry = {
    seq: ++seq,
    time: Math.round(performance.now() - startTime),
    level,
    source,
    text,
  }
  entries.push(entry)
  // 超出上限丢弃最旧的，避免无限增长
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  emit()
}

/** 记录一条日志：写入总线 + 同步打到浏览器 console */
export function log(source: string, text: string, level: BootLogEntry['level'] = 'info'): void {
  push(level, source, text)
  const prefix = `[hashteam:${source}]`
  const msg = `${prefix} ${text}`
  if (level === 'error') console.error(msg)
  else if (level === 'warn') console.warn(msg)
  else console.log(msg)
}

/** 订阅日志快照（每次变更推送全量数组） */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  // 订阅时立即推送已有日志
  listener(entries.slice())
  return () => {
    listeners.delete(listener)
  }
}

/** 清空日志（重试时调用） */
export function clear(): void {
  entries.length = 0
  emit()
}

export const bootLogger = { log, subscribe, clear }
