import { describe, expect, it } from 'vitest'
import {
  loadChallengeManifests,
  parseChallengeManifest,
} from '../src/services/challenge-manifest'
import { LEVELS, TOTAL_LEVELS } from '../src/data/levels'

function manifest(id = 1, slug = `level-${id}`): Record<string, unknown> {
  return {
    $schema: '../challenge.schema.json',
    schemaVersion: 1,
    id,
    slug,
    name: `关卡 ${id}`,
    tagline: '一句话说明',
    story: '关卡背景故事',
    goals: ['完成目标'],
    suggestedCommands: ['help'],
    hints: ['查看提示'],
    teaches: ['教学目标'],
    checkUsage: 'check',
  }
}

describe('challenge manifest', () => {
  it('自动发现仓库中的全部关卡配置', () => {
    expect(TOTAL_LEVELS).toBe(10)
    expect(LEVELS.map((level) => level.slug)).toEqual([
      'welcome-terminal',
      'hidden-file',
      'tidy-up',
      'file-permissions',
      'reading-logs',
      'auth-log-analysis',
      'encoding-forensics',
      'backdoor-process',
      'debug-endpoint',
      'secure-configuration',
    ])
  })

  it('解析合法配置与可选命令讲解', () => {
    const raw = {
      ...manifest(),
      guide: [{ command: 'whoami', note: '查看当前用户' }, { note: '观察输出' }],
    }

    const parsed = parseChallengeManifest(raw, '/levels/level-1/challenge.json')
    expect(parsed.slug).toBe('level-1')
    expect(parsed.guide).toEqual(raw.guide)
  })

  it('解析核心概念与通关回顾（可选字段）', () => {
    const raw = {
      ...manifest(),
      concepts: [
        { term: '最小权限原则', explanation: '只授予完成工作所必需的权限' },
        { term: '日志审计', explanation: '从日志中还原事件真相' },
      ],
      takeaway: '这一关教会你读日志',
    }

    const parsed = parseChallengeManifest(raw, '/levels/level-1/challenge.json')
    expect(parsed.concepts).toEqual(raw.concepts)
    expect(parsed.takeaway).toBe('这一关教会你读日志')
  })

  it('拒绝非法的核心概念与通关回顾', () => {
    expect(() =>
      parseChallengeManifest(
        { ...manifest(), concepts: [] },
        '/levels/level-1/challenge.json',
      ),
    ).toThrow('concepts 存在时必须是非空数组')
    expect(() =>
      parseChallengeManifest(
        { ...manifest(), concepts: [{ term: '只给 term' }] },
        '/levels/level-1/challenge.json',
      ),
    ).toThrow('explanation 必须是非空字符串')
    expect(() =>
      parseChallengeManifest(
        { ...manifest(), takeaway: '   ' },
        '/levels/level-1/challenge.json',
      ),
    ).toThrow('takeaway 存在时必须是非空字符串')
  })

  it('拒绝空数组与不支持的 schema 版本', () => {
    expect(() =>
      parseChallengeManifest(
        { ...manifest(), schemaVersion: 2 },
        '/levels/level-1/challenge.json',
      ),
    ).toThrow('schemaVersion 必须为 1')
    expect(() =>
      parseChallengeManifest(
        { ...manifest(), hints: [] },
        '/levels/level-1/challenge.json',
      ),
    ).toThrow('hints 必须是至少包含一项')
  })

  it('拒绝 manifest id 与所在目录不一致', () => {
    expect(() =>
      parseChallengeManifest(manifest(2), '/levels/level-3/challenge.json'),
    ).toThrow('与目录 level-3 不一致')
  })

  it('按 id 排序并要求编号连续', () => {
    const loaded = loadChallengeManifests({
      '/levels/level-2/challenge.json': manifest(2),
      '/levels/level-1/challenge.json': manifest(1),
    })
    expect(loaded.map((level) => level.id)).toEqual([1, 2])

    expect(() =>
      loadChallengeManifests({
        '/levels/level-1/challenge.json': manifest(1),
        '/levels/level-3/challenge.json': manifest(3),
      }),
    ).toThrow('关卡编号必须连续')
  })

  it('拒绝重复 slug', () => {
    expect(() =>
      loadChallengeManifests({
        '/levels/level-1/challenge.json': manifest(1, 'duplicate'),
        '/levels/level-2/challenge.json': manifest(2, 'duplicate'),
      }),
    ).toThrow('slug duplicate 重复')
  })
})
