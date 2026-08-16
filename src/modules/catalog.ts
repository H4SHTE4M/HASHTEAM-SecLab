export type ModuleId = 'seclab' | 'pwnhub'

export interface ModuleSummary {
  moduleId: ModuleId
  title: string
  description: string
  route: string
  publishedCount: number
  plannedCount: number
}

export const MODULES: readonly ModuleSummary[] = [
  {
    moduleId: 'seclab',
    title: '安全新手村',
    description: '从真实 Linux 终端开始的安全入门实验',
    route: '/labs/seclab',
    publishedCount: 10,
    plannedCount: 10,
  },
  {
    moduleId: 'pwnhub',
    title: '二进制安全实验',
    description: '从数字与进制到 ROP 的二进制安全进阶',
    route: '/labs/pwnhub',
    publishedCount: 20,
    plannedCount: 32,
  },
]
