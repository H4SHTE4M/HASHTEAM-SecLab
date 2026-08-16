import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { contentAddressedArtifactPath } from '../vite.config'
import { COURSE, getCourseLab } from '../src/modules/pwnhub/course'
import { PUBLISHED_PWNHUB_LAB_IDS } from '../src/modules/pwnhub/published-labs'
import { parseCourseLabManifest } from '../src/services/course-manifest'
import { isChapterUnlocked, isLabUnlocked } from '../src/services/course-progress'

function manifest(): Record<string, unknown> {
  return {
    $schema: '../course.schema.json',
    schemaVersion: 3,
    courseId: 'pwnhub-foundations',
    chapterId: 'asm-reading',
    labId: 'asm-registers-01',
    title: '寄存器第一次变化',
    summary: '预测并观察一条指令造成的寄存器差分。',
    goals: ['解释 EAX 单步前后的变化'],
    prerequisites: ['终端基础'],
    kind: 'visual',
    environmentProfile: 'binary',
    estimatedMinutes: { min: 20, max: 35 },
    unlockAfter: ['foundations-terminal-10'],
    artifacts: [
      {
        path: '/opt/pwnhub/labs/asm-registers-01/registers.elf',
        architecture: 'i386',
        sha256: '0'.repeat(64),
        purpose: '单步观察样本',
        downloadable: true,
      },
    ],
    concepts: [
      { id: 'eax-register', term: 'EAX', explanation: 'i386 的通用寄存器之一。' },
    ],
    steps: [
      {
        id: 1,
        type: 'prediction',
        title: '先预测',
        objective: '写下单步后的 EAX',
        instruction: '根据当前指令选择一个结果。',
        completion: 'answer',
        allowRun: false,
      evidence: 'prediction',
      question: {
        prompt: '执行后 EAX 是多少？',
        choices: [
          { id: 'one', label: '0x00000001' },
          { id: 'zero', label: '0x00000000' },
        ],
        answer: 'one',
        success: '预测已记录。',
      },
      },
    ],
    hints: [
      { level: 1, kind: 'direction', text: '只关注 EAX。' },
      { level: 2, kind: 'tool', text: '使用寄存器差分视图。' },
      { level: 3, kind: 'structure', text: '比较执行前后的十六进制值。' },
    ],
    verification: {
      type: 'answer',
      usage: 'check <eax-value>',
      instruction: '填写观察到的值。',
      placeholders: [{ token: '<eax-value>', meaning: '单步后的 EAX' }],
      feedback: { empty: '缺少值', incorrect: '继续比较', success: '观察一致' },
    },
    completionSummary: {
      solved: '用真实执行验证了预测。',
      mastered: ['寄存器差分'],
      next: '下一实验继续观察 flags。',
    },
  }
}

describe('course manifest v3 compatibility layer', () => {
  it('只发布生产清单中的内存、漏洞、汇编与 ELF 实验', () => {
    expect(COURSE.courseId).toBe('pwnhub-foundations')
    expect(COURSE.labs.map((lab) => lab.labId)).toEqual(PUBLISHED_PWNHUB_LAB_IDS)
    expect(COURSE.chapters.filter((chapter) => chapter.status === 'available').map((chapter) => chapter.chapterId))
      .toEqual(['memory-model', 'vuln-first', 'asm-reading', 'elf-static'])
    expect(getCourseLab('memory-addresses-01')).toMatchObject({
      chapterId: 'memory-model',
      unlockAfter: [],
      environmentProfile: 'binary',
    })
    expect(getCourseLab('elf-disassembly-01')).toMatchObject({
      chapterId: 'elf-static',
      unlockAfter: ['elf-symbols-01'],
    })
  })

  it('实验数字身份与 VM 终端横幅一致：从 1 开始连续编号', () => {
    // 终端横幅第 N 关 = course-order 行序（hashteamctl course_number），
    // 头部 TopBar 第 N 关 = availableLabs 下标 + 1；二者都以 id 字段为唯一来源
    expect(COURSE.labs.map((lab) => lab.id)).toEqual(
      PUBLISHED_PWNHUB_LAB_IDS.map((_, index) => index + 1),
    )
    expect(getCourseLab('memory-addresses-01')?.id).toBe(1)
    expect(getCourseLab('vuln-weak-random-01')?.id).toBe(4)
    expect(getCourseLab('asm-registers-01')?.id).toBe(10)
  })

  it('保留后续章节路线图但不把未发布实验装入课程', () => {
    expect(COURSE.chapters.filter((chapter) => chapter.status === 'planned').map((chapter) => chapter.chapterId))
      .toEqual(['gdb-pwndbg', 'ida-companion', 'pwn-ret2win', 'rop-basics'])
    expect(getCourseLab('gdb-breakpoints-01')).toBeUndefined()
    expect(getCourseLab('pwn-ret2win-01')).toBeUndefined()
    expect(getCourseLab('rop-call-chain-01')).toBeUndefined()
  })

  it('PwnHub 可独立进入并按稳定 labId 顺序解锁', () => {
    const memory = COURSE.chapters[0]
    const vulnFirst = COURSE.chapters[1]
    const assembly = COURSE.chapters[2]
    const elf = COURSE.chapters[3]
    expect(isChapterUnlocked(memory, [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('memory-addresses-01')!, [], [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('memory-layout-01')!, [], [])).toBe(false)
    expect(isLabUnlocked(getCourseLab('memory-layout-01')!, ['memory-addresses-01'], [])).toBe(true)
    expect(isChapterUnlocked(vulnFirst, ['memory-layout-01'])).toBe(false)
    expect(isChapterUnlocked(vulnFirst, ['memory-register-stack-01'])).toBe(true)
    expect(isChapterUnlocked(assembly, ['memory-register-stack-01'])).toBe(false)
    expect(isChapterUnlocked(assembly, ['vuln-race-condition-01'])).toBe(true)
    expect(isLabUnlocked(getCourseLab('asm-registers-01')!, ['memory-register-stack-01'], [])).toBe(false)
    expect(isLabUnlocked(getCourseLab('asm-registers-01')!, ['vuln-race-condition-01'], [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('asm-arithmetic-01')!, ['asm-registers-01'], [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('asm-stack-ops-01')!, ['asm-registers-01'], [])).toBe(false)
    expect(isLabUnlocked(getCourseLab('asm-stack-ops-01')!, ['asm-arithmetic-01'], [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('asm-branches-01')!, ['asm-stack-ops-01'], [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('asm-call-stack-01')!, ['asm-branches-01'], [])).toBe(true)
    expect(isChapterUnlocked(elf, ['asm-branches-01'])).toBe(false)
    expect(isChapterUnlocked(elf, ['asm-call-stack-01'])).toBe(true)
    expect(isLabUnlocked(getCourseLab('elf-bytes-01')!, ['asm-call-stack-01'], [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('elf-sections-01')!, ['elf-bytes-01'], [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('elf-symbols-01')!, ['elf-sections-01'], [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('elf-disassembly-01')!, ['elf-symbols-01'], [])).toBe(true)
  })

  it('解析类型化验证、artifact 哈希与扩展步骤类型', () => {
    const parsed = parseCourseLabManifest(manifest(), '/course/asm-registers-01/manifest.json')
    expect(parsed.schemaVersion).toBe(3)
    expect(parsed.steps[0].type).toBe('prediction')
    expect(parsed.steps[0].question?.answer).toBe('one')
    expect(parsed.verification.type).toBe('answer')
    expect(parsed.artifacts[0].architecture).toBe('i386')
  })

  it('解析 visual-trace 与 payload-builder 的专属载荷', () => {
    const extended = manifest()
    extended.steps = [
      {
        id: 1,
        type: 'visual-trace',
        title: '比较寄存器',
        objective: '识别变化值',
        instruction: '只比较真实快照。',
        completion: 'confirm',
        allowRun: false,
        evidence: 'observation',
        initialTab: 'registers',
        workbench: {
          memory: {
            endian: 'little',
            cells: [
              {
                address: 0x0804b13c,
                name: 'cell_pointer',
                value: 0x0804b13c,
                kind: 'pointer',
                meaning: '指向 cell',
                targetAddress: 0x0804b13c,
                targetName: 'cell',
              },
            ],
          },
          registers: {
            instruction: 'mov eax, 1',
            registers: [{ name: 'eax', before: 0, after: 1 }],
            flagsBefore: [],
            flagsAfter: [],
          },
          assemblyTui: {
            title: 'mov 单步',
            states: [
              {
                id: 'before',
                title: '执行前',
                instruction: 'mov eax, 1',
                explanation: '先观察寄存器。',
                registers: {
                  instruction: 'mov eax, 1',
                  registers: [{ name: 'eax', before: 0, after: 0 }],
                  flagsBefore: [],
                  flagsAfter: [],
                },
              },
              {
                id: 'after',
                title: '执行后',
                instruction: 'mov eax, 1',
                explanation: '核对寄存器变化。',
                registers: {
                  instruction: 'mov eax, 1',
                  registers: [{ name: 'eax', before: 0, after: 1 }],
                  flagsBefore: [],
                  flagsAfter: [],
                },
              },
            ],
          },
        },
      },
      {
        id: 2,
        type: 'payload-builder',
        title: '组装输入',
        objective: '写出确定性 stdin 文件',
        instruction: '按顺序拼接字节。',
        completion: 'confirm',
        allowRun: false,
        evidence: 'payload-replay',
        payload: {
          outputPath: 'payload.bin',
          maxBytes: 256,
          segments: [
            { id: 'padding', label: 'padding', kind: 'padding', byte: 65, length: 16 },
            { id: 'target', label: 'target', kind: 'p32', value: '0x08049000' },
          ],
        },
      },
    ]

    const parsed = parseCourseLabManifest(extended)
    expect(parsed.steps[0]).toMatchObject({ type: 'visual-trace', initialTab: 'registers' })
    expect(parsed.steps[0].type === 'visual-trace' && parsed.steps[0].workbench.memory?.cells[0]).toMatchObject({
      name: 'cell_pointer',
      targetName: 'cell',
    })
    expect(parsed.steps[0].type === 'visual-trace' && parsed.steps[0].workbench.assemblyTui).toMatchObject({
      title: 'mov 单步',
      states: [{ id: 'before' }, { id: 'after' }],
    })
    expect(parsed.steps[1]).toMatchObject({ type: 'payload-builder', evidence: 'payload-replay' })
  })

  it('解析 external-tool 伴侣并绑定当前稳定 labId', () => {
    const external = manifest()
    external.steps = [
      {
        id: 1,
        type: 'external-tool',
        title: '外部静态分析',
        objective: '定位验证函数',
        instruction: '选择任一等价路线完成目标。',
        completion: 'confirm',
        allowRun: false,
        evidence: 'external-observation',
        companion: {
          labId: 'asm-registers-01',
          title: '定位验证函数',
          artifact: {
            name: 'registers.elf',
            downloadUrl: '/artifacts/registers.elf',
            architecture: 'i386',
            sha256: '0'.repeat(64),
            purpose: '静态分析样本',
          },
          tools: [
            {
              tool: 'ida',
              label: 'IDA',
              versionNote: 'IDA Free 9.x',
              installNote: '从官方渠道获取并遵守许可。',
              steps: ['定位 main。'],
            },
            {
              tool: 'objdump',
              label: 'objdump',
              versionNote: 'GNU binutils 2.40+',
              installNote: '使用课程 profile 内工具。',
              steps: ['查看符号表。'],
            },
          ],
          tasks: [{ id: 'locate-main', title: '定位 main', description: '找到主函数。' }],
          observations: [
            { id: 'main-address', label: 'main 地址', kind: 'address', placeholder: '0x08049000', required: true },
          ],
          verificationCommandTemplate: 'check {{main-address}}',
        },
      },
    ]
    const parsed = parseCourseLabManifest(external)
    expect(parsed.steps[0]).toMatchObject({ type: 'external-tool', evidence: 'external-observation' })

    ;(external.steps as Array<Record<string, unknown>>)[0].companion = {
      ...((external.steps as Array<Record<string, unknown>>)[0].companion as Record<string, unknown>),
      labId: 'wrong-lab',
    }
    expect(() => parseCourseLabManifest(external)).toThrow('必须与实验 labId 一致')
  })

  it('companion 下载 URL 由 artifact SHA-256 内容寻址', () => {
    const labIds = ['rev-strings-xrefs-01', 'rev-functions-flow-01']
    const urls = new Set<string>()

    for (const labId of labIds) {
      const manifestPath = `vm/labs/pwnhub/${labId}/manifest.json`
      const source = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        artifacts: Array<{ path: string; sha256: string; downloadable: boolean }>
        steps: Array<{
          companion?: {
            artifact: { name: string; downloadUrl: string; sha256: string }
          }
        }>
      }
      const artifact = source.artifacts.find((item) => item.downloadable)
      const companion = source.steps.find((step) => step.companion)?.companion
      expect(artifact).toBeDefined()
      expect(companion).toBeDefined()

      const artifactName = basename(artifact!.path)
      const expectedUrl = `/${contentAddressedArtifactPath(
        artifact!.sha256,
        artifact!.path,
      )}`
      const actualSha = createHash('sha256')
        .update(readFileSync(`vm/labs/pwnhub/${labId}/${artifactName}`))
        .digest('hex')
      expect(companion!.artifact).toMatchObject({
        name: artifactName,
        downloadUrl: expectedUrl,
        sha256: artifact!.sha256,
      })
      expect(actualSha).toBe(artifact!.sha256)
      expect(contentAddressedArtifactPath('f'.repeat(64), artifact!.path))
        .not.toBe(contentAddressedArtifactPath(artifact!.sha256, artifact!.path))
      urls.add(companion!.artifact.downloadUrl)
    }

    expect(urls).toEqual(new Set([
      '/artifacts/a1d48129804d6eee16ddf44e8697b780dc47a9b2b088503bc5a41fe7543d66cb/reverse-companion',
    ]))
  })

  it('production profile 的每个下载样本使用同一内容寻址输出规则', () => {
    const profile = JSON.parse(
      readFileSync('vm/profiles/production.json', 'utf8'),
    ) as { pwnhubLabs: string[] }
    expect(profile.pwnhubLabs.length).toBeGreaterThan(0)

    for (const labId of profile.pwnhubLabs) {
      const manifestPath = `vm/labs/pwnhub/${labId}/manifest.json`
      const source = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        artifacts: Array<{ path: string; sha256: string; downloadable: boolean }>
      }
      for (const artifact of source.artifacts.filter((item) => item.downloadable)) {
        const artifactName = basename(artifact.path)
        const actualSha = createHash('sha256')
          .update(readFileSync(`vm/labs/pwnhub/${labId}/${artifactName}`))
          .digest('hex')
        expect(actualSha).toBe(artifact.sha256)
        expect(contentAddressedArtifactPath(artifact.sha256, artifact.path)).toBe(
          `artifacts/${artifact.sha256}/${artifactName}`,
        )
      }
    }
  })

  it('EdgeOne 禁止缓存 companion 并永久提供内容寻址 artifact', () => {
    const edgeOne = JSON.parse(readFileSync('edgeone.json', 'utf8')) as {
      headers: Array<{
        source: string
        headers: Array<{ key: string; value: string }>
      }>
    }
    const cacheControlBySource = Object.fromEntries(
      edgeOne.headers.map((rule) => [
        rule.source,
        rule.headers.find((header) => header.key === 'Cache-Control')?.value,
      ]),
    )

    expect(cacheControlBySource['/companion.html']).toBe('no-store')
    expect(cacheControlBySource['/artifacts/*']).toBe(
      'public, max-age=31536000, immutable',
    )
  })

  it('course.schema.json 保持有效 JSON', () => {
    const schema = JSON.parse(
      readFileSync(resolve('vm/rootfs-overlay/opt/hashteam/levels/course.schema.json'), 'utf8'),
    ) as { title: string; $defs: Record<string, unknown> }
    expect(schema.title).toContain('course manifest v3')
    expect(schema.$defs).toHaveProperty('workbench')
    expect(schema.$defs).toHaveProperty('assemblyTuiSnapshot')
    expect(schema.$defs).toHaveProperty('memorySnapshot')
    expect(schema.$defs).toHaveProperty('payloadPreset')
    expect(schema.$defs).toHaveProperty('companion')
  })

  it('拒绝未锁定哈希或倒置的预计时间', () => {
    const badHash = manifest()
    ;(badHash.artifacts as Array<Record<string, unknown>>)[0].sha256 = 'pending'
    expect(() => parseCourseLabManifest(badHash)).toThrow('sha256 必须是 64 位')

    const badTime = manifest()
    badTime.estimatedMinutes = { min: 40, max: 20 }
    expect(() => parseCourseLabManifest(badTime)).toThrow('estimatedMinutes 必须是正整数范围')
  })

  it('prediction 必须携带可验证选择并使用 answer 完成证据', () => {
    const missingQuestion = manifest()
    delete (missingQuestion.steps as Array<Record<string, unknown>>)[0].question
    expect(() => parseCourseLabManifest(missingQuestion)).toThrow('prediction 步骤必须提供 question')

    const invalidAnswer = manifest()
    ;(((invalidAnswer.steps as Array<Record<string, unknown>>)[0].question as Record<string, unknown>).answer) = 'missing'
    expect(() => parseCourseLabManifest(invalidAnswer)).toThrow('answer 必须对应一个 choices.id')
  })

  it('拒绝危险 payload 路径和越界观察值', () => {
    const unsafe = manifest()
    unsafe.steps = [
      {
        id: 1,
        type: 'payload-builder',
        title: '组装输入',
        objective: '生成文件',
        instruction: '生成文件。',
        completion: 'confirm',
        allowRun: false,
        evidence: 'payload-replay',
        payload: {
          outputPath: '../payload.bin',
          maxBytes: 64,
          segments: [{ id: 'padding', label: 'padding', kind: 'padding', byte: 65, length: 8 }],
        },
      },
    ]
    expect(() => parseCourseLabManifest(unsafe)).toThrow('安全相对路径')

    const invalidByte = manifest()
    invalidByte.steps = [
      {
        id: 1,
        type: 'visual-trace',
        title: '字节',
        objective: '观察字节',
        instruction: '观察。',
        completion: 'confirm',
        allowRun: false,
        workbench: { bytes: { baseAddress: 0, bytes: [256], endian: 'little' } },
      },
    ]
    expect(() => parseCourseLabManifest(invalidByte)).toThrow('0 到 255')
  })
})
