import type { ChapterDef, CourseLabDef, LabProgress } from '../types/lab'

/** 旧数字关卡到稳定实验身份的兼容映射。 */
export function legacyLabId(level: number): string {
  return `foundations-terminal-${String(level).padStart(2, '0')}`
}

export function chapterIdForLegacyLevel(_level: number): string {
  return 'foundations-terminal'
}

export function stableLabIdsForLevels(levels: number[]): string[] {
  return [...new Set(levels.filter((level) => Number.isInteger(level) && level > 0).map(legacyLabId))]
}

export function createStableProgressFields(
  currentLevel: number,
  completedLevels: number[],
  chapters: ChapterDef[] = [],
): Pick<LabProgress, 'currentLabId' | 'completedLabIds' | 'chapterProgress'> {
  const completedLabIds = stableLabIdsForLevels(completedLevels)
  const chapterProgress: Record<string, string[]> = {}
  const legacyChapter = completedLabIds
  if (legacyChapter.length > 0) {
    chapterProgress[chapterIdForLegacyLevel(currentLevel)] = [...legacyChapter]
  }
  for (const chapter of chapters) {
    chapterProgress[chapter.chapterId] = chapter.labIds.filter((labId) =>
      completedLabIds.includes(labId),
    )
  }
  return {
    currentLabId: legacyLabId(currentLevel),
    completedLabIds,
    chapterProgress,
  }
}

export function isLabUnlocked(
  lab: Pick<CourseLabDef, 'unlockAfter' | 'legacyLevel'>,
  completedLabIds: readonly string[],
  completedLevels: readonly number[] = [],
): boolean {
  if (lab.unlockAfter.length > 0) return lab.unlockAfter.every((id) => completedLabIds.includes(id))
  if (lab.legacyLevel === undefined) return true
  return lab.legacyLevel <= 1 || completedLevels.includes(lab.legacyLevel - 1)
}

export function isChapterUnlocked(
  chapter: Pick<ChapterDef, 'unlockAfter'>,
  completedLabIds: readonly string[],
): boolean {
  return chapter.unlockAfter.every((id) => completedLabIds.includes(id))
}
