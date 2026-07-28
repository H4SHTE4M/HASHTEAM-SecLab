import { describe, expect, it } from 'vitest'
import {
  loadChallengeManifests,
  parseChallengeManifest,
} from '../src/services/challenge-manifest'
import { LEVELS, TOTAL_LEVELS } from '../src/data/levels'

function manifest(id = 1, slug = `level-${id}`): Record<string, unknown> {
  return {
    $schema: '../challenge.schema.json',
    schemaVersion: 2,
    id,
    slug,
    name: `关卡 ${id}`,
    tagline: '一句话说明',
    storySummary: '短背景',
    story: '可展开的完整背景',
    goals: ['完成目标'],
    prerequisites: [],
    newConcepts: ['测试概念'],
    steps: [
      {
        id: 1,
        type: 'explain',
        title: '先理解',
        objective: '理解当前概念',
        instruction: '阅读最小必要说明',
        completion: 'acknowledge',
        allowRun: false,
        introduces: [
          { id: 'test-concept', term: '测试概念', explanation: '只解释当前任务需要的部分' },
        ],
      },
    ],
    hints: [
      { level: 1, kind: 'direction', text: '先观察' },
      { level: 2, kind: 'tool', text: '再选择工具' },
      { level: 3, kind: 'structure', text: '最后看结构' },
    ],
    verification: {
      usage: 'check <结果>',
      instruction: '替换占位符',
      placeholders: [{ token: '<结果>', meaning: '从输出发现的值' }],
      feedback: { empty: '未填写', incorrect: '不匹配', success: '完成' },
    },
    completionSummary: {
      solved: '解决了问题',
      mastered: ['观察输出'],
      next: '下一关继续复用',
    },
  }
}

describe('challenge manifest v2', () => {
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

  it('解析步骤类型、概念时机、三层提示与验证占位符', () => {
    const raw = manifest()
    const parsed = parseChallengeManifest(raw, '/levels/level-1/challenge.json')

    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.steps[0]).toEqual((raw.steps as unknown[])[0])
    expect(parsed.hints.map((hint) => hint.kind)).toEqual(['direction', 'tool', 'structure'])
    expect(parsed.verification.placeholders[0].token).toBe('<结果>')
    expect(parsed.completionSummary.mastered).toEqual(['观察输出'])
  })

  it('解析补全命令字段和输出判断题', () => {
    const raw = manifest()
    raw.steps = [
      {
        id: 1,
        type: 'partial-command',
        title: '补全',
        objective: '填写参数',
        instruction: '根据输出填写',
        completion: 'input',
        allowRun: false,
        commandTemplate: 'cat {{file}}',
        fields: [{ id: 'file', label: '文件', placeholder: '从 ls 填写' }],
      },
      {
        id: 2,
        type: 'question',
        title: '判断',
        objective: '根据输出选择',
        instruction: '选择正确结果',
        completion: 'answer',
        allowRun: false,
        question: {
          prompt: '哪个正确？',
          choices: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
          answer: 'a',
          success: '正确',
        },
      },
    ]
    const parsed = parseChallengeManifest(raw, '/levels/level-1/challenge.json')
    expect(parsed.steps[0].fields?.[0].id).toBe('file')
    expect(parsed.steps[1].question?.answer).toBe('a')
  })

  it('拒绝非法问题答案与未知嵌套字段', () => {
    const invalidAnswer = manifest()
    ;(invalidAnswer.steps as Array<Record<string, unknown>>)[0] = {
      id: 1,
      type: 'question',
      title: '判断',
      objective: '选择',
      instruction: '作答',
      completion: 'answer',
      allowRun: false,
      question: {
        prompt: '选哪个',
        choices: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        answer: 'missing',
        success: '正确',
      },
    }
    expect(() =>
      parseChallengeManifest(invalidAnswer, '/levels/level-1/challenge.json'),
    ).toThrow('answer 必须对应一个 choices.id')

    const unknown = manifest()
    ;(unknown.steps as Array<Record<string, unknown>>)[0].note = '旧字段'
    expect(() => parseChallengeManifest(unknown, '/levels/level-1/challenge.json')).toThrow(
      '包含未知字段：note',
    )
  })

  it('拒绝旧 schema 版本与不完整提示层级', () => {
    expect(() =>
      parseChallengeManifest(
        { ...manifest(), schemaVersion: 1 },
        '/levels/level-1/challenge.json',
      ),
    ).toThrow('schemaVersion 必须为 2')
    expect(() =>
      parseChallengeManifest(
        { ...manifest(), hints: [] },
        '/levels/level-1/challenge.json',
      ),
    ).toThrow('hints 必须恰好包含三层')
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
