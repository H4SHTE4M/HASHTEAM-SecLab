import { BUILD_INFO } from './build-info'
import { snapshot as snapshotBootLog, type BootLogEntry } from './boot-logger'
import {
  createSafeStorage,
  isStorageDegraded,
  PROGRESS_STORAGE_KEY,
} from './progress-store'
import { UI_PREFERENCES_STORAGE_KEY } from './ui-preferences-store'
import type { BlockingAnomaly } from './progress-anomaly'
import type { LabMode } from '../types/lab'

/**
 * 阻断异常现场日志：用户点一下即下载，本人不用读，
 * 发到 SDUCTF 新手村 QQ 群供开发者分析。
 *
 * 纯/污分离：buildBugReport 是纯组装（可单测）；
 * collectBugReportInput 集中全部副作用（浏览器/存储/日志快照）。
 */

/** 进度档当前的响应式状态快照（诊断当下）；progressRaw 是持久化证据，两者不互替 */
export interface LabStateSnapshot {
  currentLevel: number
  mode: LabMode | null
  completedLevels: number[]
}

export interface BugReportInput {
  trigger: BlockingAnomaly
  build: { sourceId: string; displayId: string; dirty: boolean }
  page: { url: string; userAgent: string; language: string; isSecureContext: boolean }
  labState: LabStateSnapshot
  progressRaw: string | null
  uiPreferencesRaw: string | null
  storageDegraded: boolean
  bootLog: BootLogEntry[]
  generatedAt: string
}

export interface BugReport {
  kind: 'hashteam-bug-report'
  reportVersion: 1
  generatedAt: string
  trigger: BlockingAnomaly
  build: BugReportInput['build']
  page: BugReportInput['page']
  labState: BugReportInput['labState']
  progressRaw: string | null
  uiPreferencesRaw: string | null
  storageDegraded: boolean
  bootLog: BootLogEntry[]
  /** 任一字段被截断时为 true */
  truncated: boolean
  notes: string
}

/** 自由文本字段的体积上限（UTF-8 字节）：防手改档塞入超大存储把报告撑爆 */
const RAW_FIELD_CAP_BYTES = 256 * 1024

const REPORT_NOTES =
  '终端滚动缓冲程序读不到（未安装 @xterm/addon-serialize），VM 内 check 原始输出只在终端可见；' +
  '如方便请用户在群里补一张终端最后几行的截图。' +
  'progressRaw 仅对进度矛盾/密钥类异常保留现场（损坏删档类原始串在加载校验时已被删除）。' +
  'serial 日志含学生终端内容，请只发给开发者。'

/** 按 UTF-8 字节截断；结尾的残缺序列由 TextDecoder 换成 U+FFFD（日志用途可接受） */
function capUtf8(text: string | null): { text: string | null; truncated: boolean } {
  if (text === null) return { text: null, truncated: false }
  const encoded = new TextEncoder().encode(text)
  if (encoded.length <= RAW_FIELD_CAP_BYTES) return { text, truncated: false }
  return { text: new TextDecoder().decode(encoded.slice(0, RAW_FIELD_CAP_BYTES)), truncated: true }
}

export function buildBugReport(input: BugReportInput): BugReport {
  const progress = capUtf8(input.progressRaw)
  const uiPreferences = capUtf8(input.uiPreferencesRaw)
  return {
    kind: 'hashteam-bug-report',
    reportVersion: 1,
    generatedAt: input.generatedAt,
    trigger: input.trigger,
    build: input.build,
    page: input.page,
    labState: input.labState,
    progressRaw: progress.text,
    uiPreferencesRaw: uiPreferences.text,
    storageDegraded: input.storageDegraded,
    bootLog: input.bootLog,
    truncated: progress.truncated || uiPreferences.truncated,
    notes: REPORT_NOTES,
  }
}

export function collectBugReportInput(
  trigger: BlockingAnomaly,
  labState: LabStateSnapshot,
): BugReportInput {
  // 读取持久化原始串必须经过容错存储：降级时直接访问 localStorage 可能抛错
  const storage = createSafeStorage()
  return {
    trigger,
    build: {
      sourceId: BUILD_INFO.sourceId,
      displayId: BUILD_INFO.displayId,
      dirty: BUILD_INFO.dirty,
    },
    page: {
      url: window.location.href,
      userAgent: window.navigator.userAgent,
      language: window.navigator.language,
      isSecureContext: window.isSecureContext,
    },
    labState: {
      currentLevel: labState.currentLevel,
      mode: labState.mode,
      completedLevels: [...labState.completedLevels],
    },
    progressRaw: storage.getItem(PROGRESS_STORAGE_KEY),
    uiPreferencesRaw: storage.getItem(UI_PREFERENCES_STORAGE_KEY),
    storageDegraded: isStorageDegraded(),
    bootLog: snapshotBootLog(),
    generatedAt: new Date().toISOString(),
  }
}

/**
 * 组装并触发下载。返回是否成功——弹窗只在成功时展示「已下载」，
 * 失败时保留按钮让学生重试。
 */
export async function downloadBugReport(
  trigger: BlockingAnomaly,
  labState: LabStateSnapshot,
): Promise<boolean> {
  try {
    const report = buildBugReport(collectBugReportInput(trigger, labState))
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    try {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `hashteam-bug-report-${report.generatedAt.replace(/[:.]/g, '-')}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } finally {
      URL.revokeObjectURL(url)
    }
    return true
  } catch (error) {
    console.warn('[hashteam:bug-report] 下载问题日志失败', error)
    return false
  }
}
