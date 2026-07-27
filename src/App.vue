<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import TopBar from './components/TopBar.vue'
import LabTerminal from './components/LabTerminal.vue'
import MissionPanel from './components/MissionPanel.vue'
import LoadingScreen from './components/LoadingScreen.vue'
import CompletionPage from './components/CompletionPage.vue'
import AboutModal from './components/AboutModal.vue'
import { useVirtualMachine } from './composables/useVirtualMachine'
import { useLabProgress } from './composables/useLabProgress'
import { getLevel, TOTAL_LEVELS } from './data/levels'

const vm = useVirtualMachine()
const progress = useLabProgress()

const terminalRef = ref<InstanceType<typeof LabTerminal> | null>(null)
const showAbout = ref(false)

const currentLevelDef = computed(() => getLevel(progress.state.currentLevel) ?? getLevel(1)!)
const currentCompleted = computed(() => progress.state.completedLevels.includes(progress.state.currentLevel))
const currentHintsUsed = computed(() => progress.hintsUsedFor(progress.state.currentLevel))
const isLastLevel = computed(() => progress.state.currentLevel >= TOTAL_LEVELS)

let unsubscribeDisplay: (() => void) | null = null

onMounted(() => {
  // 显示文本 → 终端；终端输入 → 虚拟机串口
  unsubscribeDisplay = vm.onDisplay((data) => {
    terminalRef.value?.write(data)
  })
  void vm.boot()
})

onBeforeUnmount(() => {
  unsubscribeDisplay?.()
  unsubscribeDisplay = null
})

function handleTerminalInput(data: string): void {
  vm.sendSerial(data)
}

function handleRunCommand(command: string): void {
  vm.sendSerial(`${command}\n`)
  terminalRef.value?.focus()
}

function handleNextLevel(): void {
  vm.gotoLevel(progress.state.currentLevel + 1)
}

async function handleResetAll(): Promise<void> {
  await vm.resetAll()
}
</script>

<template>
  <div class="app-shell">
    <TopBar
      :completed-count="progress.state.completedLevels.length"
      :total="TOTAL_LEVELS"
      @reset-level="vm.resetCurrentLevel"
      @reset-all="handleResetAll"
      @about="showAbout = true"
    />

    <main v-if="!progress.allCompleted.value" class="layout">
      <section class="terminal-pane">
        <LabTerminal ref="terminalRef" @input="handleTerminalInput" />
      </section>
      <MissionPanel
        :level="currentLevelDef"
        :completed="currentCompleted"
        :hints-used="currentHintsUsed"
        :is-last="isLastLevel"
        @next="handleNextLevel"
        @use-hint="progress.useHint"
        @run-command="handleRunCommand"
      />
    </main>
    <CompletionPage v-else @restart="handleResetAll" />

    <LoadingScreen
      v-if="vm.stage.value !== 'ready'"
      :stage="vm.stage.value"
      :error-message="vm.errorMessage.value"
      @retry="vm.boot"
    />
    <AboutModal v-if="showAbout" @close="showAbout = false" />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
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
  border-right: 1px solid #1c2a44;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(320px, 45vh) 1fr;
  }

  .terminal-pane {
    border-right: none;
    border-bottom: 1px solid #1c2a44;
  }
}
</style>
