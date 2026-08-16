import type { ChapterDef, CourseDef, CourseLabDef, CourseLabManifest } from '../../types/lab'
import { parseCourseLabManifest } from '../../services/course-manifest'
import { PUBLISHED_PWNHUB_LAB_IDS } from './published-labs'

const courseManifestModules = import.meta.glob<unknown>(
  [
    '../../../vm/labs/pwnhub/memory-*/manifest.json',
    '../../../vm/labs/pwnhub/vuln-*/manifest.json',
    '../../../vm/labs/pwnhub/asm-*/manifest.json',
    '../../../vm/labs/pwnhub/elf-*/manifest.json',
  ],
  { eager: true, import: 'default' },
)

const courseManifests = new Map<string, CourseLabManifest>()
for (const [source, raw] of Object.entries(courseManifestModules)) {
  const manifest = parseCourseLabManifest(raw, source)
  if (courseManifests.has(manifest.labId)) {
    throw new Error(`课程实验 ID 重复：${manifest.labId}`)
  }
  courseManifests.set(manifest.labId, manifest)
}

function courseLabFromManifest(manifest: CourseLabManifest, id: number): CourseLabDef {
  const { type: verificationType, ...verification } = manifest.verification
  return {
    id,
    name: manifest.title,
    tagline: manifest.summary,
    storySummary: manifest.summary,
    story: manifest.story ?? manifest.summary,
    goals: manifest.goals,
    prerequisites: manifest.prerequisites,
    newConcepts: manifest.concepts.map((concept) => concept.term),
    steps: manifest.steps,
    hints: manifest.hints,
    verification,
    completionSummary: manifest.completionSummary,
    labId: manifest.labId,
    chapterId: manifest.chapterId,
    title: manifest.title,
    summary: manifest.summary,
    kind: manifest.kind,
    environmentProfile: manifest.environmentProfile,
    estimatedMinutes: manifest.estimatedMinutes,
    unlockAfter: manifest.unlockAfter,
    artifacts: manifest.artifacts,
    concepts: manifest.concepts,
    verificationType,
  }
}

const publishedLabs = PUBLISHED_PWNHUB_LAB_IDS.map((labId, index) => {
  const manifest = courseManifests.get(labId)
  if (manifest === undefined) throw new Error(`缺少已发布实验 manifest：${labId}`)
  return courseLabFromManifest(manifest, 11 + index)
})

const chapters: ChapterDef[] = [
  {
    chapterId: 'memory-model',
    title: 'C 内存模型',
    summary: '用三个实验依次建立地址与指针、进程内存布局、栈的后入先出模型。',
    goals: ['解释地址、值和指针的区别', '区分代码段、数据段、堆与栈', '用入栈与出栈解释 ESP 和栈顶变化'],
    prerequisites: [],
    estimatedMinutes: { min: 60, max: 105 },
    labIds: PUBLISHED_PWNHUB_LAB_IDS.slice(0, 3),
    unlockAfter: [],
    completionDefinition: ['完成三个内存实验', '能够从地址、字节、rwx 和栈顶变化解释观察结果'],
    status: 'available',
  },
  {
    chapterId: 'vuln-first',
    title: '第一批漏洞',
    summary:
      '用六个固定样本亲手复现最基础漏洞：可预测随机数、整数回绕、相邻变量覆盖、字符串溢出、格式化字符串与条件竞争。',
    goals: [
      '识别可预测随机数、整数回绕与相邻变量覆盖等基本漏洞类别',
      '在固定 i386 样本上构造越界写入或格式化字符串输入复现漏洞',
      '用格式化字符串读取栈上数据，用并发复现检查与扣款分离的条件竞争',
    ],
    prerequisites: ['完成 C 内存模型章节'],
    estimatedMinutes: { min: 100, max: 170 },
    labIds: PUBLISHED_PWNHUB_LAB_IDS.slice(3, 9),
    unlockAfter: ['memory-register-stack-01'],
    completionDefinition: [
      '完成六个漏洞复现实验',
      '能够解释可预测随机、整数回绕、越界覆盖、格式化字符串与条件竞争各自的成因',
    ],
    status: 'available',
  },
  {
    chapterId: 'asm-reading',
    title: '汇编读写',
    summary: '从寄存器职责开始，逐步练习数据操作、栈操作、条件跳转与 i386 函数调用约定。',
    goals: ['按寄存器差分解释数据操作', '用 ESP 追踪 push 与 pop', '跟踪 call/ret、栈帧与 EAX 返回值'],
    prerequisites: ['memory-model'],
    estimatedMinutes: { min: 150, max: 250 },
    labIds: PUBLISHED_PWNHUB_LAB_IDS.slice(9, 14),
    unlockAfter: ['vuln-race-condition-01'],
    completionDefinition: ['完成五个汇编实验', '能够按单步差分解释数据、栈、分支和函数调用'],
    status: 'available',
  },
  {
    chapterId: 'elf-static',
    title: 'ELF 与静态分析',
    summary: '从文件字节建立静态证据，再用 readelf、nm 和 objdump 连接入口点、节、符号与真实指令。',
    goals: ['识别 ELF 架构和字节序', '从 ELF 头找到入口点', '用符号表连接函数或数据的名称与地址', '用反汇编观察静态控制流'],
    prerequisites: ['asm-reading'],
    estimatedMinutes: { min: 115, max: 195 },
    labIds: PUBLISHED_PWNHUB_LAB_IDS.slice(14, 18),
    unlockAfter: ['asm-call-stack-01'],
    completionDefinition: ['完成四个 ELF 实验', '能够用 file、readelf、nm 和 objdump 给出可复核的静态证据'],
    status: 'available',
  },
  {
    chapterId: 'gdb-pwndbg',
    title: 'GDB 动态调试',
    summary: '用原生 GDB 在真实 i386 进程中建立断点、单步、寄存器、内存、栈帧、输入和崩溃证据链。',
    goals: ['设置断点并单步', '读取寄存器与内存', '定位可复现崩溃'],
    prerequisites: ['elf-static'],
    estimatedMinutes: { min: 130, max: 220 },
    labIds: ['gdb-breakpoints-01', 'gdb-register-memory-01', 'gdb-stack-frames-01', 'gdb-input-crash-01'],
    unlockAfter: ['elf-disassembly-01'],
    completionDefinition: ['完成四个动态调试实验'],
    status: 'planned',
  },
  {
    chapterId: 'ida-companion',
    title: '外部静态逆向',
    summary: '在本机使用 IDA 或 Ghidra 观察字符串、引用、函数与控制流。',
    goals: ['校验课程样本', '识别函数边界', '回填静态分析证据'],
    prerequisites: ['elf-static', 'gdb-pwndbg'],
    estimatedMinutes: { min: 70, max: 130 },
    labIds: ['rev-strings-xrefs-01', 'rev-functions-flow-01'],
    unlockAfter: ['gdb-input-crash-01'],
    completionDefinition: ['完成两个外部逆向实验'],
    status: 'planned',
  },
  {
    chapterId: 'pwn-ret2win',
    title: '栈溢出与 ret2win',
    summary: '在固定、离线、无提权能力的 i386 样本上观察越界写入、EIP 控制、目标函数和 cdecl 参数。',
    goals: ['确定覆盖偏移', '控制 EIP', '按 i386 cdecl 放置参数'],
    prerequisites: ['gdb-pwndbg', 'ida-companion'],
    estimatedMinutes: { min: 130, max: 240 },
    labIds: ['pwn-overflow-offset-01', 'pwn-ret2win-01', 'pwn-ret2win-args-01'],
    unlockAfter: ['gdb-input-crash-01', 'rev-functions-flow-01'],
    completionDefinition: ['完成三个 ret2win 实验'],
    status: 'planned',
  },
  {
    chapterId: 'rop-basics',
    title: '基础 ROP',
    summary: '用固定地址的短 gadget 和确定性链条练习栈消耗、寄存器准备和多函数调用。',
    goals: ['解释 gadget 对 ESP 和寄存器的影响', '构造并验证短 ROP 链'],
    prerequisites: ['pwn-ret2win'],
    estimatedMinutes: { min: 120, max: 220 },
    labIds: ['rop-gadget-stack-01', 'rop-register-chain-01', 'rop-call-chain-01'],
    unlockAfter: ['pwn-ret2win-args-01'],
    completionDefinition: ['完成三个基础 ROP 实验'],
    status: 'planned',
  },
]

export const COURSE: CourseDef = {
  courseId: 'pwnhub-foundations',
  title: 'PwnHub',
  summary: '从内存模型、汇编到 ELF 静态分析，建立二进制安全基础。',
  chapters,
  labs: publishedLabs,
}

export function getCourseLab(labId: string): CourseLabDef | undefined {
  return COURSE.labs.find((lab) => lab.labId === labId)
}
