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
const highlightStyle = ref<Record<string, string>>({})
let previouslyFocused: HTMLElement | null = null

// 高亮框跟随 .terminal-pane 的实际位置：顶栏换行、布局跨断点时写死的 inset 会错位
function updateHighlight(): void {
  const pane = document.querySelector('.terminal-pane')
  if (pane === null) return
  const rect = pane.getBoundingClientRect()
  highlightStyle.value = {
    top: `${rect.top + 10}px`,
    left: `${rect.left + 10}px`,
    width: `${Math.max(rect.width - 20, 0)}px`,
    height: `${Math.max(rect.height - 20, 0)}px`,
  }
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [tabindex]:not([tabindex="-1"])'

function selectMode(mode: LabMode): void {
  emit('select-mode', mode)
  tutorialStep.value = 0
  void nextTick(() => primaryRef.value?.focus())
}

function nextStep(): void {
  if (tutorialStep.value === 2 && !demoRun.value) return
  tutorialStep.value = Math.min(tutorialStep.value + 1, 4)
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
  updateHighlight()
  window.addEventListener('resize', updateHighlight)
  void nextTick(() => primaryRef.value?.focus())
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', updateHighlight)
  previouslyFocused?.focus()
})
</script>

<template>
  <!-- 需要观察终端的教学步骤（1-2）降低遮罩透明度，其余步骤压暗背景聚焦弹窗 -->
  <div class="onboarding-layer" :class="{ 'focus-terminal': tutorialStep >= 1 && tutorialStep <= 2 }">
    <div
      v-if="tutorialStep >= 1 && tutorialStep <= 2"
      class="terminal-highlight"
      :style="highlightStyle"
      aria-hidden="true"
    >
      <span>观察旁边的真实终端</span>
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
        <span class="eyebrow">开始前</span>
        <h2 id="onboarding-title">你希望怎样完成新手村？</h2>
        <p>两种模式使用相同环境和通关判定，可以随时无损切换。</p>
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
            <span>逐步讲解必要知识，完成观察、补全和判断后再进行最终验证。</span>
          </button>
          <button type="button" class="mode-card" @click="selectMode('challenge')">
            <strong>挑战模式</strong>
            <span>只看任务目标，在真实终端自由探索；需要时再逐层展开提示。</span>
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
                  ? '这个黑色窗口叫终端'
                  : tutorialStep === 1
                    ? '提示符后面才是输入区'
                    : tutorialStep === 2
                      ? '命令、选项和参数靠空格分开'
                      : tutorialStep === 3
                        ? '占位符必须换成真实值'
                        : '观察输出，按需提示，随时重置'
              }}
            </h2>
          </div>
          <span class="step-count">{{ tutorialStep + 1 }} / 5</span>
        </header>

        <div v-if="tutorialStep === 0" class="tutorial-body">
          <div class="prompt-demo">
            <span class="prompt">guest@hashteam:~$</span><span class="cursor">▌</span>
          </div>
          <p>
            在这个窗口里不用鼠标点图标，而是打一句简短的话——叫<strong>命令</strong>——电脑用文字回答你。
            命令不是你随便编的词，它是电脑里现成<strong>工具的名字</strong>（比如 ls 是「列出文件夹内容」那个工具的名字）；
            拼错它会回答 not found（没有叫这个名字的工具）。
          </p>
          <p>
            命令后面可以带<strong>参数</strong>（对谁做，比如一个文件名）和<strong>选项</strong>（工具的开关，
            相当于 Windows 里勾选「显示隐藏的文件」）。读取你输入、替你执行命令的程序叫
            <strong>Shell</strong>；<code>$</code> 就是它「我准备好了」的信号。
          </p>
          <ul class="key-grid">
            <li><kbd>ls</kbd><span>≈ 打开文件夹看看</span></li>
            <li><kbd>pwd</kbd><span>≈ 看地址栏</span></li>
            <li><kbd>cat</kbd><span>≈ 双击打开文件</span></li>
            <li><kbd>目录</kbd><span>就是「文件夹」</span></li>
          </ul>
        </div>

        <div v-else-if="tutorialStep === 1" class="tutorial-body">
          <div class="prompt-demo">
            <span class="prompt">guest@hashteam:~$</span><span class="cursor">▌</span>
          </div>
          <p><strong>$ 和它前面的文字是提示符，不用输入。</strong>命令从闪烁光标处开始。</p>
          <ul class="key-grid">
            <li><kbd>Enter</kbd><span>提交并执行</span></li>
            <li><kbd>Backspace</kbd><span>删除输错字符</span></li>
            <li><kbd>↑ / ↓</kbd><span>找回历史命令</span></li>
            <li><kbd>鼠标拖选</kbd><span>选择并复制输出</span></li>
            <li><kbd>Ctrl+C</kbd><span>中断卡住的程序；选中文字时是复制</span></li>
            <li><kbd>Ctrl+V</kbd><span>粘贴复制的值到输入框或终端</span></li>
          </ul>
        </div>

        <div v-else-if="tutorialStep === 2" class="tutorial-body">
          <div class="anatomy-demo" aria-label="命令结构示例">
            <span class="command-part">echo<small>命令</small></span>
            <span class="space-part">空格</span>
            <span class="argument-part">"hello, HASHTEAM"<small>参数（引号包住含空格文字）</small></span>
          </div>
          <p>选项通常以 <code>-</code> 开头，用来改变命令工作方式；文件名、数字等通常是参数。它们之间缺少空格会被当成另一段文字。</p>
          <button type="button" class="demo-command" @click="runDemo">
            在旁边的终端运行示例
          </button>
          <p class="observation">运行后看终端的下一行：命令是输入，系统回应才是输出。观察后才能继续。</p>
        </div>

        <div v-else-if="tutorialStep === 3" class="tutorial-body">
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
            <li><strong>模式规则</strong><span>引导模式完成教学步骤；挑战模式只看最终环境结果。</span></li>
          </ul>
          <p>准备好了：看懂任务 → 学最小知识 → 运行并观察 → 自己补全 → 根据反馈修正。</p>
        </div>

        <footer class="tutorial-footer">
          <button type="button" class="btn-skip" @click="complete">跳过剩余教学</button>
          <button
            v-if="tutorialStep < 4"
            ref="primaryRef"
            type="button"
            class="btn-primary"
            :disabled="tutorialStep === 2 && !demoRun"
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
  height: 100vh;
  height: 100dvh;
  padding: calc(20px + var(--safe-top)) calc(20px + var(--safe-right)) calc(20px + var(--safe-bottom)) calc(20px + var(--safe-left));
  background: var(--overlay-backdrop);
  box-sizing: border-box;
  transition: background-color 0.3s ease;
}

/* 教学步骤 1-2 需要阅读终端内容，遮罩调亮 */
.onboarding-layer.focus-terminal {
  background: var(--overlay-backdrop-soft);
}

.terminal-highlight {
  position: absolute;
  /* 位置由内联样式按 .terminal-pane 实际矩形给出，适配顶栏换行与布局断点 */
  border: 2px solid var(--accent-cyan);
  border-radius: 12px;
  box-shadow: inset 0 0 30px var(--accent-cyan-soft);
  /* 装饰性元素：不拦截点击，允许与卡片交叠时直接点到卡片 */
  pointer-events: none;
}

.terminal-highlight span {
  position: absolute;
  top: 10px;
  right: 12px;
  padding: 4px 8px;
  color: var(--accent-cyan-contrast);
  font-size: 10px;
  font-weight: 800;
  background: var(--accent-cyan);
  border-radius: 999px;
}

.onboarding-card {
  /* 高亮框（absolute）会压静态元素，卡片需要显式建立层级盖过它 */
  position: relative;
  z-index: 1;
  width: min(460px, 100%);
  max-height: 100%;
  overflow-y: auto;
  padding: 25px;
  color: var(--text-secondary);
  background: var(--surface-1);
  border: var(--hairline) solid var(--border-strong);
  border-radius: 8px;
  box-shadow: var(--shadow-dialog);
  box-sizing: border-box;
}

.eyebrow {
  display: block;
  margin-bottom: 7px;
  color: var(--accent-cyan);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  color: var(--text-primary);
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
  color: var(--accent-amber);
  background: var(--accent-amber-soft);
  border: var(--hairline) solid var(--accent-amber-border);
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
  color: var(--text-secondary);
  text-align: left;
  background: var(--surface-2);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 10px;
  cursor: pointer;
}

.mode-card:hover,
.mode-card-recommended {
  border-color: var(--accent-cyan-border);
}

.mode-card strong {
  color: var(--text-primary);
  font-size: 16px;
}

.mode-card span:last-child {
  font-size: 12px;
  line-height: 1.55;
}

.recommended-badge {
  color: var(--accent-cyan);
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
  color: var(--accent-cyan);
  font-size: 11px;
  background: var(--accent-cyan-soft);
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
  background: var(--surface-0);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 9px;
}

.prompt-demo {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 15px;
}

.prompt {
  color: var(--accent-green);
}

.cursor {
  color: var(--text-primary);
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
  background: var(--surface-2);
  border-radius: 7px;
}

kbd {
  align-self: flex-start;
  padding: 3px 6px;
  color: var(--text-primary);
  font-family: inherit;
  background: var(--surface-3);
  border: var(--hairline) solid var(--border-strong);
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
  color: var(--accent-green);
}

.space-part {
  padding: 3px 5px;
  color: var(--accent-nav-text);
  font-family: system-ui, sans-serif;
  font-size: 9px;
  background: var(--accent-amber);
  border-radius: 3px;
}

.argument-part {
  color: var(--accent-cyan);
}

.demo-command {
  width: 100%;
  margin-top: 16px;
  padding: 11px;
  color: var(--accent-green);
  font-weight: 700;
  background: var(--accent-green-soft);
  border: var(--hairline) solid var(--accent-green-border);
  border-radius: 7px;
  cursor: pointer;
}

.observation {
  color: var(--text-muted);
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
  color: var(--accent-amber);
  text-align: center;
  background: var(--surface-2);
  border-radius: 5px;
  box-sizing: border-box;
}

.placeholder-demo span,
.placeholder-demo strong {
  font-size: 10px;
}

.support-list strong {
  color: var(--accent-cyan);
}

.tutorial-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 15px;
  border-top: var(--hairline) solid var(--border-subtle);
}

.btn-skip,
.btn-primary {
  padding: 8px 13px;
  font-size: 12px;
  border-radius: 7px;
  cursor: pointer;
}

.btn-skip {
  color: var(--text-muted);
  background: transparent;
  border: 1px solid transparent;
}

.btn-primary {
  min-width: 100px;
  color: var(--accent-cyan-contrast);
  font-weight: 800;
  background: var(--accent-cyan);
  border: none;
}

.btn-primary:disabled {
  color: var(--text-disabled);
  background: var(--surface-3);
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .terminal-highlight {
    display: none;
  }

  .onboarding-layer,
  .onboarding-layer.focus-terminal {
    justify-content: center;
    /* 窄屏为上下堆叠布局、无高亮框，各步骤统一遮罩 */
    background: var(--overlay-backdrop);
  }
}

@media (max-width: 520px) {
  .onboarding-card {
    padding: 20px;
  }

  .key-grid {
    grid-template-columns: 1fr;
  }

  .demo-command,
  .btn-skip,
  .btn-primary {
    min-height: 44px;
  }
}
</style>
