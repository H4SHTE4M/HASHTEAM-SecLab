<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { LabMode } from '../types/lab'

const props = defineProps<{
  mode: LabMode | null
  progressResetNotice: boolean
}>()

const emit = defineEmits<{
  (e: 'select-mode', mode: LabMode): void
  (e: 'run-demo'): void
  (e: 'complete'): void
}>()

const dialogRef = ref<HTMLElement | null>(null)
const primaryRef = ref<HTMLButtonElement | null>(null)
const tutorialStep = ref(props.mode === null ? -1 : 0)
const demoRun = ref(false)
let previouslyFocused: HTMLElement | null = null

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function selectMode(mode: LabMode): void {
  emit('select-mode', mode)
  tutorialStep.value = 0
  void nextTick(() => primaryRef.value?.focus())
}

function nextStep(): void {
  if (tutorialStep.value === 1 && !demoRun.value) return
  tutorialStep.value = Math.min(tutorialStep.value + 1, 2)
  void nextTick(() => primaryRef.value?.focus())
}

function runDemo(): void {
  demoRun.value = true
  emit('run-demo')
}

function complete(): void {
  if (tutorialStep.value < 0) return
  emit('complete')
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (tutorialStep.value >= 0) {
      event.preventDefault()
      complete()
    }
    return
  }
  if (event.key !== 'Tab' || dialogRef.value === null) return

  const focusable = Array.from(dialogRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  if (focusable.length === 0) {
    event.preventDefault()
    dialogRef.value.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.addEventListener('keydown', handleKeydown)
  void nextTick(() => primaryRef.value?.focus())
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  previouslyFocused?.focus()
})
</script>

<template>
  <div class="onboarding-mask" @click.self="complete">
    <section
      ref="dialogRef"
      class="onboarding-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      tabindex="-1"
    >
      <template v-if="tutorialStep < 0">
        <div class="intro-copy">
          <span class="eyebrow">开始前只选一件事</span>
          <h2 id="onboarding-title">你希望怎样完成新手村？</h2>
          <p>两种模式使用相同的 Linux 环境和判题规则，之后也可以随时切换。</p>
          <p v-if="progressResetNotice" class="migration-notice" role="status">
            关卡结构已更新，旧版进度已重置。你的实验环境和浏览器数据没有受到其他影响。
          </p>
        </div>
        <div class="mode-grid">
          <button
            ref="primaryRef"
            type="button"
            class="mode-card mode-card-recommended"
            @click="selectMode('guided')"
          >
            <span class="recommended-badge">推荐零基础新生</span>
            <strong>引导模式</strong>
            <span>每次只出现一个动作，完整命令可以点击运行。</span>
          </button>
          <button type="button" class="mode-card" @click="selectMode('challenge')">
            <strong>挑战模式</strong>
            <span>先看目标自己探索，需要时再展开提示或切回引导。</span>
          </button>
        </div>
      </template>

      <template v-else>
        <header class="tutorial-header">
          <div>
            <span class="eyebrow">60 秒操作教学</span>
            <h2 id="onboarding-title">
              {{
                tutorialStep === 0
                  ? '左边操作，右边看任务'
                  : tutorialStep === 1
                    ? '先让终端回应你'
                    : '记住四个基本操作'
              }}
            </h2>
          </div>
          <span class="step-count">{{ tutorialStep + 1 }} / 3</span>
        </header>

        <div v-if="tutorialStep === 0" class="tutorial-body">
          <div class="layout-demo" aria-hidden="true">
            <div class="layout-terminal"><span>终端</span>输入命令、查看结果</div>
            <div class="layout-mission"><span>任务</span>看当前一步和提示</div>
          </div>
          <p>终端里可以放心尝试。输错不会损坏你的电脑，“重置本关”随时能恢复实验环境。</p>
        </div>

        <div v-else-if="tutorialStep === 1" class="tutorial-body">
          <p>点击下面的命令，它会被送进左侧真实 Linux 终端。运行后先观察终端输出，再继续。</p>
          <button type="button" class="demo-command" @click="runDemo">
            echo "hello, HASHTEAM"
          </button>
          <p class="observation">点击命令不会自动替你完成关卡；重要的是看见命令和结果之间的关系。</p>
        </div>

        <div v-else class="tutorial-body">
          <ul class="key-list">
            <li><kbd>Enter</kbd><span>执行刚输入的命令</span></li>
            <li><kbd>Backspace</kbd><span>删掉输错的字符</span></li>
            <li><kbd>↑</kbd><span>找回上一条命令</span></li>
            <li><strong>提示 / 重置本关</strong><span>卡住时求助或重新尝试</span></li>
          </ul>
          <p>准备好了。进入第一关后，你会在一分钟内得到第一条 Linux 命令的回应。</p>
        </div>

        <footer class="tutorial-footer">
          <button type="button" class="btn-skip" @click="complete">跳过教学</button>
          <button
            v-if="tutorialStep < 2"
            ref="primaryRef"
            type="button"
            class="btn-primary"
            :disabled="tutorialStep === 1 && !demoRun"
            @click="nextStep"
          >
            下一步
          </button>
          <button
            v-else
            ref="primaryRef"
            type="button"
            class="btn-primary"
            @click="complete"
          >
            开始第一关
          </button>
        </footer>
      </template>
    </section>
  </div>
</template>

<style scoped>
.onboarding-mask {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(5, 9, 18, 0.82);
  box-sizing: border-box;
}

.onboarding-card {
  width: min(680px, 100%);
  max-height: min(680px, 92vh);
  overflow-y: auto;
  padding: 28px;
  color: #c7d3e8;
  background: #0f1830;
  border: 1px solid #2b4268;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  box-sizing: border-box;
}

.eyebrow {
  display: block;
  margin-bottom: 8px;
  color: #38bdf8;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  color: #eef3fc;
  font-size: 24px;
}

.intro-copy > p,
.tutorial-body > p {
  margin: 12px 0 0;
  font-size: 14px;
  line-height: 1.75;
}

.migration-notice {
  padding: 10px 12px;
  color: #ffd580;
  background: rgba(255, 213, 128, 0.08);
  border: 1px solid rgba(255, 213, 128, 0.25);
  border-radius: 8px;
}

.mode-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 24px;
}

.mode-card {
  min-height: 170px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 20px;
  color: #c7d3e8;
  text-align: left;
  background: #111c33;
  border: 1px solid #2a3a5c;
  border-radius: 12px;
  cursor: pointer;
}

.mode-card:hover {
  background: #16244a;
  border-color: #38bdf8;
}

.mode-card-recommended {
  border-color: rgba(56, 189, 248, 0.65);
}

.mode-card strong {
  color: #eef3fc;
  font-size: 18px;
}

.mode-card span:last-child {
  font-size: 14px;
  line-height: 1.65;
}

.recommended-badge {
  color: #7dd3fc;
  font-size: 11px;
  font-weight: 700;
}

.tutorial-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.step-count {
  flex-shrink: 0;
  padding: 4px 10px;
  color: #7dd3fc;
  font-size: 12px;
  background: rgba(56, 189, 248, 0.1);
  border-radius: 999px;
}

.tutorial-body {
  min-height: 250px;
  padding: 24px 0;
}

.layout-demo {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 190px;
  min-height: 150px;
  overflow: hidden;
  border: 1px solid #2a3a5c;
  border-radius: 10px;
}

.layout-terminal,
.layout-mission {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 7px;
  padding: 18px;
  font-size: 13px;
}

.layout-terminal {
  background: #0b1220;
}

.layout-mission {
  background: #16213a;
  border-left: 1px solid #2a3a5c;
}

.layout-demo span {
  color: #7dd3fc;
  font-size: 16px;
  font-weight: 700;
}

.demo-command {
  width: 100%;
  margin-top: 22px;
  padding: 14px 16px;
  color: #a8e6c0;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 14px;
  text-align: left;
  background: #0b1220;
  border: 1px solid #2b7553;
  border-radius: 8px;
  cursor: pointer;
}

.demo-command:hover {
  background: #10251f;
}

.observation {
  color: #93a5c6;
}

.key-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.key-list li {
  display: grid;
  grid-template-columns: 130px 1fr;
  align-items: center;
  gap: 14px;
}

kbd,
.key-list strong {
  min-width: 44px;
  justify-self: start;
  padding: 6px 9px;
  color: #eef3fc;
  font-family: inherit;
  font-size: 13px;
  background: #111c33;
  border: 1px solid #2a3a5c;
  border-radius: 6px;
}

.tutorial-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 18px;
  border-top: 1px solid #1c2a44;
}

.btn-skip,
.btn-primary {
  padding: 9px 16px;
  font-size: 14px;
  border-radius: 8px;
  cursor: pointer;
}

.btn-skip {
  color: #93a5c6;
  background: transparent;
  border: 1px solid transparent;
}

.btn-primary {
  min-width: 120px;
  color: #06121f;
  font-weight: 700;
  background: #38bdf8;
  border: none;
}

.btn-primary:hover {
  background: #5ccbf9;
}

.btn-primary:disabled {
  color: #66779a;
  background: #22314f;
  cursor: not-allowed;
}

@media (max-width: 620px) {
  .onboarding-card {
    padding: 20px;
  }

  .mode-grid {
    grid-template-columns: 1fr;
  }

  .mode-card {
    min-height: 130px;
  }

  .layout-demo {
    grid-template-columns: 1fr;
  }

  .layout-mission {
    border-top: 1px solid #2a3a5c;
    border-left: none;
  }

  .key-list li {
    grid-template-columns: 110px 1fr;
  }
}
</style>
