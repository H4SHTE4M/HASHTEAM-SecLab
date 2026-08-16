<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ChapterDef, CourseDef, LevelCompletionRecord } from '../types/lab'
import { isChapterUnlocked, isLabUnlocked } from '../services/course-progress'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  course: CourseDef
  currentLabId: string
  completedLabIds: string[]
  completedLevels: number[]
  completionRecords: Record<number, LevelCompletionRecord>
  labCompletionRecords?: Record<string, LevelCompletionRecord>
  debugUnlockedLabIds?: string[]
  debugUnlockedChapterIds?: string[]
  shortLandscapeSplit?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', labId: string): void
  (e: 'debug-unlock-lab', labId: string): void
  (e: 'debug-unlock-chapter', chapterId: string): void
}>()

const DEBUG_UNLOCK_CLICKS = 5
const DEBUG_UNLOCK_WINDOW_MS = 2_000
const chapterMenuOpen = ref(false)
const recentlyCompleted = ref<string | null>(null)
const recentlyUnlocked = ref<string | null>(null)
const levelListRef = ref<HTMLElement | null>(null)
const railRef = ref<HTMLElement | null>(null)
let feedbackTimer: number | null = null
let debugClickTimer: number | null = null
let debugClickTarget = ''
let debugClickCount = 0

const currentLab = computed(
  () => props.course.labs.find((lab) => lab.labId === props.currentLabId) ?? props.course.labs[0],
)
const currentChapter = computed(
  () =>
    props.course.chapters.find((chapter) => chapter.chapterId === currentLab.value?.chapterId) ??
    props.course.chapters[0],
)
const currentChapterLabs = computed(() =>
  props.course.labs.filter((lab) => lab.chapterId === currentChapter.value?.chapterId),
)
const completed = computed(() => new Set(props.completedLabIds))
// 课程内全局序号（仅统计可用章节），与 TopBar「第 N 关」、VM 终端横幅保持一致
const labNumbers = computed(() => {
  const map = new Map<string, number>()
  let next = 1
  for (const chapter of props.course.chapters) {
    if (chapter.status !== 'available') continue
    for (const labId of chapter.labIds) map.set(labId, next++)
  }
  return map
})

function labNumber(labId: string): number {
  return labNumbers.value.get(labId) ?? 0
}
const debugUnlockedLabs = computed(() => new Set(props.debugUnlockedLabIds ?? []))
const debugUnlockedChapters = computed(() => new Set(props.debugUnlockedChapterIds ?? []))

function labUnlocked(lab: CourseDef['labs'][number]): boolean {
  return debugUnlockedLabs.value.has(lab.labId) ||
    isLabUnlocked(lab, props.completedLabIds, props.completedLevels)
}

function chapterUnlocked(chapter: ChapterDef): boolean {
  return debugUnlockedChapters.value.has(chapter.chapterId) ||
    isChapterUnlocked(chapter, props.completedLabIds)
}

function chapterCompletedCount(chapter: ChapterDef): number {
  return chapter.labIds.filter((labId) => completed.value.has(labId)).length
}

function chapterProgress(chapter: ChapterDef): number {
  if (chapter.labIds.length === 0) return 0
  return Math.round((chapterCompletedCount(chapter) / chapter.labIds.length) * 100)
}

function chapterCompleted(chapter: ChapterDef): boolean {
  return chapter.labIds.length > 0 && chapterCompletedCount(chapter) === chapter.labIds.length
}

function completionRecordFor(labId: string, legacyLevel?: number): LevelCompletionRecord | undefined {
  return props.labCompletionRecords?.[labId] ??
    (legacyLevel === undefined ? undefined : props.completionRecords[legacyLevel])
}

function completionDescription(labId: string, legacyLevel?: number): string {
  const record = completionRecordFor(labId, legacyLevel)
  if (!record) return '，历史完成'
  const path =
    record.path === 'challenge'
      ? '挑战模式完成'
      : record.path === 'mixed'
        ? '混合模式完成'
        : '引导模式完成'
  const hints = record.hintsUsed === 0 ? '未使用提示' : `展开 ${record.hintsUsed} 层提示`
  return `，${path}，${hints}`
}

function selectChapter(chapterId: string): void {
  const chapter = props.course.chapters.find((item) => item.chapterId === chapterId)
  if (!chapter || chapter.status !== 'available') return
  if (!chapterUnlocked(chapter)) {
    registerDebugClick(`chapter:${chapterId}`, () => emit('debug-unlock-chapter', chapterId))
    return
  }
  resetDebugClickSequence()
  const firstLab = props.course.labs.find((lab) => lab.chapterId === chapterId)
  if (firstLab) emit('select', firstLab.labId)
  chapterMenuOpen.value = false
}

function selectLab(labId: string): void {
  const lab = props.course.labs.find((item) => item.labId === labId)
  if (!lab) return
  if (!labUnlocked(lab)) {
    registerDebugClick(`lab:${labId}`, () => emit('debug-unlock-lab', labId))
    return
  }
  resetDebugClickSequence()
  emit('select', labId)
  chapterMenuOpen.value = false
}

function resetDebugClickSequence(): void {
  if (debugClickTimer !== null) window.clearTimeout(debugClickTimer)
  debugClickTimer = null
  debugClickTarget = ''
  debugClickCount = 0
}

function registerDebugClick(target: string, unlock: () => void): void {
  if (debugClickTimer !== null) window.clearTimeout(debugClickTimer)
  if (debugClickTarget === target) debugClickCount += 1
  else {
    debugClickTarget = target
    debugClickCount = 1
  }

  if (debugClickCount >= DEBUG_UNLOCK_CLICKS) {
    resetDebugClickSequence()
    unlock()
    return
  }
  debugClickTimer = window.setTimeout(resetDebugClickSequence, DEBUG_UNLOCK_WINDOW_MS)
}

function clearFeedbackTimer(): void {
  if (feedbackTimer === null) return
  window.clearTimeout(feedbackTimer)
  feedbackTimer = null
}

function closeChapterMenuFromOutside(event: PointerEvent): void {
  const target = event.target
  if (!chapterMenuOpen.value || !(target instanceof Node)) return
  if (!railRef.value?.contains(target)) chapterMenuOpen.value = false
}

function closeChapterMenuOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') chapterMenuOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', closeChapterMenuFromOutside)
  document.addEventListener('keydown', closeChapterMenuOnEscape)
})

watch(
  () => [...props.completedLabIds],
  (next, previous) => {
    const old = new Set(previous)
    const completedNow = [...next].reverse().find((labId) => !old.has(labId))
    if (!completedNow) return
    const completedIndex = props.course.labs.findIndex((lab) => lab.labId === completedNow)
    clearFeedbackTimer()
    recentlyCompleted.value = completedNow
    recentlyUnlocked.value = props.course.labs[completedIndex + 1]?.labId ?? null
    feedbackTimer = window.setTimeout(() => {
      recentlyCompleted.value = null
      recentlyUnlocked.value = null
      feedbackTimer = null
    }, 720)
  },
)

watch(
  () => props.currentLabId,
  async () => {
    await nextTick()
    if (typeof window.matchMedia !== 'function') return
    if (!window.matchMedia('(max-width: 900px)').matches) return
    levelListRef.value
      ?.querySelector<HTMLElement>(`[data-lab-id="${props.currentLabId}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center' })
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeChapterMenuFromOutside)
  document.removeEventListener('keydown', closeChapterMenuOnEscape)
  clearFeedbackTimer()
  resetDebugClickSequence()
})
</script>

<template>
  <nav
    ref="railRef"
    class="course-rail level-rail"
    :class="{ 'short-landscape-split': shortLandscapeSplit }"
    aria-label="章节与实验导航"
  >
    <span class="rail-label">课程</span>
    <button
      type="button"
      class="chapter-button"
      :aria-expanded="chapterMenuOpen"
      aria-controls="course-chapter-menu"
      :aria-label="`选择章节，当前为${currentChapter.title}`"
      :title="currentChapter.title"
      @click="chapterMenuOpen = !chapterMenuOpen"
    >
      <AppIcon name="book-open" :size="17" />
      <span>{{ String(course.chapters.indexOf(currentChapter) + 1).padStart(2, '0') }}</span>
    </button>

    <Transition name="chapter-menu">
      <div v-if="chapterMenuOpen" id="course-chapter-menu" class="chapter-menu">
        <header>
          <span>课程章节</span>
          <strong>{{ course.title }}</strong>
        </header>
        <button
          v-for="(chapter, index) in course.chapters"
          :key="chapter.chapterId"
          type="button"
          :class="{
            active: chapter.chapterId === currentChapter.chapterId,
            planned: chapter.status === 'planned',
            completed: chapterCompleted(chapter),
            locked: chapter.status === 'available' && !chapterUnlocked(chapter),
          }"
          :disabled="chapter.status === 'planned'"
          :aria-disabled="chapter.status === 'available' && !chapterUnlocked(chapter) ? 'true' : undefined"
          :aria-label="chapter.status === 'planned'
            ? `${chapter.title}，规划中`
            : `${chapter.title}，已完成 ${chapterCompletedCount(chapter)} / ${chapter.labIds.length} 个实验`"
          @click="selectChapter(chapter.chapterId)"
        >
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <span>
            <strong>{{ chapter.title }}</strong>
            <small>
              {{ chapter.status === 'planned' ? '规划中' : `${chapterCompletedCount(chapter)} / ${chapter.labIds.length} 个实验` }}
            </small>
          </span>
          <AppIcon
            v-if="chapter.status === 'planned' || !chapterUnlocked(chapter)"
            name="lock"
            :size="13"
          />
          <AppIcon
            v-else-if="chapterCompleted(chapter)"
            class="chapter-complete"
            name="check"
            :size="16"
          />
          <span
            v-else
            class="chapter-progress-ring"
            :style="{ '--chapter-progress': `${chapterProgress(chapter)}%` }"
            aria-hidden="true"
          />
        </button>
      </div>
    </Transition>

    <span class="rail-divider" aria-hidden="true" />
    <span class="rail-label">实验</span>
    <div ref="levelListRef" class="level-list">
      <button
        v-for="lab in currentChapterLabs"
        :key="lab.labId"
        type="button"
        class="level-button"
        :class="{
          active: lab.labId === currentLabId,
          completed: completed.has(lab.labId),
          'challenge-completed': completionRecordFor(lab.labId, lab.legacyLevel)?.path === 'challenge',
          'mixed-completed': completionRecordFor(lab.labId, lab.legacyLevel)?.path === 'mixed',
          locked: !labUnlocked(lab),
          'just-completed': recentlyCompleted === lab.labId,
          'just-unlocked': recentlyUnlocked === lab.labId,
        }"
        :data-level="lab.legacyLevel ?? undefined"
        :data-lab-id="lab.labId"
        :aria-disabled="!labUnlocked(lab) ? 'true' : undefined"
        :aria-current="lab.labId === currentLabId ? 'step' : undefined"
        :aria-label="`${currentChapter.title}，实验 ${labNumber(lab.labId)}：${lab.title}${completed.has(lab.labId) ? completionDescription(lab.labId, lab.legacyLevel) : ''}`"
        :title="`${lab.labId} · ${lab.title}`"
        @click="selectLab(lab.labId)"
      >
        <Transition name="level-state" mode="out-in">
          <AppIcon
            v-if="completed.has(lab.labId)"
            :key="`completed-${lab.labId}`"
            :name="completionRecordFor(lab.labId, lab.legacyLevel)?.path === 'challenge' ? 'crosshair' : 'check'"
            :size="16"
          />
          <AppIcon
            v-else-if="!labUnlocked(lab)"
            :key="`locked-${lab.labId}`"
            name="lock"
            :size="14"
          />
          <span v-else :key="`unlocked-${lab.labId}`">{{ labNumber(lab.labId) }}</span>
        </Transition>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.level-rail {
  position: relative;
  z-index: 7;
  width: 64px;
  min-width: 64px;
  height: min(680px, 100%);
  align-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 11px 9px;
  overflow: visible;
  color: var(--text-secondary);
  background: var(--rail-bg);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 8px;
  box-shadow: var(--shadow-panel);
  box-sizing: border-box;
}

.rail-label {
  color: var(--text-faint);
  font-size: 9px;
  font-weight: 750;
}

.rail-divider {
  width: 30px;
  height: 1px;
  background: var(--border-subtle);
}

.chapter-button,
.level-button {
  width: 44px;
  height: 44px;
  display: grid;
  flex: 0 0 44px;
  place-items: center;
  padding: 0;
  color: var(--text-faint);
  font: 700 12px/1 var(--font-ui);
  background: transparent;
  border: var(--hairline) solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: color 180ms ease, background 180ms ease, border-color 180ms ease;
}

.chapter-button {
  grid-template-columns: 1fr;
  gap: 1px;
  color: var(--accent-cyan);
  background: var(--accent-cyan-soft);
  border-color: var(--accent-cyan-border);
}

.chapter-button span {
  font-size: 8px;
}

.level-list {
  display: flex;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  overflow-y: auto;
  scrollbar-width: none;
}

.level-list::-webkit-scrollbar {
  display: none;
}

.level-button:hover:not(.locked),
.chapter-button:hover {
  color: var(--text-primary);
  background: var(--surface-3);
  border-color: var(--border-strong);
}

.level-button.active {
  color: var(--accent-nav-text);
  background: var(--accent-nav);
  border-color: var(--accent-nav-border);
  box-shadow: var(--shadow-control);
}

.level-button.completed:not(.active) {
  color: var(--accent-green);
}

.level-button.challenge-completed:not(.active) {
  color: var(--accent-violet);
}

.level-button.mixed-completed:not(.active) {
  color: var(--accent-amber);
}

.level-button.locked {
  color: var(--text-disabled);
  cursor: not-allowed;
}

.chapter-menu {
  position: absolute;
  top: 30px;
  left: 70px;
  z-index: 20;
  width: min(330px, calc(100vw - 96px));
  max-height: min(560px, calc(100dvh - 80px));
  padding: 10px;
  overflow-y: auto;
  background: var(--floating-surface);
  border: var(--hairline) solid var(--border-strong);
  border-radius: 8px;
  box-shadow: var(--shadow-panel);
}

.chapter-menu header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px 10px;
}

.chapter-menu header span,
.chapter-menu small {
  color: var(--text-faint);
  font-size: 10px;
}

.chapter-menu header strong {
  color: var(--text-primary);
  font-size: 13px;
}

.chapter-menu > button {
  width: 100%;
  min-height: 52px;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 20px;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  color: var(--text-secondary);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.chapter-menu > button:not(:disabled):not(.locked) {
  cursor: pointer;
}

.chapter-menu > button:hover:not(:disabled):not(.locked),
.chapter-menu > button.active {
  background: var(--surface-3);
}

.chapter-menu > button > span:first-child {
  color: var(--text-faint);
  font: 700 11px/1 var(--font-mono);
}

.chapter-menu > button > span:nth-child(2) {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.chapter-menu > button strong {
  color: var(--text-primary);
  font-size: 12px;
}

.chapter-menu > button:disabled {
  opacity: 0.55;
}

.chapter-progress-ring {
  --chapter-progress: 0%;

  position: relative;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: conic-gradient(var(--accent-cyan) var(--chapter-progress), var(--border-strong) 0);
}

.chapter-progress-ring::after {
  position: absolute;
  inset: 3px;
  background: var(--floating-surface);
  border-radius: inherit;
  content: '';
}

.chapter-menu > button:hover .chapter-progress-ring::after,
.chapter-menu > button.active .chapter-progress-ring::after {
  background: var(--surface-3);
}

.chapter-complete {
  color: var(--accent-green);
}

.chapter-menu-enter-active,
.chapter-menu-leave-active {
  transition: opacity 150ms ease, transform 180ms var(--ease-out);
}

.chapter-menu-enter-from,
.chapter-menu-leave-to {
  opacity: 0;
  transform: translateX(-4px);
}

.level-state-enter-active,
.level-state-leave-active {
  transition: opacity 150ms ease, transform 200ms var(--ease-out);
}

.level-state-enter-from,
.level-state-leave-to {
  opacity: 0;
  transform: scale(0.72);
}

.level-button.just-completed {
  animation: level-complete 620ms var(--ease-out) both;
}

.level-button.just-unlocked {
  animation: level-unlock 560ms var(--ease-out) both;
}

@keyframes level-complete {
  42% { transform: scale(1.12); box-shadow: 0 0 0 5px var(--accent-green-soft); }
}

@keyframes level-unlock {
  0% { opacity: 0.58; transform: translateY(3px) scale(0.92); }
  58% { opacity: 1; transform: translateY(-2px) scale(1.06); }
}

@media (max-width: 900px) and (min-height: 601px) {
  .level-rail {
    width: 100%;
    min-width: 0;
    height: 52px;
    flex-direction: row;
    justify-content: flex-start;
    padding: 4px 8px;
  }

  .rail-label,
  .rail-divider {
    display: none;
  }

  .chapter-button,
  .level-button {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
  }

  .level-list {
    flex: 1;
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .chapter-menu {
    top: 54px;
    left: 0;
  }
}
</style>
