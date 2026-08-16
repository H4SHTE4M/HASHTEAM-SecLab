import { describe, expect, it } from 'vitest'
import { COURSE, getCourseLab } from '../src/modules/pwnhub/course'
import { isChapterUnlocked, isLabUnlocked } from '../src/services/course-progress'

const NUMBER_BASES_LAB_IDS = ['num-bases-01', 'num-wrap-01']

const VULN_LOGIC_LAB_IDS = [
  'vuln-weak-random-01',
  'vuln-integer-overflow-01',
  'vuln-race-condition-01',
]

const MEMORY_LAB_IDS = ['memory-addresses-01', 'memory-layout-01', 'memory-register-stack-01']

const VULN_MEMORY_LAB_IDS = [
  'vuln-overwrite-variable-01',
  'vuln-string-overflow-01',
  'vuln-format-string-01',
]

const EXISTING_PUBLISHED_LAB_IDS = [
  'memory-addresses-01',
  'memory-layout-01',
  'memory-register-stack-01',
  'asm-registers-01',
  'asm-arithmetic-01',
  'asm-stack-ops-01',
  'asm-branches-01',
  'asm-call-stack-01',
  'elf-bytes-01',
  'elf-sections-01',
  'elf-symbols-01',
  'elf-disassembly-01',
]

describe('数字与进制 → 逻辑漏洞 → 内存 → 汇编 的低门槛串行链', () => {
  it('六章按 Contract 链序排列，漏洞实验拆为逻辑篇与内存篇', () => {
    const ids = COURSE.chapters.map((chapter) => chapter.chapterId)
    expect(ids.slice(0, 6)).toEqual([
      'number-bases',
      'vuln-logic',
      'memory-model',
      'vuln-memory',
      'asm-reading',
      'elf-static',
    ])

    const numberBases = COURSE.chapters[0]
    expect(numberBases.labIds).toEqual(NUMBER_BASES_LAB_IDS)
    expect(numberBases.unlockAfter).toEqual([])
    expect(numberBases.status).toBe('available')

    const vulnLogic = COURSE.chapters[1]
    expect(vulnLogic.labIds).toEqual(VULN_LOGIC_LAB_IDS)
    expect(vulnLogic.unlockAfter).toEqual(['num-wrap-01'])
    expect(vulnLogic.status).toBe('available')

    const memory = COURSE.chapters[2]
    expect(memory.labIds).toEqual(MEMORY_LAB_IDS)
    expect(memory.unlockAfter).toEqual(['vuln-race-condition-01'])

    const vulnMemory = COURSE.chapters[3]
    expect(vulnMemory.labIds).toEqual(VULN_MEMORY_LAB_IDS)
    expect(vulnMemory.unlockAfter).toEqual(['memory-register-stack-01'])
    expect(vulnMemory.status).toBe('available')
  })

  it('进度为空时：仅 num-bases-01 可进入，num-wrap-01 与 weak-random 仍锁', () => {
    expect(isChapterUnlocked(COURSE.chapters[0], [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('num-bases-01')!, [], [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('num-wrap-01')!, [], [])).toBe(false)
    expect(isLabUnlocked(getCourseLab('vuln-weak-random-01')!, [], [])).toBe(false)
  })

  it('完成 num-bases-01 后：num-wrap-01 解锁，weak-random 与内存章仍锁', () => {
    const completed = ['num-bases-01']
    expect(isLabUnlocked(getCourseLab('num-wrap-01')!, completed, [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('vuln-weak-random-01')!, completed, [])).toBe(false)
    expect(isChapterUnlocked(COURSE.chapters[1], completed)).toBe(false)
    expect(isChapterUnlocked(COURSE.chapters[2], completed)).toBe(false)
  })

  it('完成 num-wrap-01 后：weak-random-01 与逻辑篇章节解锁', () => {
    const completed = NUMBER_BASES_LAB_IDS
    const vulnLogic = COURSE.chapters.find((chapter) => chapter.chapterId === 'vuln-logic')!
    expect(isChapterUnlocked(vulnLogic, completed)).toBe(true)
    expect(isLabUnlocked(getCourseLab('vuln-weak-random-01')!, completed, [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('memory-addresses-01')!, completed, [])).toBe(false)
  })

  it('memory-addresses-01 需要 race-condition-01 完成：逻辑篇未走完时保持锁定', () => {
    const completed = [...NUMBER_BASES_LAB_IDS, 'vuln-weak-random-01', 'vuln-integer-overflow-01']
    expect(isLabUnlocked(getCourseLab('vuln-race-condition-01')!, completed, [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('memory-addresses-01')!, completed, [])).toBe(false)
    expect(isChapterUnlocked(COURSE.chapters[2], completed)).toBe(false)

    const withRace = [...completed, 'vuln-race-condition-01']
    expect(isLabUnlocked(getCourseLab('memory-addresses-01')!, withRace, [])).toBe(true)
    expect(isChapterUnlocked(COURSE.chapters[2], withRace)).toBe(true)
  })

  it('overwrite-variable-01 需要 memory-register-stack-01 完成，内存篇章节随栈实验解锁', () => {
    const completed = [
      ...NUMBER_BASES_LAB_IDS,
      ...VULN_LOGIC_LAB_IDS,
      'memory-addresses-01',
      'memory-layout-01',
    ]
    const vulnMemory = COURSE.chapters.find((chapter) => chapter.chapterId === 'vuln-memory')!
    expect(isLabUnlocked(getCourseLab('vuln-overwrite-variable-01')!, completed, [])).toBe(false)
    expect(isChapterUnlocked(vulnMemory, completed)).toBe(false)

    const withStack = [...completed, 'memory-register-stack-01']
    expect(isLabUnlocked(getCourseLab('vuln-overwrite-variable-01')!, withStack, [])).toBe(true)
    expect(isChapterUnlocked(vulnMemory, withStack)).toBe(true)
  })

  it('asm-registers-01 需要 format-string-01 完成：内存篇未走完时汇编章保持锁定', () => {
    const completed = [
      ...NUMBER_BASES_LAB_IDS,
      ...VULN_LOGIC_LAB_IDS,
      ...MEMORY_LAB_IDS,
      'vuln-overwrite-variable-01',
      'vuln-string-overflow-01',
    ]
    const asmReading = COURSE.chapters.find((chapter) => chapter.chapterId === 'asm-reading')!
    expect(isLabUnlocked(getCourseLab('vuln-format-string-01')!, completed, [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('asm-registers-01')!, completed, [])).toBe(false)
    expect(isChapterUnlocked(asmReading, completed)).toBe(false)

    const withFormat = [...completed, 'vuln-format-string-01']
    expect(isLabUnlocked(getCourseLab('asm-registers-01')!, withFormat, [])).toBe(true)
    expect(isChapterUnlocked(asmReading, withFormat)).toBe(true)
  })

  it('既有 12 个已发布实验仍全部存在于 COURSE.labs', () => {
    const labIds = COURSE.labs.map((lab) => lab.labId)
    for (const id of EXISTING_PUBLISHED_LAB_IDS) {
      expect(labIds).toContain(id)
    }
  })
})
