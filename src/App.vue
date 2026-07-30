<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TopBar from './components/TopBar.vue'
import LabTerminal from './components/LabTerminal.vue'
import MissionPanel from './components/MissionPanel.vue'
import LevelRail from './components/LevelRail.vue'
import AppIcon from './components/AppIcon.vue'
import LoadingScreen from './components/LoadingScreen.vue'
import CompletionPage from './components/CompletionPage.vue'
import AboutModal from './components/AboutModal.vue'
import OnboardingDialog from './components/OnboardingDialog.vue'
import { useVirtualMachine } from './composables/useVirtualMachine'
import { useLabProgress } from './composables/useLabProgress'
import { useLabPreferences } from './composables/useLabPreferences'
import { createSafeStorage } from './services/progress-store'
import {
  getMissionPanelWidthBounds,
  measureHorizontalSafeArea,
  shouldSplitShortLandscape,
} from './services/workspace-layout'
import {
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
} from './services/ui-preferences-store'
import { getLevel, LEVELS, TOTAL_LEVELS } from './data/levels'
import type { LabMode, ThemeName } from './types/lab'

const PANEL_WIDTH_STORAGE_KEY = 'hashteam-mission-panel-width-v1'
const THEME_STORAGE_KEY = 'hashteam-theme-v1'
const PANEL_DEFAULT_MIN = 420
const PANEL_DEFAULT_MAX = 520
const BOOT_OVERLAY_MIN_VISIBLE_MS = 900
const BOOT_READY_HOLD_MS = 180
const layoutStorage = createSafeStorage()

function loadTheme(): ThemeName {
  return layoutStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function defaultPanelWidth(viewportWidth: number): number {
  return Math.round(clamp(viewportWidth * 0.31, PANEL_DEFAULT_MIN, PANEL_DEFAULT_MAX))
}

function loadPanelWidth(viewportWidth: number): number {
  const stored = Number(layoutStorage.getItem(PANEL_WIDTH_STORAGE_KEY))
  return Number.isFinite(stored) && stored > 0 ? stored : defaultPanelWidth(viewportWidth)
}

const vm = useVirtualMachine()
const progress = useLabProgress()
const preferences = useLabPreferences()

const terminalRef = ref<InstanceType<typeof LabTerminal> | null>(null)
const showAbout = ref(false)
const showOnboarding = ref(
  !preferences.state.onboardingComplete ||
    preferences.state.mode === null ||
    progress.progressResetNotice.value,
)
const showCompletion = ref(progress.allCompleted.value)
const viewportWidth = ref(window.innerWidth)
const viewportHeight = ref(window.innerHeight)
const horizontalSafeArea = ref(measureHorizontalSafeArea(document))
const missionPanelWidth = ref(loadPanelWidth(viewportWidth.value))
const isPanelResizing = ref(false)
const theme = ref<ThemeName>(loadTheme())
const showBootOverlay = ref(!showCompletion.value)
let resizeStartX = 0
let resizeStartWidth = 0
let themeTransitionTimer: number | null = null
let bootOverlayTimer: number | null = null
let bootOverlayShownAt = performance.now()
let overlayReturnFocus: HTMLElement | null = null

document.documentElement.dataset.theme = theme.value

const currentLevelDef = computed(() => getLevel(progress.state.currentLevel) ?? getLevel(1)!)
const currentCompleted = computed(() => progress.state.completedLevels.includes(progress.state.currentLevel))
const currentHintsUsed = computed(() => progress.hintsUsedFor(progress.state.currentLevel))
const isLastLevel = computed(() => progress.state.currentLevel >= TOTAL_LEVELS)
const currentMode = computed(() => preferences.state.mode ?? 'guided')
const showOnboardingDialog = computed(
  () =>
    !showCompletion.value &&
    vm.stage.value === 'ready' &&
    !showBootOverlay.value &&
    showOnboarding.value,
)
const backgroundInert = computed(
  () => showBootOverlay.value || showAbout.value || showOnboardingDialog.value,
)
const shortLandscapeSplit = computed(() =>
  shouldSplitShortLandscape(
    viewportWidth.value,
    viewportHeight.value,
    horizontalSafeArea.value,
  ),
)
const currentGuideStep = computed(() =>
  progress.guideStepFor(
    progress.state.currentLevel,
    currentLevelDef.value.steps.length,
  ),
)
const currentCompletedSteps = computed(() =>
  progress.completedStepsFor(progress.state.currentLevel),
)
const currentCompletionRecord = computed(
  () => progress.state.completionRecords[progress.state.currentLevel],
)
const panelWidthBounds = computed(() =>
  getMissionPanelWidthBounds(
    viewportWidth.value,
    viewportHeight.value,
    horizontalSafeArea.value,
  ),
)
const effectiveMissionPanelWidth = computed(() =>
  clamp(
    missionPanelWidth.value,
    panelWidthBounds.value.min,
    panelWidthBounds.value.max,
  ),
)
const workspaceStyle = computed(() => ({
  '--mission-panel-width': `${effectiveMissionPanelWidth.value}px`,
}))

let unsubscribeDisplay: (() => void) | null = null

function clearBootOverlayTimer(): void {
  if (bootOverlayTimer === null) return
  window.clearTimeout(bootOverlayTimer)
  bootOverlayTimer = null
}

watch(
  () => vm.stage.value,
  (stage) => {
    clearBootOverlayTimer()

    if (showCompletion.value) {
      showBootOverlay.value = false
      return
    }

    if (stage !== 'ready') {
      showBootOverlay.value = true
      if (stage === 'loading-assets') bootOverlayShownAt = performance.now()
      return
    }

    const visibleFor = performance.now() - bootOverlayShownAt
    const delay = Math.max(BOOT_READY_HOLD_MS, BOOT_OVERLAY_MIN_VISIBLE_MS - visibleFor)
    bootOverlayTimer = window.setTimeout(() => {
      showBootOverlay.value = false
      bootOverlayTimer = null
    }, delay)
  },
  { immediate: true },
)

watch(
  [
    () => preferences.state.mode,
    () => progress.state.currentLevel,
    () => currentCompleted.value,
  ],
  ([mode, level, completed]) => {
    if (mode === 'guided' && !completed) progress.markGuided(level)
  },
  { immediate: true },
)

onMounted(() => {
  if (showCompletion.value) return
  // 显示文本 → 终端；终端输入 → 虚拟机串口
  unsubscribeDisplay = vm.onDisplay((data) => {
    terminalRef.value?.write(data)
  })
  window.addEventListener('resize', handleViewportResize)
  window.visualViewport?.addEventListener('resize', handleViewportResize)
  void vm.boot()
})

onBeforeUnmount(() => {
  unsubscribeDisplay?.()
  unsubscribeDisplay = null
  window.removeEventListener('resize', handleViewportResize)
  window.visualViewport?.removeEventListener('resize', handleViewportResize)
  stopPanelResize()
  clearBootOverlayTimer()
  if (themeTransitionTimer !== null) window.clearTimeout(themeTransitionTimer)
  document.documentElement.classList.remove('theme-changing')
  void vm.dispose()
})

function applyTheme(nextTheme: ThemeName, animate: boolean): void {
  theme.value = nextTheme
  document.documentElement.dataset.theme = nextTheme
  layoutStorage.setItem(THEME_STORAGE_KEY, nextTheme)

  if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (themeTransitionTimer !== null) window.clearTimeout(themeTransitionTimer)
  document.documentElement.classList.add('theme-changing')
  themeTransitionTimer = window.setTimeout(() => {
    document.documentElement.classList.remove('theme-changing')
    themeTransitionTimer = null
  }, 300)
}

function toggleTheme(): void {
  applyTheme(theme.value === 'light' ? 'dark' : 'light', true)
}

function handleViewportResize(): void {
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
  horizontalSafeArea.value = measureHorizontalSafeArea(document)
}

function persistPanelWidth(): void {
  layoutStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(Math.round(missionPanelWidth.value)))
}

function startPanelResize(event: PointerEvent): void {
  if (event.button !== 0) return
  const handle = event.currentTarget
  if (!(handle instanceof HTMLElement)) return

  resizeStartX = event.clientX
  resizeStartWidth = effectiveMissionPanelWidth.value
  isPanelResizing.value = true
  handle.setPointerCapture(event.pointerId)
  document.documentElement.classList.add('is-panel-resizing')
  event.preventDefault()
}

function movePanelResize(event: PointerEvent): void {
  if (!isPanelResizing.value) return
  const nextWidth = resizeStartWidth - (event.clientX - resizeStartX)
  missionPanelWidth.value = clamp(
    nextWidth,
    panelWidthBounds.value.min,
    panelWidthBounds.value.max,
  )
}

function stopPanelResize(): void {
  if (!isPanelResizing.value) return
  isPanelResizing.value = false
  document.documentElement.classList.remove('is-panel-resizing')
  persistPanelWidth()
}

function resetPanelWidth(): void {
  missionPanelWidth.value = clamp(
    defaultPanelWidth(viewportWidth.value),
    panelWidthBounds.value.min,
    panelWidthBounds.value.max,
  )
  persistPanelWidth()
}

function handlePanelResizeKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 32 : 12
  let nextWidth = effectiveMissionPanelWidth.value

  if (event.key === 'ArrowLeft') nextWidth += step
  else if (event.key === 'ArrowRight') nextWidth -= step
  else if (event.key === 'Home') nextWidth = panelWidthBounds.value.min
  else if (event.key === 'End') nextWidth = panelWidthBounds.value.max
  else return

  event.preventDefault()
  missionPanelWidth.value = clamp(
    nextWidth,
    panelWidthBounds.value.min,
    panelWidthBounds.value.max,
  )
  persistPanelWidth()
}

function handleTerminalInput(data: string): void {
  vm.sendSerial(data)
}

function adjustTerminalFontSize(delta: number): void {
  preferences.setTerminalFontSize(preferences.state.terminalFontSize + delta)
}

function handleRunCommand(command: string): void {
  // runCommand 会先清空终端未提交的输入，避免与已有内容拼接
  vm.runCommand(command)
  terminalRef.value?.focus()
}

function handleRunDemo(): void {
  handleRunCommand('echo "hello, HASHTEAM"')
}

function handleChangeMode(mode: LabMode): void {
  preferences.setMode(mode)
  if (mode === 'guided' && !currentCompleted.value) {
    progress.markGuided(progress.state.currentLevel)
  }
}

function handleNextLevel(): void {
  if (isLastLevel.value) {
    showCompletion.value = true
    unsubscribeDisplay?.()
    unsubscribeDisplay = null
    void vm.dispose()
    return
  }
  vm.gotoLevel(progress.state.currentLevel + 1)
}

function handleSelectLevel(level: number): void {
  if (level === progress.state.currentLevel) {
    terminalRef.value?.focus()
    return
  }
  vm.gotoLevel(level)
  terminalRef.value?.focus()
}

function handleResetLevel(): void {
  progress.resetLevel(progress.state.currentLevel)
  if (preferences.state.mode === 'guided') {
    progress.markGuided(progress.state.currentLevel)
  }
  vm.resetCurrentLevel()
}

function handleResetAll(): void {
  // 先同步清空 LocalStorage 中的进度（resetAllProgress 是同步的），
  // 再刷新网页：刷新后 loadProgress 读到全新空进度，VM 也从全新 Linux 环境启动。
  progress.resetAll()
  window.location.reload()
}

function handleCompleteOnboarding(): void {
  preferences.completeOnboarding()
  progress.dismissProgressResetNotice()
  showOnboarding.value = false
  restoreFocusAfterOverlayClose()
}

function restoreFocusAfterOverlayClose(): void {
  const returnFocus = overlayReturnFocus
  overlayReturnFocus = null
  void nextTick(() => {
    if (showAbout.value || showOnboardingDialog.value) return
    if (returnFocus?.isConnected) returnFocus.focus()
    else terminalRef.value?.focus()
  })
}

function openAbout(trigger: HTMLElement): void {
  overlayReturnFocus = trigger
  showOnboarding.value = false
  showAbout.value = true
}

function closeAbout(): void {
  showAbout.value = false
  restoreFocusAfterOverlayClose()
}

function openHelp(trigger: HTMLElement): void {
  overlayReturnFocus = trigger
  showAbout.value = false
  showOnboarding.value = true
}
</script>

<template>
  <div class="app-shell">
    <div
      class="app-content"
      :style="workspaceStyle"
      :inert="backgroundInert"
      :aria-hidden="backgroundInert ? 'true' : undefined"
    >
      <a class="skip-link" href="#lab-workspace">跳到实验工作台</a>
      <TopBar
        v-if="!showCompletion"
        :completed-count="progress.state.completedLevels.length"
        :total="TOTAL_LEVELS"
        :mode="currentMode"
        :current-level="progress.state.currentLevel"
        :current-level-name="currentLevelDef.name"
        :theme="theme"
        @reset-level="handleResetLevel"
        @reset-all="handleResetAll"
        @about="openAbout"
        @help="openHelp"
        @change-mode="handleChangeMode"
        @toggle-theme="toggleTheme"
      />

      <Transition name="workspace-swap" mode="out-in">
        <main
          v-if="!showCompletion"
          id="lab-workspace"
          key="workspace"
          class="workspace"
          :class="{
            'is-resizing': isPanelResizing,
            'short-landscape-split': shortLandscapeSplit,
          }"
        >
          <LevelRail
            :levels="LEVELS"
            :current-level="progress.state.currentLevel"
            :completed-levels="progress.state.completedLevels"
            :completion-records="progress.state.completionRecords"
            :short-landscape-split="shortLandscapeSplit"
            @select="handleSelectLevel"
          />
          <section class="terminal-pane">
            <header class="terminal-header">
              <div class="terminal-title">
                <AppIcon name="terminal" :size="16" />
                <span>Linux 终端</span>
                <code>guest@hashteam</code>
              </div>
              <div class="terminal-actions">
                <div class="font-size-control" role="group" aria-label="终端字号">
                  <button
                    type="button"
                    aria-label="减小终端字号"
                    data-tooltip="减小字号"
                    data-tooltip-placement="bottom"
                    :disabled="preferences.state.terminalFontSize <= TERMINAL_FONT_SIZE_MIN"
                    @click="adjustTerminalFontSize(-1)"
                  >
                    <AppIcon name="minus" :size="13" />
                  </button>
                  <output
                    class="font-size-value"
                    aria-live="polite"
                    :aria-label="`当前终端字号 ${preferences.state.terminalFontSize} 像素`"
                  >{{ preferences.state.terminalFontSize }}</output>
                  <button
                    type="button"
                    aria-label="增大终端字号"
                    data-tooltip="增大字号"
                    data-tooltip-placement="bottom"
                    :disabled="preferences.state.terminalFontSize >= TERMINAL_FONT_SIZE_MAX"
                    @click="adjustTerminalFontSize(1)"
                  >
                    <AppIcon name="plus" :size="13" />
                  </button>
                </div>
                <div
                  class="vm-status"
                  role="status"
                  :aria-label="vm.stage.value === 'ready' ? '本地虚拟机已连接' : '本地虚拟机正在启动'"
                >
                  <span class="status-dot" aria-hidden="true" />
                  <AppIcon name="server" :size="14" />
                  <span>{{ vm.stage.value === 'ready' ? '本地 VM' : 'VM 启动中' }}</span>
                </div>
              </div>
            </header>
            <div class="terminal-surface">
              <LabTerminal
                ref="terminalRef"
                :font-size="preferences.state.terminalFontSize"
                :auto-focus="!backgroundInert"
                @input="handleTerminalInput"
              />
            </div>
          </section>
          <div
            class="panel-resizer"
            role="separator"
            tabindex="0"
            aria-label="调整任务栏宽度"
            aria-orientation="vertical"
            :aria-valuemin="panelWidthBounds.min"
            :aria-valuemax="panelWidthBounds.max"
            :aria-valuenow="Math.round(effectiveMissionPanelWidth)"
            :aria-valuetext="`${Math.round(effectiveMissionPanelWidth)} 像素`"
            data-tooltip="拖动调整任务栏"
            data-tooltip-placement="left"
            @pointerdown="startPanelResize"
            @pointermove="movePanelResize"
            @pointerup="stopPanelResize"
            @pointercancel="stopPanelResize"
            @dblclick="resetPanelWidth"
            @keydown="handlePanelResizeKeydown"
          >
            <span class="resizer-grip" aria-hidden="true" />
          </div>
          <MissionPanel
            :level="currentLevelDef"
            :completed="currentCompleted"
            :hints-used="currentHintsUsed"
            :is-last="isLastLevel"
            :mode="currentMode"
            :guide-step="currentGuideStep"
            :completed-steps="currentCompletedSteps"
            :completion-record="currentCompletionRecord"
            @next="handleNextLevel"
            @use-hint="progress.useHint"
            @run-command="handleRunCommand"
            @advance-guide="progress.advanceGuide"
            @complete-step="progress.completeStep"
            @change-mode="handleChangeMode"
          />
        </main>
        <CompletionPage
          v-else
          key="completion"
          :completion-records="progress.state.completionRecords"
          @restart="handleResetAll"
        />
      </Transition>
    </div>

    <Transition name="overlay-fade">
      <LoadingScreen
        v-if="showBootOverlay"
        :stage="vm.stage.value"
        :error-message="vm.errorMessage.value"
        @retry="vm.boot"
      />
    </Transition>
    <Transition name="overlay-fade">
      <AboutModal v-if="showAbout" @close="closeAbout" />
    </Transition>
    <Transition name="overlay-fade">
      <OnboardingDialog
        v-if="showOnboardingDialog"
        :mode="preferences.state.mode"
        :progress-reset-notice="progress.progressResetNotice.value"
        @select-mode="handleChangeMode"
        @run-demo="handleRunDemo"
        @complete="handleCompleteOnboarding"
      />
    </Transition>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100svh;
  height: 100dvh;
  overflow: hidden;
  background: linear-gradient(180deg, var(--bg-canvas-top) 0%, var(--bg-canvas) 100%);
  color: var(--text-secondary);
}

.app-content {
  --workspace-rail-width: 64px;
  --workspace-resizer-width: 24px;
  --workspace-column-gap: var(--space-2);

  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.skip-link {
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 100;
  padding: 8px 12px;
  color: var(--bg-canvas);
  font-size: 13px;
  font-weight: 700;
  background: var(--accent-cyan);
  border-radius: 6px;
  transform: translateY(-140%);
  transition: transform 160ms ease;
}

.skip-link:focus {
  transform: translateY(0);
}

.workspace {
  flex: 1;
  display: grid;
  grid-template-columns: var(--workspace-rail-width) minmax(0, 1fr) var(--workspace-resizer-width) var(--mission-panel-width);
  gap: var(--workspace-column-gap);
  padding: 0 calc(var(--space-4) + var(--safe-right)) max(var(--space-4), var(--safe-bottom)) calc(var(--space-4) + var(--safe-left));
  min-height: 0;
  overflow: hidden;
}

.workspace:not(.is-resizing) {
  transition: grid-template-columns var(--duration-normal) var(--ease-out);
}

.terminal-pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  --surface-1: #0c1113;
  --surface-2: #11191b;
  --surface-3: #182225;
  --surface-raised: #1d292c;
  --border-subtle: #273034;
  --border-strong: #435458;
  --text-primary: #f0f5f4;
  --text-secondary: #d0d9d7;
  --text-muted: #93a29f;
  --text-faint: #71807d;
  --accent-cyan: #6bd5d2;
  --accent-cyan-soft: rgba(107, 213, 210, 0.11);
  --accent-cyan-border: rgba(107, 213, 210, 0.3);
  background: #090d0f;
  border: var(--hairline) solid #273034;
  border-radius: 8px;
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.panel-resizer {
  position: relative;
  z-index: 4;
  min-width: 24px;
  display: grid;
  place-items: center;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 8px;
  cursor: col-resize;
  touch-action: none;
  transition: background-color var(--duration-normal) ease, border-color var(--duration-normal) ease;
}

.resizer-grip {
  width: 3px;
  height: 44px;
  background: var(--resizer-color);
  border-radius: 3px;
  box-shadow: 0 -8px 0 -1px var(--resizer-color), 0 8px 0 -1px var(--resizer-color);
  transition: height var(--duration-normal) var(--ease-out), background-color var(--duration-normal) ease, box-shadow var(--duration-normal) ease;
}

.panel-resizer:hover,
.panel-resizer:focus-visible,
.panel-resizer:active {
  background: var(--accent-cyan-soft);
  border-color: var(--accent-cyan-border);
}

.panel-resizer:hover .resizer-grip,
.panel-resizer:focus-visible .resizer-grip,
.panel-resizer:active .resizer-grip,
.workspace.is-resizing .resizer-grip {
  height: 56px;
  background: var(--accent-cyan);
  box-shadow: 0 -9px 0 -1px var(--accent-cyan), 0 9px 0 -1px var(--accent-cyan);
}

.terminal-header {
  height: 48px;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px;
  background: #0c1113;
  border-bottom: var(--hairline) solid #273034;
}

.terminal-title,
.vm-status {
  display: flex;
  align-items: center;
}

.terminal-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.font-size-control {
  height: 46px;
  display: grid;
  grid-template-columns: 44px 32px 44px;
  align-items: stretch;
  color: var(--text-muted);
  background: var(--surface-2);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 7px;
}

.font-size-control button {
  min-width: 0;
  display: grid;
  place-items: center;
  padding: 0;
  color: var(--text-muted);
  background: transparent;
  border: 0;
  cursor: pointer;
}

.font-size-control button:hover:not(:disabled),
.font-size-control button:focus-visible {
  color: var(--accent-cyan);
  background: var(--accent-cyan-soft);
}

.font-size-control button:disabled {
  color: var(--text-faint);
  cursor: not-allowed;
  opacity: 0.42;
}

.font-size-value {
  display: grid;
  place-items: center;
  color: var(--text-secondary);
  font: 600 10px/1 var(--font-mono);
  font-variant-numeric: tabular-nums;
  border-right: var(--hairline) solid var(--border-subtle);
  border-left: var(--hairline) solid var(--border-subtle);
}

.terminal-title {
  min-width: 0;
  gap: 9px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 680;
}

.terminal-title > span {
  flex: 0 0 auto;
  white-space: nowrap;
}

.terminal-title > svg {
  width: 28px;
  height: 28px;
  padding: 6px;
  color: var(--accent-cyan);
  background: var(--accent-cyan-soft);
  border: var(--hairline) solid var(--accent-cyan-border);
  border-radius: 7px;
}

.terminal-title code {
  overflow: hidden;
  color: var(--text-faint);
  font: 500 12px/1 var(--font-terminal);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vm-status {
  flex: 0 0 auto;
  gap: 7px;
  padding: 5px 8px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
  background: var(--surface-2);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 7px;
}

.status-dot {
  width: 6px;
  height: 6px;
  background: var(--accent-green);
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--accent-green-soft);
  animation: status-pulse 2.8s ease-in-out infinite;
}

.terminal-surface {
  flex: 1;
  min-height: 0;
  padding: 0;
  background: #090d0f;
}

.workspace-swap-enter-active,
.workspace-swap-leave-active {
  transition: opacity var(--duration-normal) ease, transform var(--duration-slow) var(--ease-out);
}

.workspace-swap-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.workspace-swap-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity var(--duration-normal) ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

@keyframes status-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.72;
    transform: scale(0.82);
  }
}

@media (max-width: 900px) {
  .workspace {
    grid-template-columns: 1fr;
    grid-template-rows: 64px minmax(300px, 42vh) max-content;
    align-content: start;
    gap: var(--space-2);
    padding: 0 calc(var(--space-2) + var(--safe-right)) max(var(--space-2), var(--safe-bottom)) calc(var(--space-2) + var(--safe-left));
    overflow-y: auto;
  }

  .terminal-pane {
    border: var(--hairline) solid #2a342e;
  }

  .font-size-control [data-tooltip]::before {
    display: none;
  }

  .panel-resizer {
    display: none;
  }

  .workspace:not(.short-landscape-split) :deep(.mission-panel),
  .workspace:not(.short-landscape-split) :deep(.panel-scroll) {
    height: auto;
    overflow: visible;
  }
}

@media (max-width: 900px) and (max-height: 600px) and (orientation: landscape) {
  .workspace.short-landscape-split {
    grid-template-columns: 56px minmax(0, 1fr) 24px var(--mission-panel-width);
    grid-template-rows: minmax(0, 1fr);
    gap: 6px;
    padding: 0 calc(8px + var(--safe-right)) max(8px, var(--safe-bottom)) calc(8px + var(--safe-left));
    overflow: hidden;
  }

  .terminal-pane {
    border: var(--hairline) solid #2a342e;
  }

  .workspace.short-landscape-split .panel-resizer {
    min-width: 24px;
    display: grid;
  }

  .terminal-header {
    height: 48px;
    min-height: 48px;
    gap: 6px;
    padding-inline: 10px;
  }

  .terminal-title {
    flex: 0 0 auto;
    gap: 0;
  }

  .terminal-title > span,
  .terminal-title code,
  .vm-status span:last-child {
    display: none;
  }

  .terminal-actions {
    gap: 4px;
  }

  .vm-status {
    gap: 5px;
    padding-inline: 6px;
  }

  .terminal-title > svg {
    width: 26px;
    height: 26px;
    padding: 5px;
  }

  .terminal-surface {
    padding: 6px;
  }
  .workspace:not(.short-landscape-split) {
    grid-template-rows: 52px minmax(220px, 68dvh) max-content;
    overflow-y: auto;
  }
}

@media (min-width: 901px) and (max-height: 680px) {
  .terminal-header {
    height: 48px;
    min-height: 48px;
  }

  .terminal-surface {
    padding: 8px;
  }
}

@media (max-width: 560px) and (min-height: 601px) {
  .workspace {
    grid-template-rows: 64px minmax(260px, 38vh) max-content;
  }

  .terminal-header {
    padding-inline: 12px;
  }

  .terminal-surface {
    padding: 8px;
  }

}

@media (max-width: 560px) {
  .terminal-title {
    gap: 7px;
    white-space: nowrap;
  }

  .terminal-title code,
  .vm-status span:last-child {
    display: none;
  }

  .vm-status {
    padding-inline: 7px;
  }
}
</style>
