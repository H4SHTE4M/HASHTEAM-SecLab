import type { ChapterDef, CourseDef, CourseLabDef, CourseLabManifest } from '../../types/lab'
import { parseCourseLabManifest } from '../../services/course-manifest'
import { PUBLISHED_PWNHUB_LAB_IDS } from './published-labs'

const courseManifestModules = import.meta.glob<unknown>(
  [
    '../../../vm/labs/pwnhub/num-*/manifest.json',
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
  return courseLabFromManifest(manifest, 1 + index)
})

const chapters: ChapterDef[] = [
  {
    chapterId: 'number-bases',
    title: '数字与进制',
    summary: '用两个只做加减法的小实验，认识十进制、二进制与十六进制只是同一个数的不同写法，以及固定位宽装满之后的回绕。',
    goals: [
      '把同一个字节分别读成十进制、二进制和十六进制',
      '解释 0x 前缀与二进制位只是写法不同、数值相同',
      '用 8 位计数器解释 255 + 1 为什么变回 0',
    ],
    prerequisites: [],
    estimatedMinutes: { min: 25, max: 45 },
    labIds: PUBLISHED_PWNHUB_LAB_IDS.slice(0, 2),
    unlockAfter: [],
    completionDefinition: ['完成两个进制实验', '能在十进制、二进制、十六进制之间互认同一个数，并算出固定位宽回绕后的结果'],
    status: 'available',
  },
  {
    chapterId: 'vuln-logic',
    title: '第一批漏洞·逻辑篇',
    summary: '不需要懂内存：用三个固定样本亲手复现可预测随机数、整数回绕与条件竞争，顺路认识源代码、编译、变量和 if 判断。',
    goals: [
      '读懂 源代码 -> 编译 -> 程序 的链路，知道变量和 if 判断在程序里的位置',
      '识别可预测随机数、整数回绕与检查后执行这类纯逻辑漏洞',
      '在固定样本上用种子重放、回绕数量和并发输入真正触发漏洞',
    ],
    prerequisites: ['完成数字与进制章节'],
    estimatedMinutes: { min: 50, max: 85 },
    labIds: PUBLISHED_PWNHUB_LAB_IDS.slice(2, 5),
    unlockAfter: ['num-wrap-01'],
    completionDefinition: ['完成三个逻辑漏洞实验', '能解释可预测种子、定宽回绕与检查后执行各自的成因，并说出它们都不需要碰内存'],
    status: 'available',
  },
  {
    chapterId: 'memory-model',
    title: '内存模型',
    summary: '第一次进入内存：用三个实验依次建立地址与指针、进程内存布局、栈的后入先出模型。',
    goals: ['解释地址、值和指针的区别', '区分代码段、数据段、堆与栈', '用入栈与出栈解释 ESP 和栈顶变化'],
    prerequisites: ['完成第一批漏洞·逻辑篇章节'],
    estimatedMinutes: { min: 60, max: 105 },
    labIds: PUBLISHED_PWNHUB_LAB_IDS.slice(5, 8),
    unlockAfter: ['vuln-race-condition-01'],
    completionDefinition: ['完成三个内存实验', '能够从地址、字节、rwx 和栈顶变化解释观察结果'],
    status: 'available',
  },
  {
    chapterId: 'vuln-memory',
    title: '第一批漏洞·内存篇',
    summary: '带上刚建立的内存模型复现越界写入：改写紧邻变量、覆盖栈上返回地址、用格式串读出栈上的秘密。',
    goals: [
      '解释缓冲区越界写入为什么会落到紧邻变量和返回地址上',
      '在固定 i386 样本上构造越界输入或格式串复现内存漏洞',
      '用格式化字符串 %x 逐格读取调用者栈上遗留的数据',
    ],
    prerequisites: ['完成内存模型章节'],
    estimatedMinutes: { min: 60, max: 95 },
    labIds: PUBLISHED_PWNHUB_LAB_IDS.slice(8, 11),
    unlockAfter: ['memory-register-stack-01'],
    completionDefinition: ['完成三个内存漏洞实验', '能够用缓冲区边界、栈帧排列和格式说明符解释越界读取与写入的成因'],
    status: 'available',
  },
  {
    chapterId: 'asm-reading',
    title: '汇编读写',
    summary: '从寄存器职责开始，逐步练习数据操作、栈操作、条件跳转与 i386 函数调用约定。',
    goals: ['按寄存器差分解释数据操作', '用 ESP 追踪 push 与 pop', '跟踪 call/ret、栈帧与 EAX 返回值'],
    prerequisites: ['vuln-memory'],
    estimatedMinutes: { min: 150, max: 250 },
    labIds: PUBLISHED_PWNHUB_LAB_IDS.slice(11, 16),
    unlockAfter: ['vuln-format-string-01'],
    completionDefinition: ['完成五个汇编实验', '能够按单步差分解释数据、栈、分支和函数调用'],
    status: 'available',
  },
  {
    chapterId: 'elf-static',
    title: 'ELF 静态分析',
    summary: '从文件字节建立静态证据，再用 readelf、nm 和 objdump 连接入口点、节、符号与真实指令。',
    goals: ['识别 ELF 架构和字节序', '从 ELF 头找到入口点', '用符号表连接函数或数据的名称与地址', '用反汇编观察静态控制流'],
    prerequisites: ['asm-reading'],
    estimatedMinutes: { min: 115, max: 195 },
    labIds: PUBLISHED_PWNHUB_LAB_IDS.slice(16, 20),
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
  summary: '从数字与进制、逻辑漏洞到内存模型、内存漏洞、汇编读写与 ELF 静态分析，建立二进制安全基础。',
  chapters,
  labs: publishedLabs,
}

export function getCourseLab(labId: string): CourseLabDef | undefined {
  return COURSE.labs.find((lab) => lab.labId === labId)
}
