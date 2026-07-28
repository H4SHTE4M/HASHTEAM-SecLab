<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { LabMode, LearningStep, LevelDef } from '../types/lab'

const props = defineProps<{
  level: LevelDef
  completed: boolean
  hintsUsed: number
  isLast: boolean
  mode: LabMode
  guideStep: number
  completedSteps: number[]
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
const localCompletedIds = ref<number[]>([])
const actionPerformed = ref(false)
const confirmChecked = ref(false)
const selectedChoice = ref('')
const commandError = ref('')
const answerError = ref('')
const manualCommand = ref('')
const verificationCommand = ref('')
const verificationError = ref('')
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
const completedConcepts = computed(() =>
  props.level.steps
    .filter(
      (step) =>
        step.id <= currentStep.value.id &&
        (allCompletedIds.value.has(step.id) || step.id === currentStep.value.id),
    )
    .flatMap((step) => step.introduces ?? []),
)
const showStructuredInput = computed(
  () => props.mode === 'guided' || props.hintsUsed >= 3,
)

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
  },
)

watch(
  () => props.level.id,
  () => {
    localCompletedIds.value = []
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
  actionPerformed.value = true
  commandError.value = ''
}

function buildStructuredCommand(): string | null {
  const step = currentStep.value
  if (!step.commandTemplate || !step.fields) return null
  const missing = step.fields.find((field) => !fieldValues[field.id]?.trim())
  if (missing) {
    commandError.value = `请先填写“${missing.label}”。`
    return null
  }
  return step.commandTemplate.replace(/\{\{([a-z][a-z0-9-]*)\}\}/g, (_, id: string) =>
    fieldValues[id].trim(),
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
  actionPerformed.value = true
  commandError.value = ''
}

function runManualCommand(): void {
  const command = manualCommand.value.trim()
  if (!command) {
    commandError.value = '请先完整输入一条命令。'
    return
  }
  if (isUnreplacedPlaceholder(command)) {
    commandError.value = '尖括号或模板空位不能原样运行，请换成真实值。'
    return
  }
  emit('run-command', command)
  actionPerformed.value = true
  commandError.value = ''
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
  if (!actionPerformed.value) return
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
  const command = verificationCommand.value.trim()
  if (!learningPathComplete.value) {
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
        <summary>
          <span>任务背景</span>
          {{ level.storySummary }}
        </summary>
        <p>{{ level.story }}</p>
      </details>

      <template v-if="completed">
        <section class="completion-card" role="status" aria-live="polite">
          <span class="completion-mark">✓</span>
          <div>
            <h3>验证通过</h3>
            <p>{{ level.completionSummary.solved }}</p>
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
          <details v-if="level.prerequisites.length > 0">
            <summary>本关会复用的能力</summary>
            <ul>
              <li v-for="item in level.prerequisites" :key="item">{{ item }}</li>
            </ul>
          </details>
        </section>

        <section class="current-action" aria-live="polite">
          <header class="action-header">
            <div>
              <span class="action-eyebrow">{{ stepTypeLabel(currentStep.type) }}</span>
              <h3>第 {{ currentStepIndex + 1 }} / {{ level.steps.length }} 步 · {{ currentStep.title }}</h3>
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
            <button
              v-if="mode === 'guided'"
              type="button"
              class="command-run"
              @click="runObservation"
            >
              <span>运行观察示例</span>
              <code>{{ currentStep.command }}</code>
            </button>
            <form v-else class="manual-form" @submit.prevent="runManualCommand">
              <label :for="`manual-${level.id}-${currentStep.id}`">在挑战模式中自行输入观察命令</label>
              <input
                :id="`manual-${level.id}-${currentStep.id}`"
                v-model="manualCommand"
                autocomplete="off"
                spellcheck="false"
                placeholder="完整输入命令"
              />
              <button type="submit">在终端运行</button>
            </form>
          </template>

          <template v-else-if="currentStep.type === 'partial-command'">
            <form
              v-if="showStructuredInput"
              class="structured-form"
              @submit.prevent="runStructuredCommand"
            >
              <code class="command-template">{{ currentStep.commandTemplate }}</code>
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
            <form v-else class="manual-form" @submit.prevent="runManualCommand">
              <label :for="`manual-${level.id}-${currentStep.id}`">挑战模式：完整输入命令</label>
              <input
                :id="`manual-${level.id}-${currentStep.id}`"
                v-model="manualCommand"
                autocomplete="off"
                spellcheck="false"
                placeholder="需要结构时可逐层展开提示"
              />
              <button type="submit">在终端运行</button>
            </form>
          </template>

          <form
            v-else-if="currentStep.type === 'manual-command'"
            class="manual-form"
            @submit.prevent="runManualCommand"
          >
            <label :for="`manual-${level.id}-${currentStep.id}`">输入要运行的命令</label>
            <input
              :id="`manual-${level.id}-${currentStep.id}`"
              v-model="manualCommand"
              autocomplete="off"
              spellcheck="false"
              placeholder="这里不提供可点击答案"
            />
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
              actionPerformed &&
              !currentStepResolved
            "
            type="button"
            class="btn-evidence"
            @click="confirmObservation"
          >
            我已完成操作并核对观察点
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

        <section v-if="completedConcepts.length > 0" class="mastery-strip">
          <h3>已掌握能力</h3>
          <span v-for="concept in completedConcepts" :key="concept.id">{{ concept.term }}</span>
        </section>

        <section class="verification" :class="{ locked: !learningPathComplete }">
          <h3>最终验证</h3>
          <template v-if="learningPathComplete">
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
          <p v-else>完成全部 {{ level.steps.length }} 个必要步骤后开放，不能用连续点击跳过。</p>
        </section>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.mission-panel {
  height: 100%;
  overflow: hidden;
  color: #c7d3e8;
  background: #0f1830;
  border-left: 1px solid #1c2a44;
}

.panel-scroll {
  height: 100%;
  overflow-y: auto;
  padding: 18px 20px 28px;
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
  padding: 3px 9px;
  font-size: 11px;
  border-radius: 999px;
}

.level-badge {
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.35);
}

.mode-badge {
  color: #a8c7fa;
  background: #111c33;
  border: 1px solid #22314f;
  cursor: pointer;
}

.done-badge {
  margin-left: auto;
  color: #7fdba7;
  background: rgba(127, 219, 167, 0.1);
  border: 1px solid rgba(127, 219, 167, 0.35);
}

.level-name {
  margin: 10px 0 3px;
  color: #eef3fc;
  font-size: 21px;
}

.level-tagline {
  margin: 0;
  color: #7d8aa5;
  font-size: 12px;
}

.story-details,
.goals-block,
.current-action,
.hints-block,
.mastery-strip,
.verification,
.summary-block,
.next-transfer {
  margin-top: 14px;
}

.story-details {
  padding: 11px 12px;
  background: #111c33;
  border-radius: 8px;
}

.story-details summary,
.goals-block details summary,
.errors-details summary {
  cursor: pointer;
}

.story-details summary {
  color: #c7d3e8;
  font-size: 13px;
  line-height: 1.55;
}

.story-details summary span {
  display: block;
  color: #7dd3fc;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.story-details p {
  margin: 10px 0 0;
  color: #93a5c6;
  font-size: 12px;
  line-height: 1.65;
}

.goals-block h3,
.hints-block h3,
.mastery-strip h3,
.verification h3,
.summary-block h3,
.next-transfer h3 {
  margin: 0 0 7px;
  color: #93a5c6;
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.goals-block ul,
.summary-block ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.65;
}

.goals-block details {
  margin-top: 9px;
  color: #7d8aa5;
  font-size: 12px;
}

.current-action {
  padding: 15px;
  background: linear-gradient(145deg, rgba(56, 189, 248, 0.1), rgba(17, 28, 51, 0.95));
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 10px;
}

.action-header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.action-eyebrow {
  color: #7dd3fc;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.action-header h3 {
  margin: 4px 0 0;
  color: #eef3fc;
  font-size: 14px;
  line-height: 1.4;
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
  background: #2a3a5c;
  border-radius: 2px;
}

.step-progress i.active {
  background: #38bdf8;
}

.step-progress i.done {
  background: #7fdba7;
}

.step-objective,
.step-instruction {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.65;
}

.step-objective {
  color: #b8c5dd;
}

.step-objective strong {
  color: #ffd580;
}

.step-instruction {
  color: #c7d3e8;
}

.concept-card {
  margin-top: 12px;
  padding: 11px;
  background: rgba(167, 139, 250, 0.08);
  border: 1px solid rgba(167, 139, 250, 0.3);
  border-radius: 8px;
}

.concept-card > span {
  color: #c4b5fd;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.concept-card h4 {
  margin: 3px 0 4px;
  color: #ddd6fe;
  font-size: 13px;
}

.concept-card p,
.observation-box p,
.step-complete p {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.observation-box {
  margin-top: 12px;
  padding: 9px 10px;
  background: rgba(255, 213, 128, 0.06);
  border-left: 3px solid #ffd580;
  border-radius: 4px;
}

.observation-box > span {
  color: #ffd580;
  font-size: 10px;
  font-weight: 800;
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
  color: #a8e6c0;
  text-align: left;
  background: #0b1220;
  border: 1px solid #2b7553;
  border-radius: 7px;
  cursor: pointer;
}

.command-run span {
  font-size: 10px;
  font-weight: 800;
}

code,
input {
  font-family: 'JetBrains Mono', Consolas, monospace;
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
  color: #7d8aa5;
  font-size: 11px;
  line-height: 1.5;
}

.command-template {
  overflow-x: auto;
  padding: 9px 10px;
  color: #ffd580;
  font-size: 12px;
  white-space: nowrap;
  background: #0b1220;
  border: 1px solid rgba(255, 213, 128, 0.3);
  border-radius: 6px;
}

.structured-form label,
.manual-form label,
.verification-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #93a5c6;
  font-size: 11px;
}

input[type='text'],
.structured-form input,
.manual-form input,
.verification-form input {
  min-width: 0;
  padding: 9px 10px;
  color: #eef3fc;
  background: #0b1220;
  border: 1px solid #314263;
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
  color: #06121f;
  font-size: 12px;
  font-weight: 800;
  background: #38bdf8;
  border: none;
  border-radius: 7px;
  cursor: pointer;
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
  color: #eef3fc;
  font-size: 13px;
  font-weight: 700;
}

.question label,
.checkpoint label {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: #c7d3e8;
  font-size: 12px;
  line-height: 1.5;
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
  color: #d9fbe6;
  background: rgba(43, 117, 83, 0.35);
  border: 1px solid #2b7553;
}

.inline-error {
  margin: 9px 0 0;
  color: #fca5a5;
  font-size: 12px;
}

.errors-details {
  margin-top: 10px;
  color: #d8b4a0;
  font-size: 11px;
}

.errors-details ul {
  margin: 6px 0 0;
  padding-left: 17px;
}

.step-complete {
  margin-top: 12px;
  padding: 9px 10px;
  color: #a8e6c0;
  background: rgba(127, 219, 167, 0.08);
  border-radius: 6px;
}

.step-complete span {
  font-size: 11px;
  font-weight: 800;
}

.step-complete p {
  margin-top: 4px;
  color: #b8c5dd;
}

.hints-block {
  padding-top: 13px;
  border-top: 1px solid #1c2a44;
}

.hints {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 9px;
  padding: 0;
  list-style: none;
  font-size: 12px;
  line-height: 1.55;
}

.hints li {
  padding: 8px 9px;
  background: rgba(255, 213, 128, 0.05);
  border-radius: 6px;
}

.hints span {
  display: block;
  color: #ffd580;
  font-size: 9px;
  font-weight: 800;
}

.btn-hint {
  padding: 7px 11px;
  color: #ffd580;
  font-size: 12px;
  background: rgba(255, 213, 128, 0.08);
  border: 1px solid rgba(255, 213, 128, 0.3);
  border-radius: 7px;
  cursor: pointer;
}

.hint-note {
  margin: 0;
  color: #7d8aa5;
  font-size: 11px;
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
  color: #c4b5fd;
  font-size: 10px;
  background: rgba(167, 139, 250, 0.08);
  border: 1px solid rgba(167, 139, 250, 0.25);
  border-radius: 999px;
}

.verification {
  padding: 12px;
  background: rgba(127, 219, 167, 0.06);
  border: 1px solid rgba(127, 219, 167, 0.25);
  border-radius: 8px;
}

.verification.locked {
  color: #66779a;
  background: rgba(102, 119, 154, 0.05);
  border-color: #22314f;
}

.verification > p {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.55;
}

.verification > code {
  display: block;
  overflow-x: auto;
  color: #7fdba7;
  font-size: 12px;
  white-space: nowrap;
}

.verification dl {
  margin: 9px 0;
}

.verification dl div {
  margin-top: 6px;
}

.verification dt {
  color: #ffd580;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 11px;
}

.verification dd {
  margin: 2px 0 0;
  color: #93a5c6;
  font-size: 11px;
}

.verification-form {
  margin-top: 10px;
}

.completion-card {
  display: flex;
  gap: 12px;
  margin-top: 16px;
  padding: 14px;
  background: rgba(127, 219, 167, 0.08);
  border: 1px solid rgba(127, 219, 167, 0.3);
  border-radius: 9px;
}

.completion-mark {
  width: 32px;
  height: 32px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  color: #06121f;
  font-weight: 900;
  background: #7fdba7;
  border-radius: 50%;
}

.completion-card h3,
.completion-card p {
  margin: 0;
}

.completion-card h3 {
  color: #a8e6c0;
  font-size: 14px;
}

.completion-card p,
.next-transfer p {
  margin-top: 4px;
  color: #b8c5dd;
  font-size: 12px;
  line-height: 1.6;
}

.next-transfer {
  padding: 11px 12px;
  background: #111c33;
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
</style>
