<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import TopBar from './components/TopBar.vue'
import LabTerminal from './components/LabTerminal.vue'
import MissionPanel from './components/MissionPanel.vue'
import LoadingScreen from './components/LoadingScreen.vue'
import CompletionPage from './components/CompletionPage.vue'
import AboutModal from './components/AboutModal.vue'
import OnboardingDialog from './components/OnboardingDialog.vue'
import { useVirtualMachine } from './composables/useVirtualMachine'
import { useLabProgress } from './composables/useLabProgress'
import { useLabPreferences } from './composables/useLabPreferences'
import { getLevel, TOTAL_LEVELS } from './data/levels'

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

const currentLevelDef = computed(() => getLevel(progress.state.currentLevel) ?? getLevel(1)!)
const currentCompleted = computed(() => progress.state.completedLevels.includes(progress.state.currentLevel))
const currentHintsUsed = computed(() => progress.hintsUsedFor(progress.state.currentLevel))
const isLastLevel = computed(() => progress.state.currentLevel >= TOTAL_LEVELS)
const currentMode = computed(() => preferences.state.mode ?? 'guided')
const currentGuideStep = computed(() =>
  progress.guideStepFor(
    progress.state.currentLevel,
    currentLevelDef.value.steps.length,
  ),
)
const currentCompletedSteps = computed(() =>
  progress.completedStepsFor(progress.state.currentLevel),
)

let unsubscribeDisplay: (() => void) | null = null

onMounted(() => {
  if (!showCompletion.value) {
    // 显示文本 → 终端；终端输入 → 虚拟机串口
    unsubscribeDisplay = vm.onDisplay((data) => {
      terminalRef.value?.write(data)
    })
    void vm.boot()
  }
})

onBeforeUnmount(() => {
  unsubscribeDisplay?.()
  unsubscribeDisplay = null
  void vm.dispose()
})

function handleTerminalInput(data: string): void {
  vm.sendSerial(data)
}

function handleRunCommand(command: string): void {
  // runCommand 会先清空终端未提交的输入，避免与已有内容拼接
  vm.runCommand(command)
  terminalRef.value?.focus()
}

function handleRunDemo(): void {
  handleRunCommand('echo "hello, HASHTEAM"')
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

function handleResetLevel(): void {
  progress.resetGuide(progress.state.currentLevel)
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
  terminalRef.value?.focus()
}

function openAbout(): void {
  showOnboarding.value = false
  showAbout.value = true
}

function openHelp(): void {
  showAbout.value = false
  showOnboarding.value = true
}
</script>

<template>
  <div class="app-shell">
    <TopBar
      v-if="!showCompletion"
      :completed-count="progress.state.completedLevels.length"
      :total="TOTAL_LEVELS"
      :mode="currentMode"
      @reset-level="handleResetLevel"
      @reset-all="handleResetAll"
      @about="openAbout"
      @help="openHelp"
      @change-mode="preferences.setMode"
    />

    <main v-if="!showCompletion" class="layout">
      <section class="terminal-pane">
        <LabTerminal ref="terminalRef" @input="handleTerminalInput" />
      </section>
      <MissionPanel
        :level="currentLevelDef"
        :completed="currentCompleted"
        :hints-used="currentHintsUsed"
        :is-last="isLastLevel"
        :mode="currentMode"
        :guide-step="currentGuideStep"
        :completed-steps="currentCompletedSteps"
        @next="handleNextLevel"
        @use-hint="progress.useHint"
        @run-command="handleRunCommand"
        @advance-guide="progress.advanceGuide"
        @complete-step="progress.completeStep"
        @change-mode="preferences.setMode"
      />
    </main>
    <CompletionPage v-else @restart="handleResetAll" />

    <LoadingScreen
      v-if="!showCompletion && vm.stage.value !== 'ready'"
      :stage="vm.stage.value"
      :error-message="vm.errorMessage.value"
      @retry="vm.boot"
    />
    <AboutModal v-if="showAbout" @close="showAbout = false" />
    <OnboardingDialog
      v-if="!showCompletion && vm.stage.value === 'ready' && showOnboarding"
      :mode="preferences.state.mode"
      :progress-reset-notice="progress.progressResetNotice.value"
      @select-mode="preferences.setMode"
      @run-demo="handleRunDemo"
      @complete="handleCompleteOnboarding"
    />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  background: #0a101f;
  color: #d6deeb;
}

.layout {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  min-height: 0;
}

.terminal-pane {
  min-width: 0;
  min-height: 0;
  /* xterm 在跨断点缩放后可能仍按旧高度渲染，裁剪掉未重排前溢出的内容 */
  overflow: hidden;
  border-right: 1px solid #1c2a44;
}

@media (max-width: 900px) {
  .app-shell {
    /* 横屏手机、浏览器高倍缩放时，顶部工具栏可能占去大半视口。
       让应用自身可滚动，避免固定 100dvh 把任务面板压成 0 高度。 */
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }

  .layout {
    flex: 0 0 auto;
    min-height: calc(100dvh - 56px);
    grid-template-columns: 1fr;
    grid-template-rows:
      clamp(180px, 45vh, 320px)
      minmax(320px, 1fr);
  }

  .terminal-pane {
    border-right: none;
    border-bottom: 1px solid #1c2a44;
  }
}
</style>
