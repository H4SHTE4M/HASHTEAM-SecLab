<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { LevelDef } from '../types/lab'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  levels: LevelDef[]
  currentLevel: number
  completedLevels: number[]
  shortLandscapeSplit?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', level: number): void
}>()

const completed = computed(() => new Set(props.completedLevels))
const levelListRef = ref<HTMLElement | null>(null)
const recentlyCompleted = ref<number | null>(null)
const recentlyUnlocked = ref<number | null>(null)
let feedbackTimer: number | null = null

function isUnlocked(level: number): boolean {
  return level === 1 || completed.value.has(level - 1)
}

function clearFeedbackTimer(): void {
  if (feedbackTimer === null) return
  window.clearTimeout(feedbackTimer)
  feedbackTimer = null
}

watch(
  () => [...props.completedLevels],
  (nextCompleted, previousCompleted) => {
    const previous = new Set(previousCompleted)
    const completedNow = nextCompleted.filter((level) => !previous.has(level)).at(-1)
    if (completedNow === undefined) return

    clearFeedbackTimer()
    recentlyCompleted.value = completedNow
    recentlyUnlocked.value = props.levels.some((level) => level.id === completedNow + 1)
      ? completedNow + 1
      : null
    feedbackTimer = window.setTimeout(() => {
      recentlyCompleted.value = null
      recentlyUnlocked.value = null
      feedbackTimer = null
    }, 720)
  },
)

async function scrollCurrentLevelIntoView(): Promise<void> {
  await nextTick()
  if (typeof window.matchMedia !== 'function') return
  if (!window.matchMedia('(max-width: 900px)').matches) return

  const currentButton = levelListRef.value?.querySelector<HTMLElement>(
    `[data-level="${props.currentLevel}"]`,
  )
  if (typeof currentButton?.scrollIntoView !== 'function') return

  currentButton.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'nearest',
    inline: 'center',
  })
}

watch(() => props.currentLevel, scrollCurrentLevelIntoView, {
  immediate: true,
  flush: 'post',
})

onBeforeUnmount(clearFeedbackTimer)
</script>

<template>
  <nav
    class="level-rail"
    :class="{ 'short-landscape-split': shortLandscapeSplit }"
    aria-label="关卡导航"
  >
    <span class="rail-label">关卡</span>
    <div ref="levelListRef" class="level-list">
      <button
        v-for="level in levels"
        :key="level.id"
        type="button"
        class="level-button"
        :class="{
          active: level.id === currentLevel,
          completed: completed.has(level.id),
          locked: !isUnlocked(level.id),
          'just-completed': recentlyCompleted === level.id,
          'just-unlocked': recentlyUnlocked === level.id,
        }"
        :data-level="level.id"
        :disabled="!isUnlocked(level.id)"
        :aria-current="level.id === currentLevel ? 'step' : undefined"
        :aria-label="`第 ${level.id} 关：${level.name}${completed.has(level.id) ? '，已完成' : ''}`"
        :title="`第 ${level.id} 关 · ${level.name}`"
        @click="emit('select', level.id)"
      >
        <Transition name="level-state" mode="out-in">
          <AppIcon
            v-if="completed.has(level.id)"
            :key="`completed-${level.id}`"
            name="check"
            :size="16"
          />
          <AppIcon
            v-else-if="!isUnlocked(level.id)"
            :key="`locked-${level.id}`"
            name="lock"
            :size="14"
          />
          <span v-else :key="`unlocked-${level.id}`">{{ level.id }}</span>
        </Transition>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.level-rail {
  position: relative;
  z-index: 2;
  width: 64px;
  min-width: 64px;
  height: min(680px, 100%);
  align-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 13px 9px;
  overflow: hidden;
  background: var(--rail-bg);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 8px;
  box-shadow: var(--shadow-panel);
  box-sizing: border-box;
}

.rail-label {
  color: var(--text-faint);
  font-size: 10px;
  font-weight: 750;
}

.level-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}

.level-list::-webkit-scrollbar {
  display: none;
}

.level-button {
  position: relative;
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

.level-button:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--surface-3);
  border-color: var(--border-strong);
  box-shadow: var(--shadow-control);
  transform: scale(1.04);
}

.level-button.active {
  color: var(--accent-nav-text);
  background: var(--accent-nav);
  border-color: var(--accent-nav-border);
  box-shadow: var(--shadow-control);
}

.level-button.active::before {
  display: none;
}

.level-button.completed:not(.active) {
  color: var(--accent-green);
}

.level-button.locked {
  color: var(--text-disabled);
  cursor: not-allowed;
}

.level-button.just-completed {
  animation: level-complete 620ms var(--ease-out) both;
}

.level-button.just-unlocked {
  animation: level-unlock 560ms var(--ease-out) both;
}

.level-state-enter-active,
.level-state-leave-active {
  transition: opacity 150ms ease, transform 220ms var(--ease-out);
}

.level-state-enter-from {
  opacity: 0;
  transform: scale(0.62) rotate(-12deg);
}

.level-state-leave-to {
  opacity: 0;
  transform: scale(0.72) rotate(10deg);
}

@keyframes level-complete {
  0%,
  100% {
    transform: scale(1);
  }

  42% {
    transform: scale(1.12);
    box-shadow: 0 0 0 5px var(--accent-green-soft), var(--shadow-control);
  }
}

@keyframes level-unlock {
  0% {
    opacity: 0.58;
    transform: translateY(3px) scale(0.92);
  }

  58% {
    opacity: 1;
    transform: translateY(-2px) scale(1.06);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (max-width: 900px) {
  .level-rail {
    width: 100%;
    min-width: 0;
    height: 64px;
    min-height: 64px;
    align-self: stretch;
    flex-direction: row;
    gap: 8px;
    padding: 10px 12px;
    border: var(--hairline) solid var(--border-subtle);
  }

  .rail-label {
    flex: 0 0 auto;
  }

  .level-list {
    flex: 1;
    flex-direction: row;
    justify-content: flex-start;
    overflow-x: auto;
    overflow-y: hidden;
  }

}

@media (max-width: 900px) and (max-height: 600px) and (orientation: landscape) {
  .level-rail.short-landscape-split {
    width: 56px;
    min-width: 56px;
    height: 100%;
    min-height: 0;
    flex-direction: column;
    gap: 4px;
    padding: 8px 5px;
    border: var(--hairline) solid var(--border-subtle);
  }

  .short-landscape-split .rail-label {
    display: none;
  }

  .short-landscape-split .level-list {
    flex: 1;
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .level-rail:not(.short-landscape-split) {
    height: 52px;
    min-height: 52px;
    gap: 6px;
    padding-top: 4px;
    padding-bottom: 4px;
  }

  .level-rail:not(.short-landscape-split) .level-button {
    width: 44px;
    height: 44px;
    flex-basis: 44px;
  }
}

@media (min-width: 901px) and (max-height: 680px) {
  .level-rail {
    gap: 3px;
    padding-top: 8px;
  }

  .rail-label {
    display: none;
  }

  .level-list {
    gap: 2px;
  }
}
</style>
