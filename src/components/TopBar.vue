<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { LabMode, ThemeName } from '../types/lab'
import AppIcon from './AppIcon.vue'

defineProps<{
  completedCount: number
  total: number
  mode: LabMode
  theme: ThemeName
  currentLevel?: number
  currentLevelName?: string
}>()

const emit = defineEmits<{
  (e: 'reset-level'): void
  (e: 'reset-all'): void
  (e: 'about'): void
  (e: 'help'): void
  (e: 'change-mode', mode: LabMode): void
  (e: 'toggle-theme'): void
}>()

/** 「重新开始」需要二次确认：第一次点击后按钮进入确认态 */
const confirming = ref(false)
let confirmTimer: number | null = null
function handleResetAll(): void {
  if (!confirming.value) {
    confirming.value = true
    confirmTimer = window.setTimeout(() => {
      confirming.value = false
      confirmTimer = null
    }, 3000)
    return
  }
  if (confirmTimer !== null) {
    window.clearTimeout(confirmTimer)
    confirmTimer = null
  }
  confirming.value = false
  emit('reset-all')
}

/** 「重置本关」同样需要二次确认，避免误触丢失当前关进度 */
const confirmingLevel = ref(false)
let confirmLevelTimer: number | null = null
function handleResetLevel(): void {
  if (!confirmingLevel.value) {
    confirmingLevel.value = true
    confirmLevelTimer = window.setTimeout(() => {
      confirmingLevel.value = false
      confirmLevelTimer = null
    }, 3000)
    return
  }
  if (confirmLevelTimer !== null) {
    window.clearTimeout(confirmLevelTimer)
    confirmLevelTimer = null
  }
  confirmingLevel.value = false
  emit('reset-level')
}

onBeforeUnmount(() => {
  if (confirmTimer !== null) window.clearTimeout(confirmTimer)
  if (confirmLevelTimer !== null) window.clearTimeout(confirmLevelTimer)
})
</script>

<template>
  <header class="topbar">
    <div class="topbar-identity">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">#</span>
        <span class="brand-lockup">
          <strong class="brand-name">HASHTEAM</strong>
          <span class="brand-sub">Security Lab</span>
        </span>
      </div>

      <Transition name="context-shift" mode="out-in">
        <div
          v-if="currentLevel"
          :key="currentLevel"
          class="workspace-context"
          aria-label="当前位置"
        >
          <span class="context-eyebrow">实验工作台</span>
          <span class="context-title">
            <strong>第 {{ currentLevel }} 关</strong>
            <span v-if="currentLevelName" class="context-name">{{ currentLevelName }}</span>
          </span>
        </div>
      </Transition>
    </div>

    <div class="topbar-controls">
      <div
        class="progress"
        title="关卡进度"
        role="progressbar"
        aria-label="已完成关卡"
        aria-valuemin="0"
        :aria-valuemax="total"
        :aria-valuenow="completedCount"
      >
        <span class="progress-copy">
          <span class="progress-label">
            <AppIcon name="list-checks" :size="14" />
            <span>学习进度</span>
          </span>
          <strong class="progress-value">{{ completedCount }} / {{ total }}</strong>
        </span>
        <span class="progress-track" aria-hidden="true">
          <i
            v-for="step in total"
            :key="step"
            :class="{ complete: step <= completedCount }"
          />
        </span>
      </div>

      <div class="mission-controls">
        <div class="mission-controls-layout">
          <nav class="actions">
            <div class="mode-segment" aria-label="学习模式">
              <span class="mode-indicator" :class="{ challenge: mode === 'challenge' }" aria-hidden="true" />
              <button
                type="button"
                :class="{ active: mode === 'guided' }"
                :aria-pressed="mode === 'guided'"
                aria-label="引导模式"
                title="引导模式"
                @click="emit('change-mode', 'guided')"
              >
                <AppIcon name="book-open" :size="15" />
                <span>引导</span>
              </button>
              <button
                type="button"
                :class="{ active: mode === 'challenge' }"
                :aria-pressed="mode === 'challenge'"
                aria-label="挑战模式"
                title="挑战模式"
                @click="emit('change-mode', 'challenge')"
              >
                <AppIcon name="crosshair" :size="15" />
                <span>挑战</span>
              </button>
            </div>

            <div class="tool-group">
              <button
                type="button"
                class="icon-btn"
                aria-label="操作帮助"
                data-tooltip="操作帮助"
                data-tooltip-placement="bottom"
                @click="emit('help')"
              >
                <AppIcon name="help-circle" />
                <span class="btn-label">操作帮助</span>
              </button>
              <button
                type="button"
                class="icon-btn"
                :class="{ confirming: confirmingLevel }"
                :aria-label="confirmingLevel ? '再次点击以确认重置本关' : '重置本关'"
                :data-tooltip="confirmingLevel ? '再次点击确认' : '重置本关'"
                data-tooltip-placement="bottom"
                @click="handleResetLevel"
              >
                <AppIcon name="rotate-ccw" />
                <span class="btn-label">{{ confirmingLevel ? '确认重置？' : '重置本关' }}</span>
              </button>
              <button
                type="button"
                class="icon-btn restart-btn"
                :class="{ confirming }"
                :aria-label="confirming ? '再次点击以确认重新开始' : '重新开始全部关卡'"
                :data-tooltip="confirming ? '再次点击确认' : '重新开始'"
                data-tooltip-placement="bottom"
                @click="handleResetAll"
              >
                <AppIcon name="server" />
                <span class="btn-label">{{ confirming ? '确认重新开始？' : '重新开始' }}</span>
              </button>
              <button
                type="button"
                class="icon-btn"
                aria-label="关于实验室"
                data-tooltip="关于实验室"
                data-tooltip-placement="bottom-end"
                @click="emit('about')"
              >
                <AppIcon name="info" />
                <span class="btn-label">关于</span>
              </button>
            </div>
          </nav>

          <button
            type="button"
            class="icon-btn theme-toggle"
            :aria-label="theme === 'light' ? '切换到深色模式' : '切换到浅色模式'"
            :aria-pressed="theme === 'dark'"
            :data-tooltip="theme === 'light' ? '深色模式' : '浅色模式'"
            data-tooltip-placement="bottom-end"
            @click="emit('toggle-theme')"
          >
            <Transition name="theme-icon" mode="out-in">
              <AppIcon :key="theme" :name="theme === 'light' ? 'moon' : 'sun'" />
            </Transition>
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: relative;
  z-index: 10;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 28px;
  height: calc(76px + var(--safe-top));
  padding: var(--safe-top) calc(24px + var(--safe-right)) 0 calc(24px + var(--safe-left));
  background: var(--topbar-bg);
  backdrop-filter: blur(18px) saturate(112%);
  flex-shrink: 0;
}

.topbar-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 22px;
}

.brand {
  justify-self: start;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  white-space: nowrap;
}

.brand-mark {
  flex: 0 0 auto;
  color: var(--accent-cyan);
  font-family: var(--font-display);
  font-size: 27px;
  font-weight: 780;
  line-height: 1;
}

.brand-lockup {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.brand-name {
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 740;
  line-height: 1;
}

.brand-sub {
  color: var(--text-faint);
  font-size: 14px;
  font-weight: 450;
  line-height: 1;
}

.workspace-context {
  min-width: 0;
  justify-self: start;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 2px 0 2px 20px;
  color: var(--text-faint);
  white-space: nowrap;
  background: transparent;
  border-left: var(--hairline) solid var(--border-strong);
}

.context-eyebrow {
  color: var(--text-faint);
  font-size: 11px;
  font-weight: 620;
  line-height: 1;
}

.context-title {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
  line-height: 1;
}

.workspace-context strong {
  color: var(--accent-cyan);
  font-size: 16px;
  font-weight: 720;
}

.context-name {
  max-width: 230px;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 15px;
  font-weight: 560;
  text-overflow: ellipsis;
}

.topbar-controls {
  min-width: 0;
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 16px;
}

.mission-controls,
.mission-controls-layout {
  display: contents;
}

.progress {
  width: 140px;
  min-height: 52px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 7px 9px;
  background: var(--floating-surface);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 8px;
  box-shadow: var(--shadow-control);
}

.progress-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.progress-label,
.progress-value {
  font-size: 11px;
}

.progress-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-faint);
  font-weight: 560;
}

.progress-label svg {
  color: var(--accent-green);
}

.progress-value {
  color: var(--text-primary);
  font-weight: 720;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.progress-track {
  width: 100%;
  height: 5px;
  display: flex;
  gap: 2px;
}

.progress-track i {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  background: var(--surface-3);
  border-radius: 2px;
  transform: scaleY(0.72);
  transition: background-color var(--duration-normal) ease, transform var(--duration-slow) var(--ease-out), box-shadow var(--duration-normal) ease;
}

.progress-track i.complete {
  background: var(--accent-green);
  box-shadow: 0 0 7px var(--accent-green-soft);
  transform: scaleY(1);
}

.actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.mode-segment {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2px;
  padding: 3px;
  background: var(--floating-surface);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 8px;
  box-shadow: var(--shadow-control);
}

.mode-indicator {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc((100% - 8px) / 2);
  background: var(--accent-nav);
  border: var(--hairline) solid var(--accent-nav-border);
  border-radius: 6px;
  box-shadow: var(--shadow-control);
  transition: transform var(--duration-slow) var(--ease-out);
}

.mode-indicator.challenge {
  transform: translateX(calc(100% + 2px));
}

.mode-segment button {
  position: relative;
  z-index: 1;
  width: 62px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 8px;
  color: var(--text-faint);
  font-size: 11px;
  font-weight: 650;
  background: transparent;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
  transition: color 180ms ease, background 180ms ease;
}

.mode-segment button:hover {
  color: var(--text-secondary);
}

.mode-segment button.active {
  color: var(--accent-nav-text);
}

.tool-group {
  display: flex;
  gap: 8px;
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
}

.icon-btn {
  position: relative;
  min-width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 9px;
  color: var(--text-faint);
  background: transparent;
  border: var(--hairline) solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: color 180ms ease, background 180ms ease, border-color 180ms ease;
}

.icon-btn:hover {
  color: var(--text-primary);
  background: var(--surface-3);
  border-color: var(--border-subtle);
  box-shadow: none;
}

.icon-btn:hover svg {
  transform: translateY(-1px);
}

.tool-group .icon-btn {
  background: var(--floating-surface);
  border-color: var(--border-subtle);
  border-radius: 8px;
  box-shadow: var(--shadow-control);
}

.theme-toggle {
  width: 44px;
  min-width: 44px;
  padding: 0;
  background: var(--floating-surface);
  border-color: var(--border-subtle);
  border-radius: 8px;
  box-shadow: var(--shadow-control);
}

.tool-group .icon-btn:hover,
.theme-toggle:hover {
  background: var(--surface-3);
  box-shadow: none;
}

.theme-icon-enter-active,
.theme-icon-leave-active {
  transition: opacity var(--duration-fast) ease, transform var(--duration-normal) var(--ease-out);
}

.theme-icon-enter-from {
  opacity: 0;
  transform: rotate(-35deg) scale(0.72);
}

.theme-icon-leave-to {
  opacity: 0;
  transform: rotate(35deg) scale(0.72);
}

.btn-label {
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
}

.icon-btn.confirming {
  color: var(--accent-red);
  background: color-mix(in srgb, var(--accent-red) 12%, transparent);
  border-color: color-mix(in srgb, var(--accent-red) 34%, transparent);
}

.icon-btn.confirming::after {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  width: 76px;
  padding: 5px 7px;
  color: var(--text-primary);
  font-size: 10px;
  text-align: center;
  white-space: nowrap;
  background: var(--surface-raised);
  border: var(--hairline) solid color-mix(in srgb, var(--accent-red) 34%, transparent);
  border-radius: 5px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
  content: '再次点击确认';
}

.context-shift-enter-active,
.context-shift-leave-active {
  transition: opacity var(--duration-normal) ease, transform var(--duration-slow) var(--ease-out);
}

.context-shift-enter-from {
  opacity: 0;
  transform: translateX(8px);
}

.context-shift-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}

@media (min-width: 901px) {
  .topbar {
    grid-template-columns: var(--workspace-rail-width) minmax(0, 1fr) var(--workspace-resizer-width) var(--mission-panel-width);
    gap: var(--workspace-column-gap);
    padding-right: calc(var(--space-4) + var(--safe-right));
    padding-left: calc(var(--space-4) + var(--safe-left));
  }

  .topbar-identity {
    grid-column: 1 / 3;
    grid-row: 1;
    padding-right: 156px;
    overflow: hidden;
  }

  .topbar-controls {
    display: contents;
  }

  .progress {
    grid-column: 1 / 3;
    grid-row: 1;
    justify-self: end;
  }

  .mission-controls {
    min-width: 0;
    display: block;
    grid-column: 4;
    grid-row: 1;
    container-type: inline-size;
  }

  .mission-controls-layout {
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    column-gap: 8px;
  }

  .actions {
    display: contents;
  }

  .tool-group {
    grid-column: 3;
    justify-self: end;
  }
}

@container (max-width: 392px) {
  .mission-controls-layout {
    column-gap: 2px;
  }

  .mode-segment button span {
    display: none;
  }

  .tool-group .btn-label {
    display: none;
  }

  .mode-segment button {
    width: 44px;
    padding-inline: 0;
  }

  .tool-group {
    gap: 0;
  }
}

@media (max-width: 1180px) {
  .workspace-context {
    display: none;
  }
}

@media (max-width: 900px) {
  .topbar {
    height: auto;
    grid-template-areas:
      'brand progress theme'
      'actions actions actions';
    grid-template-columns: minmax(0, 1fr) auto 44px;
    gap: 10px var(--space-4);
    padding: calc(10px + var(--safe-top)) calc(12px + var(--safe-right)) 10px calc(12px + var(--safe-left));
  }

  .topbar-identity {
    grid-area: brand;
    min-width: 0;
  }

  .topbar-controls {
    display: contents;
  }

  .progress {
    grid-area: progress;
    width: 112px;
  }

  .actions {
    grid-area: actions;
    justify-content: space-between;
    gap: 12px;
  }

  /* 窄屏顶栏空间紧张，工具按钮只留图标（tooltip/aria-label 仍在） */
  .tool-group .btn-label {
    display: none;
  }

  .theme-toggle {
    grid-area: theme;
  }
}

@media (min-width: 431px) and (max-width: 900px) and (max-height: 600px) and (orientation: landscape) {
  .topbar {
    height: calc(52px + var(--safe-top));
    grid-template-areas: none;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    padding: var(--safe-top) calc(8px + var(--safe-right)) 0 calc(8px + var(--safe-left));
  }

  .topbar-controls {
    justify-self: end;
    display: flex;
    gap: 4px;
  }

  .topbar-identity {
    grid-area: auto;
  }

  .brand {
    gap: 6px;
  }

  .brand-mark {
    font-size: 22px;
  }

  .brand-name {
    font-size: 16px;
  }

  .brand-sub,
  .progress-label,
  .progress-track,
  .mode-segment button span {
    display: none;
  }

  .progress {
    width: 48px;
    min-height: 36px;
    gap: 0;
    padding: 5px 6px;
  }

  .progress-copy {
    justify-content: center;
  }

  .actions {
    gap: 4px;
  }

  .mode-segment {
    padding: 2px;
  }

  .mode-segment button {
    width: 44px;
    height: 44px;
    min-height: 44px;
    padding: 0;
  }

  .mode-indicator {
    top: 2px;
    bottom: 2px;
    left: 2px;
    width: calc((100% - 6px) / 2);
  }

  .tool-group {
    gap: 3px;
  }

  .icon-btn,
  .theme-toggle {
    width: 44px;
    min-width: 44px;
    height: 44px;
    min-height: 44px;
    padding: 0;
  }
}

@media (max-width: 560px) and (max-height: 600px) and (orientation: landscape) {
  .brand-lockup {
    display: none;
  }
}

@media (min-width: 901px) and (max-height: 600px) {
  .topbar {
    height: calc(64px + var(--safe-top));
  }

  .mode-segment button,
  .icon-btn {
    height: 44px;
    min-height: 44px;
  }
}

@media (max-width: 430px) {
  .brand-sub,
  .progress-label span {
    display: none;
  }

  .progress {
    width: 80px;
    padding-inline: 7px;
  }

  .actions {
    justify-content: space-between;
    gap: 10px;
  }

  .tool-group {
    gap: 6px;
  }

  .mode-segment button {
    padding-inline: 8px;
  }

  .icon-btn {
    min-width: 44px;
    height: 44px;
    padding-inline: 7px;
  }
}

@media (max-width: 430px) and (max-height: 600px) and (orientation: landscape) {
  .topbar {
    gap: 4px 12px;
    padding: calc(4px + var(--safe-top)) calc(8px + var(--safe-right)) 4px calc(8px + var(--safe-left));
  }

  .progress {
    height: 44px;
    min-height: 44px;
    gap: 3px;
    padding-block: 4px;
  }

  .mode-segment {
    padding: 1px;
  }

  .mode-indicator {
    top: 1px;
    bottom: 1px;
    left: 1px;
    width: calc((100% - 4px) / 2);
  }
}

@media (max-width: 360px) {
  .mode-segment button {
    width: 44px;
    padding-inline: 0;
    justify-content: center;
  }

  .mode-segment button span {
    display: none;
  }

  .actions {
    gap: 8px;
  }
}

@media (max-width: 360px) and (max-height: 600px) and (orientation: landscape) {
  .progress {
    display: none;
  }
}

</style>
