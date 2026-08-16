import { describe, expect, it } from 'vitest'
import { COURSE, getCourseLab } from '../src/modules/pwnhub/course'
import { isChapterUnlocked, isLabUnlocked } from '../src/services/course-progress'

const MEMORY_LAB_IDS = ['memory-addresses-01', 'memory-layout-01', 'memory-register-stack-01']

const VULN_FIRST_LAB_IDS = [
  'vuln-weak-random-01',
  'vuln-integer-overflow-01',
  'vuln-overwrite-variable-01',
  'vuln-string-overflow-01',
  'vuln-format-string-01',
  'vuln-race-condition-01',
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

describe('vuln-first 章节解锁链', () => {
  it('COURSE 在 memory-model 与 asm-reading 之间插入 vuln-first，且六个实验按 Contract 链序排列', () => {
    const ids = COURSE.chapters.map((chapter) => chapter.chapterId)
    const vulnFirstIndex = ids.indexOf('vuln-first')
    expect(vulnFirstIndex).toBe(ids.indexOf('memory-model') + 1)
    expect(ids[vulnFirstIndex + 1]).toBe('asm-reading')

    const vulnFirst = COURSE.chapters[vulnFirstIndex]
    expect(vulnFirst.labIds).toEqual(VULN_FIRST_LAB_IDS)
    expect(vulnFirst.unlockAfter).toEqual(['memory-register-stack-01'])
    expect(vulnFirst.status).toBe('available')
  })

  it('只完成 memory-model 三个实验时：vuln-weak-random-01 已解锁、asm-registers-01 仍锁', () => {
    const completed = MEMORY_LAB_IDS

    const vulnFirst = COURSE.chapters.find((chapter) => chapter.chapterId === 'vuln-first')!
    expect(isChapterUnlocked(vulnFirst, completed)).toBe(true)

    const asmReading = COURSE.chapters.find((chapter) => chapter.chapterId === 'asm-reading')!
    expect(isChapterUnlocked(asmReading, completed)).toBe(false)

    expect(isLabUnlocked(getCourseLab('vuln-weak-random-01')!, completed, [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('asm-registers-01')!, completed, [])).toBe(false)
  })

  it('完成 vuln-first 全部六个实验后：asm-registers-01 与 asm-reading 章节解锁', () => {
    const completed = [...MEMORY_LAB_IDS, ...VULN_FIRST_LAB_IDS]

    const asmReading = COURSE.chapters.find((chapter) => chapter.chapterId === 'asm-reading')!
    expect(isChapterUnlocked(asmReading, completed)).toBe(true)

    expect(isLabUnlocked(getCourseLab('asm-registers-01')!, completed, [])).toBe(true)
    expect(isLabUnlocked(getCourseLab('asm-registers-01')!, MEMORY_LAB_IDS, [])).toBe(false)
  })

  it('既有 12 个已发布实验仍全部存在于 COURSE.labs', () => {
    const labIds = COURSE.labs.map((lab) => lab.labId)
    for (const id of EXISTING_PUBLISHED_LAB_IDS) {
      expect(labIds).toContain(id)
    }
  })
})