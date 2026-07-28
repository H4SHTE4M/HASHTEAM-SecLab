import type { LevelDef } from '../types/lab'
import { loadChallengeManifests } from '../services/challenge-manifest'

/**
 * 每个关卡的文案与脚本都位于同一个 level-N 目录。
 * eager glob 让构建产物仍是单个静态应用，不会在运行时额外请求 JSON。
 */
const manifestModules = import.meta.glob<unknown>(
  '../../vm/rootfs-overlay/opt/hashteam/levels/level-*/challenge.json',
  { eager: true, import: 'default' },
)

export const LEVELS = loadChallengeManifests(manifestModules)
export const TOTAL_LEVELS = LEVELS.length

export function getLevel(id: number): LevelDef | undefined {
  return LEVELS.find((level) => level.id === id)
}

/** 实验室方向（结束页与「关于实验室」共用） */
export interface LabDirection {
  name: string
  description: string
}

export const LAB_DIRECTIONS: LabDirection[] = [
  {
    name: '漏洞挖掘',
    description: '在真实软件与系统中寻找安全缺陷，从代码审计到模糊测试，把「奇怪的崩溃」变成可复现的漏洞。',
  },
  {
    name: '渗透攻防',
    description: '在授权范围内模拟攻击者的完整链路，理解防御盲区，也为校园系统做安全评估。',
  },
  {
    name: '安全开发',
    description: '把安全能力做成工具与平台：扫描器、蜜罐、自动化分析系统，让工程能力放大研究效率。',
  },
  {
    name: '校园安全运维',
    description: '参与校园网络与系统的日常安全值守：日志巡检、应急响应、基线加固，守护身边的真实环境。',
  },
]

export const CTF_POSITIONING =
  'CTF 是很好的安全入门方式——它用游戏化的关卡帮你建立手感。' +
  '但它不是实验室的最终方向：真正的目标，是把在这里练出的基本功，' +
  '用到漏洞挖掘、渗透攻防、安全开发与校园安全运维的真实世界中去。'
