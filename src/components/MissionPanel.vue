<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { normalizeAnswer } from '../services/answer-normalize'
import type {
  LabMode,
  LearningStep,
  LevelCompletionRecord,
  LevelDef,
} from '../types/lab'
import { copyText } from '../services/clipboard'

const props = defineProps<{
  level: LevelDef
  completed: boolean
  hintsUsed: number
  isLast: boolean
  mode: LabMode
  guideStep: number
  completedSteps: number[]
  completionRecord?: LevelCompletionRecord
}>()

const emit = defineEmits<{
  (e: 'next'): void
  (e: 'use-hint', level: number): void
  (e: 'run-command', command: string): void
  (e: 'advance-guide', level: number, totalSteps: number): void
  (e: 'complete-step', level: number, stepId: number): void
  (e: 'change-mode', mode: LabMode): void
}>()

const panelScrollRef = ref<HTMLElement | null>(null)
const currentActionRef = ref<HTMLElement | null>(null)
const stepHeadingRef = ref<HTMLElement | null>(null)
const manualInputRef = ref<HTMLInputElement | null>(null)
const localCompletedIds = ref<number[]>([])
const actionPerformed = ref(false)
const confirmChecked = ref(false)
const selectedChoice = ref('')
const commandError = ref('')
const answerError = ref('')
const manualCommand = ref('')
const lastExecutedCommand = ref('')
const verificationCommand = ref('')
const verificationError = ref('')
const copyStatus = ref('')
let copyStatusTimer: number | null = null
const fieldValues = reactive<Record<string, string>>({})

const visibleHints = computed(() => props.level.hints.slice(0, props.hintsUsed))
const hasMoreHints = computed(() => props.hintsUsed < props.level.hints.length)
const currentStepIndex = computed(() =>
  Math.min(props.guideStep, Math.max(props.level.steps.length - 1, 0)),
)
const currentStep = computed<LearningStep>(() => props.level.steps[currentStepIndex.value])
const allCompletedIds = computed(
  () => new Set([...props.completedSteps, ...localCompletedIds.value]),
)
const currentStepResolved = computed(() => allCompletedIds.value.has(currentStep.value.id))
const hasNextStep = computed(() => currentStepIndex.value < props.level.steps.length - 1)
const learningPathComplete = computed(() =>
  props.level.steps.every((step) => allCompletedIds.value.has(step.id)),
)

interface TemplateSegment {
  kind: 'text' | 'slot'
  text: string
}

/** 把命令模板拆成固定文本与待填槽位；槽位展示字段标签，不把 {{field}} 记号暴露给学生。 */
const templateSegments = computed<TemplateSegment[]>(() => {
  const step = currentStep.value
  if (!step.commandTemplate) return []
  const segments: TemplateSegment[] = []
  let lastIndex = 0
  for (const match of step.commandTemplate.matchAll(/\{\{([a-z][a-z0-9-]*)\}\}/g)) {
    const index = match.index ?? 0
    if (index > lastIndex) {
      segments.push({ kind: 'text', text: step.commandTemplate.slice(lastIndex, index) })
    }
    const field = step.fields?.find((item) => item.id === match[1])
    segments.push({ kind: 'slot', text: field?.label ?? match[1] })
    lastIndex = index + match[0].length
  }
  if (lastIndex < step.commandTemplate.length) {
    segments.push({ kind: 'text', text: step.commandTemplate.slice(lastIndex) })
  }
  return segments
})
const verificationAvailable = computed(
  () => props.mode === 'challenge' || learningPathComplete.value,
)
const completedConcepts = computed(() =>
  props.level.steps
    .filter(
      (step) =>
        step.id <= currentStep.value.id &&
        (allCompletedIds.value.has(step.id) || step.id === currentStep.value.id),
    )
    .flatMap((step) => step.introduces ?? []),
)
const completionPathLabel = computed(() => {
  if (!props.completionRecord) return '历史完成'
  if (props.completionRecord.path === 'challenge') return '挑战通关'
  if (props.completionRecord.path === 'mixed') return '混合完成'
  return '引导通关'
})
const completionRecordLabel = computed(() => {
  if (!props.completionRecord) return completionPathLabel.value
  const hints =
    props.completionRecord.hintsUsed === 0
      ? '未使用提示'
      : `展开 ${props.completionRecord.hintsUsed} 层提示`
  return `${completionPathLabel.value} · ${hints}`
})

watch(
  () => props.completed,
  (completed, wasCompleted) => {
    if (!completed || wasCompleted) return
    void nextTick(() => {
      if (panelScrollRef.value !== null) panelScrollRef.value.scrollTop = 0
    })
  },
)

watch(
  () => [props.level.id, currentStep.value.id],
  () => {
    actionPerformed.value = false
    confirmChecked.value = false
    selectedChoice.value = ''
    commandError.value = ''
    answerError.value = ''
    manualCommand.value = ''
    verificationCommand.value = ''
    verificationError.value = ''
    Object.keys(fieldValues).forEach((key) => delete fieldValues[key])

    // 步骤高低差异很大；保留旧 scrollTop 会把新步骤标题裁到面板上方。
    // 等 Vue 更新完当前步骤 DOM 后，从标题开始展示并把读屏/键盘焦点带到这里。
    void nextTick(() => {
      const panel = panelScrollRef.value
      const action = currentActionRef.value
      if (panel !== null && action !== null) {
        const panelTop = panel.getBoundingClientRect().top
        const actionTop = action.getBoundingClientRect().top
        panel.scrollTop = Math.max(panel.scrollTop + actionTop - panelTop - 12, 0)
      }
      stepHeadingRef.value?.focus({ preventScroll: true })
    })
  },
  { flush: 'post' },
)

watch(
  () => props.level.id,
  () => {
    localCompletedIds.value = []
    lastExecutedCommand.value = ''
  },
)

function isUnreplacedPlaceholder(command: string): boolean {
  return /<[^<>\n]+>|\{\{[^{}\n]+\}\}/.test(command)
}

function rememberStepCompletion(): void {
  const stepId = currentStep.value.id
  if (!localCompletedIds.value.includes(stepId)) {
    localCompletedIds.value = [...localCompletedIds.value, stepId]
    emit('complete-step', props.level.id, stepId)
  }
}

function runObservation(): void {
  const command = currentStep.value.command
  if (!command) return
  emit('run-command', command)
  lastExecutedCommand.value = command
  actionPerformed.value = true
  commandError.value = ''
}

async function copyCommand(command: string): Promise<void> {
  if (!command) return
  await copyText(command)
  copyStatus.value = '已复制'
  if (copyStatusTimer !== null) window.clearTimeout(copyStatusTimer)
  copyStatusTimer = window.setTimeout(() => {
    copyStatus.value = ''
    copyStatusTimer = null
  }, 2000)
}

function buildStructuredCommand(): string | null {
  const step = currentStep.value
  if (!step.commandTemplate || !step.fields) return null
  const missing = step.fields.find((field) => !normalizeAnswer(fieldValues[field.id] ?? ''))
  if (missing) {
    commandError.value = `请先填写“${missing.label}”。`
    return null
  }
  return step.commandTemplate.replace(/\{\{([a-z][a-z0-9-]*)\}\}/g, (_, id: string) =>
    normalizeAnswer(fieldValues[id] ?? ''),
  )
}

function runStructuredCommand(): void {
  const command = buildStructuredCommand()
  if (!command) return
  if (isUnreplacedPlaceholder(command)) {
    commandError.value = '命令里仍有未替换的占位内容。'
    return
  }
  emit('run-command', command)
  lastExecutedCommand.value = command
  actionPerformed.value = true
  commandError.value = ''
}

function runManualCommand(): void {
  const command = normalizeAnswer(manualCommand.value)
  if (!command) {
    commandError.value = '请先完整输入一条命令。'
    return
  }
  if (isUnreplacedPlaceholder(command)) {
    commandError.value = '尖括号或模板空位不能原样运行，请换成真实值。'
    return
  }
  emit('run-command', command)
  lastExecutedCommand.value = command
  actionPerformed.value = true
  commandError.value = ''
}

function reuseLastCommand(): void {
  if (!lastExecutedCommand.value) return
  manualCommand.value = lastExecutedCommand.value
  void nextTick(() => manualInputRef.value?.focus())
}

function submitAnswer(): void {
  const question = currentStep.value.question
  if (!question || !selectedChoice.value) {
    answerError.value = '请先选择一个判断。'
    return
  }
  if (selectedChoice.value !== question.answer) {
    answerError.value = '这个判断与当前输出不一致，请回到观察结果再试。'
    return
  }
  answerError.value = ''
  rememberStepCompletion()
}

function confirmObservation(): void {
  // 手动步骤允许学生直接在真实终端中使用 ↑ 取回历史命令、编辑并执行。
  // 前端无法可靠监听 Shell 是否完成了目标，因此由最终 check 校验真实环境状态。
  if (!actionPerformed.value && currentStep.value.type !== 'manual-command') return
  rememberStepCompletion()
}

function confirmCheckpoint(): void {
  if (!confirmChecked.value) return
  rememberStepCompletion()
}

function advanceStep(): void {
  if (!currentStepResolved.value || !hasNextStep.value) return
  emit('advance-guide', props.level.id, props.level.steps.length)
}

function runVerification(): void {
  const command = normalizeAnswer(verificationCommand.value)
  if (!verificationAvailable.value) {
    verificationError.value = '先完成当前教学步骤，验证区才会开放。'
    return
  }
  if (!command) {
    verificationError.value = '请手动输入完整验证命令。'
    return
  }
  if (!/^check(?:\s|$)/.test(command)) {
    verificationError.value = '验证命令应以 check 开头。'
    return
  }
  if (isUnreplacedPlaceholder(command)) {
    verificationError.value = '仍有尖括号占位符，请用终端中发现的真实值替换。'
    return
  }
  verificationError.value = ''
  emit('run-command', command)
}

function hintKindLabel(kind: string): string {
  if (kind === 'direction') return '方向'
  if (kind === 'tool') return '工具'
  return '结构'
}

function stepTypeLabel(type: LearningStep['type']): string {
  const labels: Record<LearningStep['type'], string> = {
    explain: '必要知识',
    observe: '运行并观察',
    'partial-command': '补全命令',
    'manual-command': '独立输入',
    question: '根据输出判断',
    checkpoint: '中间检查',
    reflection: '方法回顾',
  }
  return labels[type]
}
</script>

<template>
  <aside class="mission-panel">
    <div ref="panelScrollRef" class="panel-scroll">
      <header class="level-header">
        <span class="level-badge">第 {{ level.id }} 关</span>
        <button
          type="button"
          class="mode-badge"
          :title="mode === 'guided' ? '切换到挑战模式' : '切换到引导模式'"
          @click="emit('change-mode', mode === 'guided' ? 'challenge' : 'guided')"
        >
          {{ mode === 'guided' ? '引导模式' : '挑战模式' }}
        </button>
        <span v-if="completed" class="done-badge" role="status">✓ 已完成</span>
      </header>
      <h2 class="level-name">{{ level.name }}</h2>
      <p class="level-tagline">{{ level.tagline }}</p>

      <details class="story-details">
        <summary><span>任务背景</span></summary>
        <p class="story-summary">{{ level.storySummary }}</p>
        <p>{{ level.story }}</p>
      </details>

      <template v-if="completed">
        <section class="completion-card" role="status" aria-live="polite">
          <span class="completion-mark">✓</span>
          <div>
            <h3>验证通过</h3>
            <p>{{ level.completionSummary.solved }}</p>
            <p class="completion-path">{{ completionRecordLabel }}</p>
          </div>
        </section>

        <section class="summary-block">
          <h3>你实际掌握了</h3>
          <ul>
            <li v-for="item in level.completionSummary.mastered" :key="item">{{ item }}</li>
          </ul>
        </section>

        <section class="next-transfer">
          <h3>{{ isLast ? '接下来' : '下一关怎样复用' }}</h3>
          <p>{{ level.completionSummary.next }}</p>
        </section>

        <button type="button" class="btn-next" @click="emit('next')">
          {{ isLast ? '查看完整通关总结 →' : `准备好后进入第 ${level.id + 1} 关 →` }}
        </button>
      </template>

      <template v-else>
        <section class="goals-block">
          <h3>当前目标</h3>
          <ul>
            <li v-for="goal in level.goals" :key="goal">{{ goal }}</li>
          </ul>
          <details v-if="mode === 'guided' && level.prerequisites.length > 0">
            <summary>本关会复用的能力</summary>
            <ul>
              <li v-for="item in level.prerequisites" :key="item">{{ item }}</li>
            </ul>
          </details>
        </section>

        <section
          v-if="mode === 'guided'"
          ref="currentActionRef"
          class="current-action"
          aria-live="polite"
        >
          <header class="action-header">
            <div>
              <span class="action-eyebrow">{{ stepTypeLabel(currentStep.type) }}</span>
              <h3 ref="stepHeadingRef" tabindex="-1">
                第 {{ currentStepIndex + 1 }} / {{ level.steps.length }} 步 · {{ currentStep.title }}
              </h3>
            </div>
            <span class="step-progress" aria-hidden="true">
              <i
                v-for="step in level.steps"
                :key="step.id"
                :class="{ active: step.id <= currentStep.id, done: allCompletedIds.has(step.id) }"
              />
            </span>
          </header>

          <p class="step-objective"><strong>这一步要做到：</strong>{{ currentStep.objective }}</p>

          <div
            v-for="concept in currentStep.introduces"
            :key="concept.id"
            class="concept-card"
          >
            <span>首次出现</span>
            <h4>{{ concept.term }}</h4>
            <p>{{ concept.explanation }}</p>
          </div>

          <p class="step-instruction">{{ currentStep.instruction }}</p>

          <div
            v-if="currentStep.observation && currentStep.type !== 'checkpoint'"
            class="observation-box"
          >
            <span>运行后观察</span>
            <p>{{ currentStep.observation }}</p>
          </div>

          <template v-if="currentStep.type === 'observe'">
            <div class="command-row">
              <button
                type="button"
                class="command-run"
                @click="runObservation"
              >
                <span>运行观察示例</span>
                <code>{{ currentStep.command }}</code>
              </button>
              <button
                type="button"
                class="command-copy"
                @click="copyCommand(currentStep.command ?? '')"
              >
                {{ copyStatus || '复制命令' }}
              </button>
            </div>
          </template>

          <template v-else-if="currentStep.type === 'partial-command'">
            <form
              class="structured-form"
              @submit.prevent="runStructuredCommand"
            >
              <code class="command-template"><template v-for="(segment, index) in templateSegments" :key="index"><span v-if="segment.kind === 'slot'" class="template-slot">{{ segment.text }}</span><template v-else>{{ segment.text }}</template></template></code>
              <p class="template-note">高亮块只是占位，不是命令的一部分；运行时会换成下方填写的内容。</p>
              <label v-for="field in currentStep.fields" :key="field.id">
                {{ field.label }}
                <input
                  v-model="fieldValues[field.id]"
                  :placeholder="field.placeholder"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>
              <button type="submit">组合后在终端运行</button>
            </form>
          </template>

          <form
            v-else-if="currentStep.type === 'manual-command'"
            class="manual-form"
            @submit.prevent="runManualCommand"
          >
            <label :for="`manual-${level.id}-${currentStep.id}`">输入要运行的命令</label>
            <input
              ref="manualInputRef"
              :id="`manual-${level.id}-${currentStep.id}`"
              v-model="manualCommand"
              autocomplete="off"
              spellcheck="false"
              placeholder="这里不提供可点击答案"
            />
            <button
              v-if="lastExecutedCommand"
              type="button"
              class="btn-reuse-command"
              @click="reuseLastCommand"
            >
              带入上一条已运行命令继续编辑
            </button>
            <button type="submit">在终端运行</button>
          </form>

          <fieldset v-else-if="currentStep.type === 'question' && currentStep.question" class="question">
            <legend>{{ currentStep.question.prompt }}</legend>
            <label v-for="choice in currentStep.question.choices" :key="choice.id">
              <input v-model="selectedChoice" type="radio" :value="choice.id" />
              <span>{{ choice.label }}</span>
            </label>
            <button type="button" @click="submitAnswer">提交判断</button>
          </fieldset>

          <div v-else-if="currentStep.type === 'checkpoint'" class="checkpoint">
            <label>
              <input v-model="confirmChecked" type="checkbox" />
              <span>{{ currentStep.observation }}</span>
            </label>
            <button type="button" :disabled="!confirmChecked" @click="confirmCheckpoint">
              确认中间结果
            </button>
          </div>

          <p
            v-if="['partial-command', 'manual-command'].includes(currentStep.type)"
            class="command-note"
          >
            需要多条命令时可以继续在终端操作；全部核对完成后再确认本步。
          </p>

          <button
            v-if="currentStep.completion === 'acknowledge' && !currentStepResolved"
            type="button"
            class="btn-evidence"
            @click="rememberStepCompletion"
          >
            我理解了，继续实践
          </button>

          <button
            v-if="
              ['run', 'input'].includes(currentStep.completion) &&
              (actionPerformed || currentStep.type === 'manual-command') &&
              !currentStepResolved
            "
            type="button"
            class="btn-evidence"
            @click="confirmObservation"
          >
            {{
              currentStep.type === 'manual-command' && !actionPerformed
                ? '我已在真实终端完成并核对观察点'
                : '我已完成操作并核对观察点'
            }}
          </button>

          <p v-if="commandError || answerError" class="inline-error" role="alert">
            {{ commandError || answerError }}
          </p>

          <details v-if="currentStep.commonErrors?.length" class="errors-details">
            <summary>运行不符合预期？</summary>
            <ul>
              <li v-for="error in currentStep.commonErrors" :key="error">{{ error }}</li>
            </ul>
          </details>

          <div v-if="currentStepResolved" class="step-complete">
            <span>✓ 已留下本步完成证据</span>
            <p v-if="currentStep.question">{{ currentStep.question.success }}</p>
            <p v-if="currentStep.reinforcement">{{ currentStep.reinforcement }}</p>
          </div>

          <button
            v-if="currentStepResolved && hasNextStep"
            type="button"
            class="btn-advance"
            @click="advanceStep"
          >
            进入下一步 →
          </button>
        </section>

        <section v-else class="challenge-brief" aria-live="polite">
          <span class="challenge-eyebrow">自由探索</span>
          <h3>终端和最终状态就是你的解题空间</h3>
          <p>
            挑战模式不会展示教学步骤、命令结构或观察答案。你可以直接在终端调查，
            需要时逐层展开提示；最终验证只检查真实环境结果。
          </p>
          <button type="button" class="btn-switch-guided" @click="emit('change-mode', 'guided')">
            需要分步带领？切换到引导模式
          </button>
        </section>

        <section class="hints-block">
          <h3>按需提示</h3>
          <ol v-if="visibleHints.length > 0" class="hints">
            <li v-for="hint in visibleHints" :key="hint.level">
              <span>第 {{ hint.level }} 层 · {{ hintKindLabel(hint.kind) }}</span>
              {{ hint.text }}
            </li>
          </ol>
          <button
            v-if="hasMoreHints"
            type="button"
            class="btn-hint"
            @click="emit('use-hint', level.id)"
          >
            展开第 {{ hintsUsed + 1 }} 层提示
          </button>
          <p v-else class="hint-note">最高级提示仍保留需要你填写或判断的关键部分。</p>
        </section>

        <section v-if="mode === 'guided' && completedConcepts.length > 0" class="mastery-strip">
          <h3>已掌握能力</h3>
          <span v-for="concept in completedConcepts" :key="concept.id">{{ concept.term }}</span>
        </section>

        <section class="verification" :class="{ locked: !verificationAvailable }">
          <h3>最终验证</h3>
          <template v-if="verificationAvailable">
            <p>{{ level.verification.instruction }}</p>
            <code>{{ level.verification.usage }}</code>
            <dl v-if="level.verification.placeholders.length > 0">
              <div v-for="placeholder in level.verification.placeholders" :key="placeholder.token">
                <dt>{{ placeholder.token }}</dt>
                <dd>{{ placeholder.meaning }}</dd>
              </div>
            </dl>
            <form class="verification-form" @submit.prevent="runVerification">
              <label :for="`verification-${level.id}`">手动输入完整验证命令</label>
              <input
                :id="`verification-${level.id}`"
                v-model="verificationCommand"
                autocomplete="off"
                spellcheck="false"
                placeholder="不要照抄尖括号占位符"
              />
              <button type="submit">在终端验证</button>
            </form>
            <p v-if="verificationError" class="inline-error" role="alert">{{ verificationError }}</p>
          </template>
          <p v-else>完成全部 {{ level.steps.length }} 个必要步骤后开放，每一步都需要你亲自确认。</p>
        </section>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.mission-panel {
  height: 100%;
  overflow: hidden;
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 15px;
  font-weight: 440;
  line-height: 1.5;
  background: var(--panel-bg);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 8px;
  box-shadow: var(--shadow-panel);
}

.panel-scroll {
  height: 100%;
  overflow-y: auto;
  padding: 16px 16px 28px;
  box-sizing: border-box;
}

.level-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.level-badge,
.mode-badge,
.done-badge {
  display: inline-flex;
  align-items: center;
  min-height: 23px;
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
  border-radius: 5px;
}

.level-badge {
  color: var(--accent-cyan);
  background: var(--accent-cyan-soft);
  border: var(--hairline) solid var(--accent-cyan-border);
}

.mode-badge {
  color: var(--accent-cyan);
  background: var(--surface-2);
  border: var(--hairline) solid var(--border-subtle);
  cursor: pointer;
}

.done-badge {
  margin-left: auto;
  color: var(--accent-green);
  background: var(--accent-green-soft);
  border: var(--hairline) solid var(--accent-green-border);
}

.level-name {
  margin: 8px 0 3px;
  color: var(--text-primary);
  font-family: var(--font-cjk);
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
}

.level-tagline {
  margin: 0;
  color: var(--text-faint);
  font-size: 13px;
  line-height: 1.6;
}

.story-details,
.goals-block,
.current-action,
.challenge-brief,
.hints-block,
.mastery-strip,
.verification,
.summary-block,
.next-transfer {
  margin-top: var(--space-4);
}

.story-details {
  padding: 11px 12px;
  background: var(--surface-2);
  border-radius: 8px;
}

.story-details summary,
.goals-block details summary,
.errors-details summary {
  cursor: pointer;
}

.story-details summary {
  display: list-item;
  color: var(--text-secondary);
  font-size: 15px;
  font-weight: 450;
  line-height: 1.7;
}

.story-details summary span {
  display: inline;
  color: var(--accent-cyan);
  font-size: 14px;
  font-weight: 650;
  text-transform: none;
}

.story-details p {
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: 15px;
  font-weight: 450;
  line-height: 1.75;
}

.story-details p + p {
  margin-top: 8px;
}

.story-details .story-summary {
  color: var(--text-muted);
  font-weight: 550;
}

.goals-block h3,
.hints-block h3,
.mastery-strip h3,
.verification h3,
.summary-block h3,
.next-transfer h3 {
  margin: 0 0 7px;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 650;
  text-transform: none;
}

.goals-block ul,
.summary-block ul {
  margin: 0;
  padding-left: 18px;
  font-size: 15px;
  line-height: 1.75;
}

.goals-block details {
  margin-top: 9px;
  color: var(--text-faint);
  font-size: 14px;
  line-height: 1.6;
}

.current-action {
  padding: 15px;
  background: var(--surface-raised);
  border: var(--hairline) solid var(--accent-cyan-border);
  border-radius: 10px;
}

.challenge-brief {
  padding: 15px;
  background: var(--accent-violet-soft);
  border: var(--hairline) solid var(--accent-violet-border);
  border-radius: 10px;
}

.challenge-eyebrow {
  color: var(--accent-violet);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.challenge-brief h3 {
  margin: 5px 0 7px;
  color: var(--text-primary);
  font-size: 14px;
}

.challenge-brief p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.65;
}

.btn-switch-guided {
  width: 100%;
  margin-top: 12px;
  padding: 9px 11px;
  color: var(--accent-violet);
  font-size: 12px;
  font-weight: 800;
  background: var(--surface-1);
  border: var(--hairline) solid var(--accent-violet-border);
  border-radius: 7px;
  cursor: pointer;
}

.action-header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.action-eyebrow {
  color: var(--accent-cyan);
  font-size: 11px;
  font-weight: 750;
}

.action-header h3 {
  margin: 3px 0 0;
  color: var(--text-primary);
  font-size: 17px;
  line-height: 1.5;
}

.step-progress {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 3px;
  max-width: 105px;
  padding-top: 4px;
}

.step-progress i {
  width: 10px;
  height: 4px;
  background: var(--border-strong);
  border-radius: 2px;
}

.step-progress i.active {
  background: var(--accent-cyan);
}

.step-progress i.done {
  background: var(--accent-green);
}

.step-objective,
.step-instruction {
  margin: 12px 0 0;
  font-size: 15px;
  line-height: 1.7;
}

.step-objective {
  color: var(--text-secondary);
}

.step-objective strong {
  color: var(--accent-amber);
}

.step-instruction {
  color: var(--text-secondary);
}

.concept-card {
  margin-top: 12px;
  padding: 11px;
  background: var(--accent-violet-soft);
  border: var(--hairline) solid var(--accent-violet-border);
  border-radius: 8px;
}

.concept-card > span {
  color: var(--accent-violet);
  font-size: 11px;
  font-weight: 750;
  text-transform: none;
}

.concept-card h4 {
  margin: 3px 0 4px;
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.5;
}

.concept-card p,
.observation-box p,
.step-complete p {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
}

.observation-box {
  margin-top: 12px;
  padding: 9px 10px;
  background: var(--accent-amber-soft);
  border-left: 3px solid var(--accent-amber);
  border-radius: 4px;
}

.observation-box > span {
  color: var(--accent-amber);
  font-size: 11px;
  font-weight: 750;
}

.command-run,
.structured-form,
.manual-form,
.question,
.checkpoint {
  margin-top: 13px;
}

.command-run {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  padding: 10px 12px;
  color: var(--accent-green);
  text-align: left;
  background: var(--surface-0);
  border: var(--hairline) solid var(--accent-green-border);
  border-radius: 7px;
  cursor: pointer;
}

.command-run span {
  font-size: 11px;
  font-weight: 700;
}

code,
input {
  font-family: var(--font-mono);
}

.command-run code {
  font-size: 14px;
  line-height: 1.5;
}

.command-row {
  margin-top: 13px;
  display: flex;
  gap: 6px;
  align-items: stretch;
}

.command-row .command-run {
  margin-top: 0;
  flex: 1;
  min-width: 0;
}

.command-copy {
  flex-shrink: 0;
  align-self: center;
  min-height: 34px;
  padding: 0 10px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 650;
  background: var(--surface-0);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 7px;
  cursor: pointer;
}

.command-copy:hover {
  color: var(--text-primary);
  border-color: var(--accent-cyan);
}

.structured-form,
.manual-form,
.verification-form {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.command-note {
  margin: 8px 0 0;
  color: var(--text-faint);
  font-size: 13px;
  line-height: 1.6;
}

.command-template {
  overflow-x: auto;
  padding: 9px 10px;
  color: var(--accent-amber);
  font-size: 14px;
  white-space: nowrap;
  background: var(--surface-0);
  border: var(--hairline) solid var(--accent-amber-border);
  border-radius: 6px;
}

.template-slot {
  padding: 1px 6px;
  color: var(--accent-cyan);
  font-weight: 700;
  background: var(--surface-2);
  border: 1px dashed var(--accent-cyan-border);
  border-radius: 4px;
}

.template-note {
  margin: -3px 0 0;
  color: var(--text-faint);
  font-size: 12px;
}

.structured-form label,
.manual-form label,
.verification-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-muted);
  font-size: 13px;
}

input[type='text'],
.structured-form input,
.manual-form input,
.verification-form input {
  min-width: 0;
  padding: 9px 10px;
  color: var(--text-primary);
  font-size: 14px;
  background: var(--surface-0);
  border: var(--hairline) solid var(--border-strong);
  border-radius: 6px;
}

.structured-form button,
.manual-form button,
.question button,
.checkpoint button,
.verification-form button,
.btn-evidence,
.btn-advance,
.btn-next {
  padding: 9px 11px;
  color: var(--accent-cyan-contrast);
  min-height: 44px;
  font-size: 15px;
  font-weight: 750;
  background: var(--accent-cyan);
  border: none;
  border-radius: 7px;
  cursor: pointer;
}

.manual-form .btn-reuse-command {
  color: var(--accent-cyan);
  background: var(--surface-2);
  border: var(--hairline) solid var(--accent-cyan-border);
}

.action-header h3:focus {
  outline: none;
}

.action-header h3:focus-visible {
  border-radius: 4px;
  outline: 2px solid var(--accent-cyan);
  outline-offset: 3px;
}

.question {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  border: none;
}

.question legend {
  margin-bottom: 8px;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 650;
}

.question label,
.checkpoint label {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.checkpoint {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.checkpoint button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.btn-evidence,
.btn-advance {
  width: 100%;
  margin-top: 13px;
}

.btn-evidence {
  color: var(--accent-green);
  background: var(--accent-green-soft);
  border: var(--hairline) solid var(--accent-green-border);
}

.inline-error {
  margin: 9px 0 0;
  color: var(--accent-red);
  font-size: 13px;
}

.errors-details {
  margin-top: 10px;
  color: var(--accent-coral);
  font-size: 13px;
}

.errors-details ul {
  margin: 6px 0 0;
  padding-left: 17px;
}

.step-complete {
  margin-top: 12px;
  padding: 9px 10px;
  color: var(--accent-green);
  background: var(--accent-green-soft);
  border-radius: 6px;
}

.step-complete span {
  font-size: 13px;
  font-weight: 700;
}

.step-complete p {
  margin-top: 4px;
  color: var(--text-secondary);
}

.hints-block {
  padding-top: 13px;
  border-top: var(--hairline) solid var(--border-subtle);
}

.hints {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 9px;
  padding: 0;
  list-style: none;
  font-size: 14px;
  line-height: 1.72;
}

.hints li {
  padding: 8px 9px;
  background: var(--accent-amber-soft);
  border-radius: 6px;
}

.hints span {
  display: block;
  color: var(--accent-amber);
  font-size: 11px;
  font-weight: 700;
}

.btn-hint {
  padding: 7px 11px;
  color: var(--accent-amber);
  min-height: 44px;
  font-size: 14px;
  font-weight: 650;
  background: var(--accent-amber-soft);
  border: var(--hairline) solid var(--accent-amber-border);
  border-radius: 7px;
  cursor: pointer;
}

.hint-note {
  margin: 0;
  color: var(--text-faint);
  font-size: 13px;
}

.mastery-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mastery-strip h3 {
  width: 100%;
}

.mastery-strip span {
  padding: 3px 8px;
  color: var(--accent-violet);
  font-size: 13px;
  background: var(--accent-violet-soft);
  border: var(--hairline) solid var(--accent-violet-border);
  border-radius: 999px;
}

.verification {
  padding: 12px;
  background: var(--accent-green-soft);
  border: var(--hairline) solid var(--accent-green-border);
  border-radius: 8px;
}

.verification.locked {
  color: var(--text-disabled);
  background: var(--surface-2);
  border-color: var(--border-subtle);
}

.verification > p {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.6;
}

.verification > code {
  display: block;
  overflow-x: auto;
  color: var(--accent-green);
  font-size: 14px;
  white-space: nowrap;
}

.verification dl {
  margin: 9px 0;
}

.verification dl div {
  margin-top: 6px;
}

.verification dt {
  color: var(--accent-amber);
  font-family: var(--font-mono);
  font-size: 13px;
}

.verification dd {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

.verification-form {
  margin-top: 10px;
}

.completion-card {
  display: flex;
  gap: 12px;
  margin-top: 16px;
  padding: 14px;
  background: var(--accent-green-soft);
  border: var(--hairline) solid var(--accent-green-border);
  border-radius: 9px;
}

.completion-mark {
  width: 32px;
  height: 32px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  color: var(--accent-green-contrast);
  font-weight: 900;
  background: var(--accent-green);
  border-radius: 50%;
}

.completion-card h3,
.completion-card p {
  margin: 0;
}

.completion-card h3 {
  color: var(--accent-green);
  font-size: 15px;
}

.completion-card p,
.next-transfer p {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.completion-card .completion-path {
  color: var(--text-faint);
  font-size: 11px;
  font-weight: 750;
}

.next-transfer {
  padding: 11px 12px;
  background: var(--surface-2);
  border-radius: 8px;
}

.next-transfer p {
  margin-bottom: 0;
}

.btn-next {
  width: 100%;
  margin-top: 14px;
  padding: 11px;
}

@media (max-width: 600px) {
  .mode-badge,
  .command-run,
  .btn-switch-guided,
  .structured-form button,
  .manual-form button,
  .question button,
  .checkpoint button,
  .verification-form button,
  .btn-evidence,
  .btn-advance,
  .btn-next,
  .btn-hint {
    min-height: 44px;
  }

  .structured-form input,
  .manual-form input,
  .verification-form input {
    min-height: 44px;
    box-sizing: border-box;
  }

  .question label,
  .checkpoint label,
  .goals-block details summary,
  .errors-details summary {
    min-height: 44px;
    align-items: center;
  }

  .story-details summary {
    min-height: 44px;
    padding-block: 9px;
  }
}
</style>
