import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCourseLabManifest } from '../src/services/course-manifest'

const artifactPath = 'vm/labs/pwnhub/pwn-ret2win-01/ret2win'
const manifestPath = 'vm/labs/pwnhub/pwn-ret2win-01/manifest.json'
const memoryArtifactPath = 'vm/labs/pwnhub/memory-addresses-01/memory-addresses'
const memoryManifestPath = 'vm/labs/pwnhub/memory-addresses-01/manifest.json'
const memoryLayoutArtifactPath = 'vm/labs/pwnhub/memory-layout-01/memory-layout'
const memoryLayoutScriptPath = 'vm/labs/pwnhub/memory-layout-01/inspect-memory-layout.sh'
const memoryLayoutManifestPath = 'vm/labs/pwnhub/memory-layout-01/manifest.json'
const memoryRegisterStackArtifactPath = 'vm/labs/pwnhub/memory-register-stack-01/memory-register-stack'
const memoryRegisterStackManifestPath = 'vm/labs/pwnhub/memory-register-stack-01/manifest.json'
const asmArtifactPath = 'vm/labs/pwnhub/asm-registers-01/asm-registers'
const asmManifestPath = 'vm/labs/pwnhub/asm-registers-01/manifest.json'
const arithmeticArtifactPath = 'vm/labs/pwnhub/asm-arithmetic-01/asm-arithmetic'
const arithmeticManifestPath = 'vm/labs/pwnhub/asm-arithmetic-01/manifest.json'
const stackOpsArtifactPath = 'vm/labs/pwnhub/asm-stack-ops-01/asm-stack-ops'
const stackOpsManifestPath = 'vm/labs/pwnhub/asm-stack-ops-01/manifest.json'
const branchesArtifactPath = 'vm/labs/pwnhub/asm-branches-01/asm-branches'
const branchesManifestPath = 'vm/labs/pwnhub/asm-branches-01/manifest.json'
const callStackArtifactPath = 'vm/labs/pwnhub/asm-call-stack-01/asm-call-stack'
const callStackManifestPath = 'vm/labs/pwnhub/asm-call-stack-01/manifest.json'
const elfBytesArtifactPath = 'vm/labs/pwnhub/elf-bytes-01/elf-bytes'
const elfBytesManifestPath = 'vm/labs/pwnhub/elf-bytes-01/manifest.json'
const elfSectionsArtifactPath = 'vm/labs/pwnhub/elf-sections-01/elf-sections'
const elfSectionsManifestPath = 'vm/labs/pwnhub/elf-sections-01/manifest.json'
const elfSymbolsArtifactPath = 'vm/labs/pwnhub/elf-symbols-01/elf-symbols'
const elfSymbolsManifestPath = 'vm/labs/pwnhub/elf-symbols-01/manifest.json'
const elfDisassemblyArtifactPath = 'vm/labs/pwnhub/elf-disassembly-01/elf-disassembly'
const elfDisassemblyManifestPath = 'vm/labs/pwnhub/elf-disassembly-01/manifest.json'
const readelfToolPath = 'vm/binary-tools/staged/readelf'
const nmToolPath = 'vm/binary-tools/staged/nm'
const objdumpToolPath = 'vm/binary-tools/staged/objdump'
const gdbToolPath = 'vm/binary-tools/staged/gdb'
const profilePath = 'vm/binary-profile/assets.json'

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

describe('staged i386 binary profile', () => {
  it('keeps the audited artifact and course manifest hash in sync', () => {
    const profile = readJson(profilePath)
    const artifact = (profile.artifacts as Array<Record<string, unknown>>)[0]
    const bytes = readFileSync(artifactPath)

    expect(profile.profileId).toBe('binary-i386')
    expect(profile.status).toBe('staged')
    expect(artifact.path).toBe(artifactPath)
    expect(artifact.size).toBe(bytes.length)
    expect(artifact.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(statSync(artifactPath).size).toBe(bytes.length)

    const manifest = readJson(manifestPath)
    expect((manifest.artifacts as Array<Record<string, unknown>>)[0].sha256).toBe(artifact.sha256)
  })

  it('parses as a v3 pwn lab without adding it to the legacy level loader', () => {
    const raw = readJson(manifestPath)
    const parsed = parseCourseLabManifest(raw, manifestPath)

    expect(parsed.labId).toBe('pwn-ret2win-01')
    expect(parsed.kind).toBe('pwn')
    expect(parsed.environmentProfile).toBe('binary')
    expect(parsed.steps.some((step) => step.type === 'payload-builder')).toBe(true)
    expect(parsed.verification.type).toBe('payload-replay')
  })

  it('locks the memory observation ELF to the facts rendered by BinaryWorkbench', () => {
    const manifest = readJson(memoryManifestPath)
    const artifact = (manifest.artifacts as Array<Record<string, unknown>>)[0]
    const bytes = readFileSync(memoryArtifactPath)

    expect(artifact.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    const parsed = parseCourseLabManifest(manifest, memoryManifestPath)
    expect(parsed.labId).toBe('memory-addresses-01')
    expect(parsed.kind).toBe('visual')
    expect(parsed.steps[0]).toMatchObject({ type: 'visual-trace', initialTab: 'bytes' })
    expect(parsed.steps[0].type === 'visual-trace' && parsed.steps[0].workbench.bytes).toMatchObject({
      baseAddress: 0x0804b140,
      bytes: [0x42, 0xde, 0xc0, 0xde],
    })
    expect(parsed.steps[0].type === 'visual-trace' && parsed.steps[0].workbench.memory).toMatchObject({
      endian: 'little',
      cells: expect.arrayContaining([
        expect.objectContaining({ name: 'cell_pointer', kind: 'pointer', targetName: 'cell' }),
      ]),
    })
  })

  it('locks the process layout lab to the real maps script and focused concepts', () => {
    const manifest = readJson(memoryLayoutManifestPath)
    const artifact = (manifest.artifacts as Array<Record<string, unknown>>)[0]
    const bytes = readFileSync(memoryLayoutArtifactPath)
    const script = readFileSync(memoryLayoutScriptPath, 'utf8')

    expect(artifact.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(script).toContain('readlink "/proc/$$/exe"')
    expect(script).not.toContain('/bin/busybox')

    const parsed = parseCourseLabManifest(manifest, memoryLayoutManifestPath)
    expect(parsed.labId).toBe('memory-layout-01')
    expect(parsed.unlockAfter).toEqual(['memory-addresses-01'])
    expect(parsed.concepts.map((concept) => concept.id)).toEqual([
      'process-regions',
      'memory-permissions',
      'region-growth',
    ])
    expect(parsed.steps.map((step) => step.type)).toEqual([
      'concept',
      'prediction',
      'terminal',
      'prediction',
    ])
    expect(parsed.steps[2]).toMatchObject({ type: 'terminal', autoRun: true })
  })

  it('locks the memory stack ELF to a two-value LIFO sequence', () => {
    const profile = readJson(profilePath)
    const profileArtifact = (profile.artifacts as Array<Record<string, unknown>>)
      .find((item) => item.id === 'memory-register-stack-01')!
    const manifest = readJson(memoryRegisterStackManifestPath)
    const manifestArtifact = (manifest.artifacts as Array<Record<string, unknown>>)[0]
    const bytes = readFileSync(memoryRegisterStackArtifactPath)

    expect(profileArtifact.size).toBe(bytes.length)
    expect(profileArtifact.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(manifestArtifact.sha256).toBe(profileArtifact.sha256)

    const parsed = parseCourseLabManifest(manifest, memoryRegisterStackManifestPath)
    expect(parsed.labId).toBe('memory-register-stack-01')
    expect(parsed.unlockAfter).toEqual(['memory-layout-01'])
    expect(parsed.steps[0]).toMatchObject({
      type: 'concept',
    })
    expect(parsed.steps[1]).toMatchObject({
      type: 'prediction',
      question: { answer: 'second' },
    })
    expect(parsed.steps[2].type === 'visual-trace' && parsed.steps[2].workbench.stack).toMatchObject({
      entries: [
        { address: 0x0804c158, value: 0x22222222, kind: 'stack-pointer' },
        { address: 0x0804c15c, value: 0x11111111, kind: 'stack-pointer' },
        { address: 0x0804c160, value: 0, kind: 'stack-pointer' },
      ],
    })
    expect(parsed.steps[2].type === 'visual-trace' && parsed.steps[2].workbench.registers).toBeUndefined()
    expect(parsed.steps[2].type === 'visual-trace' && parsed.steps[2].workbench.memory).toBeUndefined()
    const coreText = JSON.stringify({
      title: parsed.title,
      summary: parsed.summary,
      goals: parsed.goals,
      concepts: parsed.concepts,
      steps: parsed.steps,
    })
    expect(coreText).not.toMatch(/EAX|ESP|寄存器|值的复制|\bmov\b|\bpush\b|\bpop\b/)
  })

  it('locks register roles, mov, and lea to the audited assembly ELF', () => {
    const profile = readJson(profilePath)
    const profileArtifact = (profile.artifacts as Array<Record<string, unknown>>)
      .find((item) => item.id === 'asm-registers-01')!
    const manifest = readJson(asmManifestPath)
    const manifestArtifact = (manifest.artifacts as Array<Record<string, unknown>>)[0]
    const bytes = readFileSync(asmArtifactPath)

    expect(profileArtifact.size).toBe(bytes.length)
    expect(profileArtifact.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(manifestArtifact.sha256).toBe(profileArtifact.sha256)

    const parsed = parseCourseLabManifest(manifest, asmManifestPath)
    expect(parsed.labId).toBe('asm-registers-01')
    expect(parsed.unlockAfter).toEqual(['vuln-format-string-01'])
    expect(parsed.concepts.map((concept) => concept.term)).toEqual([
      '常见寄存器职责',
      'mov 的值复制',
      'lea 的地址计算',
    ])
    expect(parsed.steps[0]).toMatchObject({
      type: 'concept',
    })
    expect(parsed.steps[1]).toMatchObject({
      type: 'prediction',
      completion: 'answer',
      question: { answer: 'copied' },
    })
    expect(parsed.steps[2].type === 'visual-trace' && parsed.steps[2].workbench.registers).toMatchObject({
      instruction: 'mov eax, 0x11223344',
      registers: [{ name: 'eax', before: 0, after: 0x11223344 }],
      flagsBefore: [],
      flagsAfter: [],
    })
    expect(parsed.steps[2].type === 'visual-trace' && parsed.steps[2].workbench.assemblyTui?.states).toHaveLength(2)
    expect(parsed.steps[3].type === 'visual-trace' && parsed.steps[3].workbench.registers).toMatchObject({
      instruction: 'lea ecx, [ebx+0x0c]',
      registers: [
        { name: 'ebx', before: 0x1000, after: 0x1000 },
        { name: 'ecx', before: 0, after: 0x100c },
      ],
    })
    expect(parsed.steps[4]).toMatchObject({
      type: 'terminal',
      completion: 'input',
      observation: expect.stringContaining('lea 后'),
    })
  })

  it('locks arithmetic, quotient, remainder, and bitwise snapshots to the audited ELF', () => {
    const profile = readJson(profilePath)
    const profileArtifact = (profile.artifacts as Array<Record<string, unknown>>)
      .find((item) => item.id === 'asm-arithmetic-01')!
    const manifest = readJson(arithmeticManifestPath)
    const bytes = readFileSync(arithmeticArtifactPath)

    expect(profileArtifact.size).toBe(bytes.length)
    expect(profileArtifact.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    const parsed = parseCourseLabManifest(manifest, arithmeticManifestPath)
    expect(parsed.unlockAfter).toEqual(['asm-registers-01'])
    expect(parsed.steps[0]).toMatchObject({
      type: 'prediction',
      question: { answer: 'thirteen' },
    })
    expect(parsed.steps[2].type === 'visual-trace' && parsed.steps[2].workbench.registers).toMatchObject({
      instruction: 'idiv ebx',
      registers: [
        { name: 'eax', before: 43, after: 8 },
        { name: 'edx', before: 0, after: 3 },
      ],
    })
    expect(parsed.steps[3].type === 'visual-trace' && parsed.steps[3].workbench.assemblyTui?.states).toHaveLength(4)
  })

  it('locks push, pop, and ESP snapshots to the audited stack operations ELF', () => {
    const profile = readJson(profilePath)
    const profileArtifact = (profile.artifacts as Array<Record<string, unknown>>)
      .find((item) => item.id === 'asm-stack-ops-01')!
    const manifest = readJson(stackOpsManifestPath)
    const bytes = readFileSync(stackOpsArtifactPath)

    expect(profileArtifact.size).toBe(bytes.length)
    expect(profileArtifact.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    const parsed = parseCourseLabManifest(manifest, stackOpsManifestPath)
    expect(parsed.unlockAfter).toEqual(['asm-arithmetic-01'])
    expect(parsed.steps[0]).toMatchObject({
      type: 'prediction',
      question: { answer: 'second' },
    })
    expect(parsed.steps[1].type === 'visual-trace' && parsed.steps[1].workbench.stack).toMatchObject({
      entries: [
        { address: 0x0804c0d8, value: 0x22222222 },
        { address: 0x0804c0dc, value: 0x11111111 },
        { address: 0x0804c0e0, value: 0 },
      ],
    })
    expect(parsed.steps[1].type === 'visual-trace' && parsed.steps[1].workbench.assemblyTui?.states).toHaveLength(5)
  })

  it('locks cmp and conditional-branch snapshots to the audited assembly ELF', () => {
    const profile = readJson(profilePath)
    const profileArtifact = (profile.artifacts as Array<Record<string, unknown>>)
      .find((item) => item.id === 'asm-branches-01')!
    const manifest = readJson(branchesManifestPath)
    const manifestArtifact = (manifest.artifacts as Array<Record<string, unknown>>)[0]
    const bytes = readFileSync(branchesArtifactPath)

    expect(profileArtifact.size).toBe(bytes.length)
    expect(profileArtifact.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(manifestArtifact.sha256).toBe(profileArtifact.sha256)

    const parsed = parseCourseLabManifest(manifest, branchesManifestPath)
    expect(parsed.labId).toBe('asm-branches-01')
    expect(parsed.unlockAfter).toEqual(['asm-stack-ops-01'])
    expect(parsed.steps[0]).toMatchObject({
      type: 'prediction',
      completion: 'answer',
      question: { answer: 'zero' },
    })
    expect(parsed.steps[1].type === 'visual-trace' && parsed.steps[1].workbench.registers).toMatchObject({
      instruction: 'test eax,eax; je zero_path',
      registers: [{ name: 'eax', before: 0, after: 0 }],
      flagsBefore: [],
      flagsAfter: ['ZF'],
    })
    expect(parsed.steps[1].type === 'visual-trace' && parsed.steps[1].workbench.assemblyTui?.states).toHaveLength(3)
    expect(parsed.steps[2].type === 'visual-trace' && parsed.steps[2].workbench.registers).toMatchObject({
      instruction: 'cmp eax,ebx; je equal_path',
      registers: [
        { name: 'eax', before: 7, after: 7 },
        { name: 'ebx', before: 7, after: 7 },
      ],
      flagsBefore: [],
      flagsAfter: ['ZF'],
    })
    expect(parsed.steps[3].type === 'visual-trace' && parsed.steps[3].workbench.registers).toMatchObject({
      instruction: 'cmp eax,ebx; jg greater_path',
      registers: [
        { name: 'eax', before: 9, after: 9 },
        { name: 'ebx', before: 3, after: 3 },
      ],
      flagsBefore: [],
      flagsAfter: [],
    })
    expect(parsed.steps[4]).toMatchObject({
      type: 'terminal',
      completion: 'input',
      observation: expect.stringContaining('jg'),
    })
  })

  it('locks the call trace and EBP frame table to the audited assembly ELF', () => {
    const profile = readJson(profilePath)
    const profileArtifact = (profile.artifacts as Array<Record<string, unknown>>)
      .find((item) => item.id === 'asm-call-stack-01')!
    const manifest = readJson(callStackManifestPath)
    const manifestArtifact = (manifest.artifacts as Array<Record<string, unknown>>)[0]
    const bytes = readFileSync(callStackArtifactPath)

    expect(profileArtifact.size).toBe(bytes.length)
    expect(profileArtifact.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(manifestArtifact.sha256).toBe(profileArtifact.sha256)

    const parsed = parseCourseLabManifest(manifest, callStackManifestPath)
    expect(parsed.labId).toBe('asm-call-stack-01')
    expect(parsed.unlockAfter).toEqual(['asm-branches-01'])
    expect(parsed.steps[0]).toMatchObject({ type: 'concept' })
    expect(parsed.steps[1]).toMatchObject({
      type: 'prediction',
      question: { answer: 'argument-still' },
    })
    expect(parsed.steps[2].type === 'visual-trace' && parsed.steps[2].workbench.stack).toMatchObject({
      entries: [
        { address: 0x0804c240, value: 0x2b, kind: 'local' },
        { address: 0x0804c244, value: 0, kind: 'frame-pointer' },
        { address: 0x0804c248, value: 0x08049081, kind: 'return-address' },
        { address: 0x0804c24c, value: 0x15, kind: 'argument' },
      ],
    })
    expect(parsed.steps[3].type === 'visual-trace' && parsed.steps[3].workbench.trace).toMatchObject({
      entries: [
        { kind: 'call', stackPointer: 0x0804c24c },
        { kind: 'current', stackPointer: 0x0804c240 },
        { kind: 'return', stackPointer: 0x0804c24c },
      ],
    })
    expect(parsed.steps[3].type === 'visual-trace' && parsed.steps[3].workbench.assemblyTui?.states).toHaveLength(4)
    expect(parsed.steps[3].type === 'visual-trace' && parsed.steps[3].workbench.registers?.registers)
      .toContainEqual({ name: 'eax', before: 43, after: 43 })
  })

  it('locks the ELF file, hex, byte snapshot, and strings observations to the audited file', () => {
    const profile = readJson(profilePath)
    const profileArtifact = (profile.artifacts as Array<Record<string, unknown>>)
      .find((item) => item.id === 'elf-bytes-01')!
    const manifest = readJson(elfBytesManifestPath)
    const manifestArtifact = (manifest.artifacts as Array<Record<string, unknown>>)[0]
    const bytes = readFileSync(elfBytesArtifactPath)

    expect(profileArtifact.size).toBe(bytes.length)
    expect(profileArtifact.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(manifestArtifact.sha256).toBe(profileArtifact.sha256)

    const parsed = parseCourseLabManifest(manifest, elfBytesManifestPath)
    expect(parsed.labId).toBe('elf-bytes-01')
    expect(parsed.kind).toBe('elf')
    expect(parsed.unlockAfter).toEqual(['asm-call-stack-01'])
    expect(parsed.steps[0]).toMatchObject({
      type: 'prediction',
      question: { answer: 'file' },
    })
    expect(parsed.steps).toHaveLength(5)
    expect(parsed.steps[1]).toMatchObject({
      type: 'observe',
      allowRun: true,
      command: 'file ./elf-bytes',
    })
    expect(parsed.steps[2]).toMatchObject({
      type: 'observe',
      allowRun: true,
      command: 'hexdump -C -n 16 ./elf-bytes',
    })
    expect(parsed.steps[3].type === 'visual-trace' && parsed.steps[3].workbench.bytes).toMatchObject({
      baseAddress: 0,
      bytes: [0x7f, 0x45, 0x4c, 0x46, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      selectedOffset: 0,
      selectedLength: 6,
    })
    expect(parsed.steps[4]).toMatchObject({
      type: 'observe',
      allowRun: true,
      command: expect.stringContaining('strings'),
    })
  })

  it('locks readelf and the entry-point section lesson to audited i386 assets', () => {
    const profile = readJson(profilePath)
    const profileArtifact = (profile.artifacts as Array<Record<string, unknown>>)
      .find((item) => item.id === 'elf-sections-01')!
    const tool = (profile.tools as Array<Record<string, unknown>>)
      .find((item) => item.command === 'readelf')!
    const manifest = readJson(elfSectionsManifestPath)
    const sampleBytes = readFileSync(elfSectionsArtifactPath)
    const toolBytes = readFileSync(readelfToolPath)

    expect(profileArtifact.size).toBe(sampleBytes.length)
    expect(profileArtifact.sha256).toBe(createHash('sha256').update(sampleBytes).digest('hex'))
    expect(tool.path).toBe(readelfToolPath)
    expect(tool.size).toBe(toolBytes.length)
    expect(tool.sha256).toBe(createHash('sha256').update(toolBytes).digest('hex'))
    expect(tool).toMatchObject({
      upstreamVersion: '2.42',
      architecture: 'i386',
      static: true,
      stripped: true,
    })

    const parsed = parseCourseLabManifest(manifest, elfSectionsManifestPath)
    expect(parsed.labId).toBe('elf-sections-01')
    expect(parsed.kind).toBe('elf')
    expect(parsed.unlockAfter).toEqual(['elf-bytes-01'])
    expect(parsed.concepts.map((concept) => concept.term)).toEqual([
      '入口点',
      '节表',
      '常见节与标志',
    ])
    expect(parsed.steps.map((step) => step.type)).toEqual([
      'prediction',
      'observe',
      'concept',
      'observe',
      'prediction',
    ])
    expect(parsed.steps[1]).toMatchObject({
      type: 'observe',
      command: 'readelf -h ./elf-sections',
    })
    expect(parsed.steps[3]).toMatchObject({
      type: 'observe',
      command: 'readelf -SW ./elf-sections',
    })
    expect(parsed.steps[4]).toMatchObject({
      type: 'prediction',
      question: { answer: 'bss' },
    })
  })

  it('locks nm and the symbol lesson to audited i386 assets', () => {
    const profile = readJson(profilePath)
    const profileArtifact = (profile.artifacts as Array<Record<string, unknown>>)
      .find((item) => item.id === 'elf-symbols-01')!
    const tool = (profile.tools as Array<Record<string, unknown>>)
      .find((item) => item.command === 'nm')!
    const manifest = readJson(elfSymbolsManifestPath)
    const sampleBytes = readFileSync(elfSymbolsArtifactPath)
    const toolBytes = readFileSync(nmToolPath)

    expect(profileArtifact.size).toBe(sampleBytes.length)
    expect(profileArtifact.sha256).toBe(createHash('sha256').update(sampleBytes).digest('hex'))
    expect(tool.path).toBe(nmToolPath)
    expect(tool.size).toBe(toolBytes.length)
    expect(tool.sha256).toBe(createHash('sha256').update(toolBytes).digest('hex'))
    expect(tool).toMatchObject({
      upstreamVersion: '2.42',
      architecture: 'i386',
      static: true,
      stripped: true,
    })

    const parsed = parseCourseLabManifest(manifest, elfSymbolsManifestPath)
    expect(parsed.labId).toBe('elf-symbols-01')
    expect(parsed.kind).toBe('elf')
    expect(parsed.unlockAfter).toEqual(['elf-sections-01'])
    expect(parsed.concepts.map((concept) => concept.term)).toEqual([
      '符号表',
      '符号地址',
      '类型字母与大小写',
    ])
    expect(parsed.steps.map((step) => step.type)).toEqual([
      'prediction',
      'observe',
      'concept',
      'observe',
      'prediction',
    ])
    expect(parsed.steps[1]).toMatchObject({
      type: 'observe',
      command: 'nm -n ./elf-symbols',
    })
    expect(parsed.steps[3]).toMatchObject({
      type: 'observe',
      command: expect.stringContaining('compute_total'),
    })
    expect(parsed.steps[4]).toMatchObject({
      type: 'prediction',
      question: { answer: 'compute' },
    })
  })

  it('locks objdump and the disassembly lesson to audited i386 assets', () => {
    const profile = readJson(profilePath)
    const profileArtifact = (profile.artifacts as Array<Record<string, unknown>>)
      .find((item) => item.id === 'elf-disassembly-01')!
    const tool = (profile.tools as Array<Record<string, unknown>>)
      .find((item) => item.command === 'objdump')!
    const manifest = readJson(elfDisassemblyManifestPath)
    const sampleBytes = readFileSync(elfDisassemblyArtifactPath)
    const toolBytes = readFileSync(objdumpToolPath)

    expect(profileArtifact.size).toBe(sampleBytes.length)
    expect(profileArtifact.sha256).toBe(createHash('sha256').update(sampleBytes).digest('hex'))
    expect(tool.path).toBe(objdumpToolPath)
    expect(tool.size).toBe(toolBytes.length)
    expect(tool.sha256).toBe(createHash('sha256').update(toolBytes).digest('hex'))
    expect(tool).toMatchObject({
      upstreamVersion: '2.42',
      architecture: 'i386',
      static: true,
      stripped: true,
    })

    const parsed = parseCourseLabManifest(manifest, elfDisassemblyManifestPath)
    expect(parsed.labId).toBe('elf-disassembly-01')
    expect(parsed.kind).toBe('elf')
    expect(parsed.unlockAfter).toEqual(['elf-symbols-01'])
    expect(parsed.concepts.map((concept) => concept.term)).toEqual([
      '反汇编',
      '指令地址、机器字节与助记符',
      '静态控制流',
    ])
    expect(parsed.steps.map((step) => step.type)).toEqual([
      'prediction',
      'observe',
      'concept',
      'observe',
      'prediction',
    ])
    expect(parsed.steps[1]).toMatchObject({
      type: 'observe',
      command: 'objdump -d -M intel ./elf-disassembly',
    })
    expect(parsed.steps[3]).toMatchObject({
      type: 'observe',
      command: 'objdump -d -M intel --disassemble=choose_path ./elf-disassembly',
    })
    expect(parsed.steps[4]).toMatchObject({
      type: 'prediction',
      question: { answer: 'jne' },
    })
  })

  it('locks the native GDB fallback to its independent source and toolchain lock', () => {
    const profile = readJson(profilePath)
    const tool = (profile.tools as Array<Record<string, unknown>>)
      .find((item) => item.command === 'gdb')!
    const bytes = readFileSync(gdbToolPath)

    expect(tool.path).toBe(gdbToolPath)
    expect(tool.size).toBe(bytes.length)
    expect(tool.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(tool).toMatchObject({
      upstreamVersion: '15.1',
      sourceUrl: 'https://ftp.gnu.org/gnu/gdb/gdb-15.1.tar.xz',
      sourceSha256: '38254eacd4572134bca9c5a5aa4d4ca564cbbd30c369d881f733fb6b903354f2',
      lockVersionKey: 'gdb_version',
      lockShaKey: 'gdb_sha256',
      architecture: 'i386',
      endianness: 'little',
      static: true,
      stripped: true,
    })
    expect(statSync(gdbToolPath).size).toBe(bytes.length)
  })

  it('ships four focused native GDB labs on one audited runtime sample', () => {
    const profile = readJson(profilePath)
    const definitions = [
      { id: 'gdb-breakpoints-01', prerequisite: 'elf-disassembly-01', steps: ['prediction', 'terminal', 'prediction', 'terminal'] },
      { id: 'gdb-register-memory-01', prerequisite: 'gdb-breakpoints-01', steps: ['prediction', 'terminal', 'terminal'] },
      { id: 'gdb-stack-frames-01', prerequisite: 'gdb-register-memory-01', steps: ['concept', 'terminal', 'prediction', 'terminal'] },
      { id: 'gdb-input-crash-01', prerequisite: 'gdb-stack-frames-01', steps: ['prediction', 'terminal', 'prediction', 'terminal'] },
    ]
    const hashes = new Set<string>()

    for (const definition of definitions) {
      const root = `vm/labs/pwnhub/${definition.id}`
      const manifestPath = `${root}/manifest.json`
      const manifest = readJson(manifestPath)
      const parsed = parseCourseLabManifest(manifest, manifestPath)
      const sample = readFileSync(`${root}/gdb-runtime`)
      const artifact = (profile.artifacts as Array<Record<string, unknown>>)
        .find((item) => item.id === definition.id)!

      expect(parsed.kind).toBe('gdb')
      expect(parsed.unlockAfter).toEqual([definition.prerequisite])
      expect(parsed.steps.map((step) => step.type)).toEqual(definition.steps)
      expect(parsed.concepts).toHaveLength(3)
      expect(parsed.steps.filter((step) => step.type === 'terminal'))
        .toEqual(expect.arrayContaining([expect.objectContaining({ allowRun: false })]))
      expect(artifact.size).toBe(sample.length)
      expect(artifact.sha256).toBe(createHash('sha256').update(sample).digest('hex'))
      expect(readFileSync(`${root}/home-files`, 'utf8')).toContain('session.gdb')
      expect(readFileSync(`${root}/home-files`, 'utf8')).toContain('gdb-runtime.c')
      hashes.add(artifact.sha256 as string)
    }

    expect(hashes).toEqual(new Set(['b5560fdf2ab16ffa5b3004ceeb3eaec0363b7c99bb3142927a9feb3df33b66e4']))
  })

  it('ships two external reverse labs with one downloadable audited sample', () => {
    const profile = readJson(profilePath)
    const definitions = [
      { id: 'rev-strings-xrefs-01', prerequisite: 'gdb-input-crash-01', steps: ['prediction', 'external-tool', 'worksheet'] },
      { id: 'rev-functions-flow-01', prerequisite: 'rev-strings-xrefs-01', steps: ['concept', 'external-tool', 'worksheet'] },
    ]
    const hashes = new Set<string>()

    for (const definition of definitions) {
      const root = `vm/labs/pwnhub/${definition.id}`
      const manifestPath = `${root}/manifest.json`
      const parsed = parseCourseLabManifest(readJson(manifestPath), manifestPath)
      const sample = readFileSync(`${root}/reverse-companion`)
      const artifact = (profile.artifacts as Array<Record<string, unknown>>)
        .find((item) => item.id === definition.id)!
      const external = parsed.steps.find((step) => step.type === 'external-tool')

      expect(parsed.kind).toBe('external-tool')
      expect(parsed.unlockAfter).toEqual([definition.prerequisite])
      expect(parsed.steps.map((step) => step.type)).toEqual(definition.steps)
      expect(parsed.verification.type).toBe('external-observation')
      expect(external?.type === 'external-tool' && external.companion.tools.map((route) => route.tool))
        .toEqual(['ida', 'ghidra', 'objdump'])
      expect(artifact.size).toBe(sample.length)
      expect(artifact.sha256).toBe(createHash('sha256').update(sample).digest('hex'))
      hashes.add(artifact.sha256 as string)
    }

    const download = readFileSync('vm/labs/pwnhub/rev-strings-xrefs-01/reverse-companion')
    expect(hashes).toEqual(new Set(['a1d48129804d6eee16ddf44e8697b780dc47a9b2b088503bc5a41fe7543d66cb']))
    expect(createHash('sha256').update(download).digest('hex')).toBe([...hashes][0])
  })

  it('locks the stable lab display order used by terminal banners', () => {
    const order = readFileSync('vm/rootfs-overlay/opt/pwnhub/course-order', 'utf8')
      .trim()
      .split('\n')
    const manifests = readdirSync('vm/labs/pwnhub', { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((labId) => existsSync(`vm/labs/pwnhub/${labId}/manifest.json`))
      .sort()

    expect([...order].sort()).toEqual(manifests)
    expect(new Set(order).size).toBe(order.length)
    expect(order[0]).toBe('num-bases-01')
    expect(order.at(-1)).toBe('rop-call-chain-01')
  })
})
