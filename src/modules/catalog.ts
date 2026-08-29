export type ModuleId = 'seclab' | 'pwnhub' | 'cryptolab'
export type ModuleIconName = 'terminal' | 'server' | 'lock'
export type ModuleAccent = 'cyan' | 'violet' | 'amber'

export interface RouterModuleEntry {
  kind: 'router'
  route: string
}

export interface DocumentModuleEntry {
  kind: 'document'
  href: string
}

export type ModuleEntry = RouterModuleEntry | DocumentModuleEntry

export interface ModuleReadiness {
  moduleId: ModuleId
  empty: string
  partial: string
  complete: string
}

export interface ModuleNotice {
  kind: 'wip'
  icon: 'layers'
  text: string
}

export interface ModuleSummary {
  moduleId: ModuleId
  shortTitle: string
  title: string
  description: string
  icon: ModuleIconName
  accent: ModuleAccent
  entry: ModuleEntry
  publishedCount: number
  plannedCount: number
  badge?: string
  readiness?: ModuleReadiness
  notices?: readonly ModuleNotice[]
}

export const MODULES: readonly ModuleSummary[] = [
  {
    moduleId: 'seclab',
    shortTitle: 'SecLab',
    title: '安全新手村',
    description: '从真实 Linux 终端开始的安全入门实验',
    icon: 'terminal',
    accent: 'cyan',
    entry: { kind: 'router', route: '/labs/seclab' },
    publishedCount: 10,
    plannedCount: 10,
  },
  {
    moduleId: 'pwnhub',
    shortTitle: 'PwnHub',
    title: '二进制安全实验',
    description: '从数字与进制到 ELF 静态分析的二进制安全基础',
    icon: 'server',
    accent: 'violet',
    entry: { kind: 'router', route: '/labs/pwnhub' },
    publishedCount: 20,
    plannedCount: 20,
    readiness: {
      moduleId: 'seclab',
      empty: 'PwnHub 假设你已熟悉基本 Shell；仍可直接进入。',
      partial: '已完成 {completed}/{total} 个基础实验；建议继续完成 SecLab，也可直接进入。',
      complete: '基础训练已完成，推荐进入 PwnHub。',
    },
  },
  {
    moduleId: 'cryptolab',
    shortTitle: 'CryptoLab',
    title: '交互式密码学实验',
    description: '从古典密码到 AES、RSA 的浏览器内密码学实践',
    icon: 'lock',
    accent: 'amber',
    entry: { kind: 'document', href: './crypto-lab/index.html' },
    publishedCount: 11,
    plannedCount: 11,
  },
]

export function isRouterModule(
  module: ModuleSummary,
): module is ModuleSummary & { entry: RouterModuleEntry } {
  return module.entry.kind === 'router'
}

export function resolveDocumentEntryHref(entry: DocumentModuleEntry, currentHref: string): string {
  return new URL(entry.href, currentHref).href
}
