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
  'button:not([disabled]), [tabindex]:not([tabindex="-1"])'

function selectMode(mode: LabMode): void {
  emit('select-mode', mode)
  tutorialStep.value = 0
  void nextTick(() => primaryRef.value?.focus())
}

function nextStep(): void {
  if (tutorialStep.value === 1 && !demoRun.value) return
  tutorialStep.value = Math.min(tutorialStep.value + 1, 3)
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
  if (focusable.length === 0) return
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
  <div class="onboarding-layer">
    <div v-if="tutorialStep >= 0 && tutorialStep <= 1" class="terminal-highlight" aria-hidden="true">
      <span>观察左侧真实终端</span>
    </div>
    <section
      ref="dialogRef"
      class="onboarding-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      tabindex="-1"
    >
      <template v-if="tutorialStep < 0">
        <span class="eyebrow">开始前先选择帮助密度</span>
        <h2 id="onboarding-title">你希望怎样完成新手村？</h2>
        <p>两种模式使用相同目标、环境和判题；关键操作都需要你填写、判断或手动输入。</p>
        <p v-if="progressResetNotice" class="migration-notice" role="status">
          教学路径已升级，旧版步骤进度已重置，其他浏览器数据不受影响。
        </p>
        <div class="mode-grid">
          <button
            ref="primaryRef"
            type="button"
            class="mode-card mode-card-recommended"
            @click="selectMode('guided')"
          >
            <span class="recommended-badge">推荐零基础新生</span>
            <strong>引导模式</strong>
            <span>先讲当前所需知识，观察示例后逐步过渡到补全和独立输入。</span>
          </button>
          <button type="button" class="mode-card" @click="selectMode('challenge')">
            <strong>挑战模式</strong>
            <span>共享同一任务步骤，默认隐藏命令结构，需要时逐层展开提示。</span>
          </button>
        </div>
      </template>

      <template v-else>
        <header class="tutorial-header">
          <div>
            <span class="eyebrow">开始前操作教学</span>
            <h2 id="onboarding-title">
              {{
                tutorialStep === 0
                  ? '提示符后面才是输入区'
                  : tutorialStep === 1
                    ? '命令、选项和参数靠空格分开'
                    : tutorialStep === 2
                      ? '占位符必须换成真实值'
                      : '观察输出，按需提示，随时重置'
              }}
            </h2>
          </div>
          <span class="step-count">{{ tutorialStep + 1 }} / 4</span>
        </header>

        <div v-if="tutorialStep === 0" class="tutorial-body">
          <div class="prompt-demo">
            <span class="prompt">guest@hashteam:~$</span><span class="cursor">▌</span>
          </div>
          <p><strong>$ 和它前面的文字是提示符，不用输入。</strong>命令从闪烁光标处开始。</p>
          <ul class="key-grid">
            <li><kbd>Enter</kbd><span>提交并执行</span></li>
            <li><kbd>Backspace</kbd><span>删除输错字符</span></li>
            <li><kbd>↑ / ↓</kbd><span>找回历史命令</span></li>
            <li><kbd>鼠标拖选</kbd><span>选择并复制输出</span></li>
          </ul>
        </div>

        <div v-else-if="tutorialStep === 1" class="tutorial-body">
          <div class="anatomy-demo" aria-label="命令结构示例">
            <span class="command-part">echo<small>命令</small></span>
            <span class="space-part">空格</span>
            <span class="argument-part">"hello, HASHTEAM"<small>参数（引号包住含空格文字）</small></span>
          </div>
          <p>选项通常以 <code>-</code> 开头，用来改变命令工作方式；文件名、数字等通常是参数。它们之间缺少空格会被当成另一段文字。</p>
          <button type="button" class="demo-command" @click="runDemo">
            在左侧终端运行示例
          </button>
          <p class="observation">运行后看左侧下一行：命令是输入，系统回应才是输出。观察后才能继续。</p>
        </div>

        <div v-else-if="tutorialStep === 2" class="tutorial-body">
          <div class="placeholder-demo">
            <code>check &lt;通行证&gt;</code>
            <span>结构提示</span>
            <strong>↓ 替换，而不是照抄 ↓</strong>
            <code>check 你实际发现的值</code>
          </div>
          <p>尖括号表示“这里要换成终端里发现的真实内容”，尖括号本身不能输入。复制输出时只选需要的值，不要带上提示符、标签或多余空格。</p>
        </div>

        <div v-else class="tutorial-body">
          <ul class="support-list">
            <li><strong>分层提示</strong><span>先给观察方向，再给工具，最后给仍需填写的结构。</span></li>
            <li><strong>help</strong><span>在终端查看命令用途、格式、例子和常见错误。</span></li>
            <li><strong>重置本关</strong><span>恢复当前实验环境；不会改变你选择的模式。</span></li>
            <li><strong>完成证据</strong><span>关键步骤必须运行、填写、判断或确认，不能只点“下一步”。</span></li>
          </ul>
          <p>准备好了：看懂任务 → 学最小知识 → 运行并观察 → 自己补全 → 根据反馈修正。</p>
        </div>

        <footer class="tutorial-footer">
          <button type="button" class="btn-skip" @click="complete">跳过剩余教学</button>
          <button
            v-if="tutorialStep < 3"
            ref="primaryRef"
            type="button"
            class="btn-primary"
            :disabled="tutorialStep === 1 && !demoRun"
            @click="nextStep"
          >
            下一步
          </button>
          <button v-else ref="primaryRef" type="button" class="btn-primary" @click="complete">
            开始第一关
          </button>
        </footer>
      </template>
    </section>
  </div>
</template>

<style scoped>
.onboarding-layer {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 20px;
  pointer-events: none;
  background: rgba(5, 9, 18, 0.12);
  box-sizing: border-box;
}

.terminal-highlight {
  position: absolute;
  inset: 68px 500px 20px 20px;
  border: 2px solid rgba(56, 189, 248, 0.65);
  border-radius: 12px;
  box-shadow: inset 0 0 30px rgba(56, 189, 248, 0.08);
}

.terminal-highlight span {
  position: absolute;
  top: 10px;
  right: 12px;
  padding: 4px 8px;
  color: #06121f;
  font-size: 10px;
  font-weight: 800;
  background: #7dd3fc;
  border-radius: 999px;
}

.onboarding-card {
  width: min(460px, 100%);
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  padding: 25px;
  pointer-events: auto;
  color: #c7d3e8;
  background: rgba(15, 24, 48, 0.98);
  border: 1px solid #2b4268;
  border-radius: 15px;
  box-shadow: 0 20px 65px rgba(0, 0, 0, 0.5);
  box-sizing: border-box;
}

.eyebrow {
  display: block;
  margin-bottom: 7px;
  color: #38bdf8;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  color: #eef3fc;
  font-size: 22px;
  line-height: 1.3;
}

.onboarding-card > p,
.tutorial-body > p {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.7;
}

.migration-notice {
  padding: 9px 10px;
  color: #ffd580;
  background: rgba(255, 213, 128, 0.08);
  border: 1px solid rgba(255, 213, 128, 0.25);
  border-radius: 7px;
}

.mode-grid {
  display: grid;
  gap: 11px;
  margin-top: 20px;
}

.mode-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 7px;
  padding: 16px;
  color: #c7d3e8;
  text-align: left;
  background: #111c33;
  border: 1px solid #2a3a5c;
  border-radius: 10px;
  cursor: pointer;
}

.mode-card:hover,
.mode-card-recommended {
  border-color: rgba(56, 189, 248, 0.65);
}

.mode-card strong {
  color: #eef3fc;
  font-size: 16px;
}

.mode-card span:last-child {
  font-size: 12px;
  line-height: 1.55;
}

.recommended-badge {
  color: #7dd3fc;
  font-size: 10px;
  font-weight: 800;
}

.tutorial-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.step-count {
  flex: 0 0 auto;
  padding: 4px 8px;
  color: #7dd3fc;
  font-size: 11px;
  background: rgba(56, 189, 248, 0.1);
  border-radius: 999px;
}

.tutorial-body {
  min-height: 300px;
  padding: 22px 0;
}

.prompt-demo,
.anatomy-demo,
.placeholder-demo {
  padding: 16px;
  background: #0b1220;
  border: 1px solid #2a3a5c;
  border-radius: 9px;
}

.prompt-demo {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 15px;
}

.prompt {
  color: #7fdba7;
}

.cursor {
  color: #eef3fc;
}

.key-grid,
.support-list {
  display: grid;
  gap: 9px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}

.key-grid {
  grid-template-columns: 1fr 1fr;
}

.key-grid li,
.support-list li {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px;
  font-size: 11px;
  background: #111c33;
  border-radius: 7px;
}

kbd {
  align-self: flex-start;
  padding: 3px 6px;
  color: #eef3fc;
  font-family: inherit;
  background: #1c2a44;
  border: 1px solid #314263;
  border-radius: 4px;
}

.anatomy-demo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-family: 'JetBrains Mono', Consolas, monospace;
}

.anatomy-demo span {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.anatomy-demo small {
  font-family: system-ui, sans-serif;
  font-size: 9px;
}

.command-part {
  color: #7fdba7;
}

.space-part {
  padding: 3px 5px;
  color: #06121f;
  font-family: system-ui, sans-serif;
  font-size: 9px;
  background: #ffd580;
  border-radius: 3px;
}

.argument-part {
  color: #7dd3fc;
}

.demo-command {
  width: 100%;
  margin-top: 16px;
  padding: 11px;
  color: #a8e6c0;
  font-weight: 700;
  background: #10251f;
  border: 1px solid #2b7553;
  border-radius: 7px;
  cursor: pointer;
}

.observation {
  color: #93a5c6;
}

.placeholder-demo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
}

.placeholder-demo code {
  width: 100%;
  padding: 8px;
  color: #ffd580;
  text-align: center;
  background: #111c33;
  border-radius: 5px;
  box-sizing: border-box;
}

.placeholder-demo span,
.placeholder-demo strong {
  font-size: 10px;
}

.support-list strong {
  color: #7dd3fc;
}

.tutorial-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 15px;
  border-top: 1px solid #1c2a44;
}

.btn-skip,
.btn-primary {
  padding: 8px 13px;
  font-size: 12px;
  border-radius: 7px;
  cursor: pointer;
}

.btn-skip {
  color: #93a5c6;
  background: transparent;
  border: 1px solid transparent;
}

.btn-primary {
  min-width: 100px;
  color: #06121f;
  font-weight: 800;
  background: #38bdf8;
  border: none;
}

.btn-primary:disabled {
  color: #66779a;
  background: #22314f;
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .terminal-highlight {
    display: none;
  }

  .onboarding-layer {
    justify-content: center;
    background: rgba(5, 9, 18, 0.45);
  }
}

@media (max-width: 520px) {
  .onboarding-card {
    padding: 20px;
  }

  .key-grid {
    grid-template-columns: 1fr;
  }
}
</style>
