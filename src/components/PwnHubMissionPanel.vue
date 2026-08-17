<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { normalizeAnswer } from '../services/answer-normalize'
import LabBrief from './LabBrief.vue'
import HintStack from './HintStack.vue'
import EvidenceForm from './EvidenceForm.vue'
import DebuggerControls from './DebuggerControls.vue'
import StepRenderer from './StepRenderer.vue'
import type {
  CourseLabDef,
  CourseStep,
  LabMode,
  LevelCompletionRecord,
} from '../types/lab'
import type { BinaryWorkbenchSnapshot } from '../types/binary'
import { copyText } from '../services/clipboard'

const props = defineProps<{
  level: CourseLabDef
  completed: boolean
  hintsUsed: number
  isLast: boolean
  mode: LabMode
  guideStep: number
  completedSteps: number[]
  completionRecord?: LevelCompletionRecord
  debuggerState?: 'idle' | 'ready' | 'stopped' | 'running' | 'exited'
}>()

const emit = defineEmits<{
  (e: 'next'): void
  (e: 'use-hint', labId: string): void
  (e: 'run-command', command: string): void
  (e: 'advance-guide', labId: string, totalSteps: number): void
  (e: 'complete-step', labId: string, stepId: number): void
  (e: 'change-mode', mode: LabMode): void
  (e: 'debugger-launch'): void
  (e: 'debugger-command', command: string): void
}>()

const panelScrollRef = ref<HTMLElement | null>(null)
const currentActionRef = ref<HTMLElement | null>(null)
const manualInputRef = ref<HTMLInputElement | null>(null)
const localCompletedIds = ref<number[]>([])
const copyStatus = ref('')
let copyStatusTimer: number | null = null
const actionPerformed = ref(false)
const confirmChecked = ref(false)
const selectedChoice = ref('')
const commandError = ref('')
const answerError = ref('')
const manualCommand = ref('')
const lastExecutedCommand = ref('')
const visibleStepIndex = ref(0)
const fieldValues = reactive<Record<string, string>>({})

const furthestStepIndex = computed(() =>
  Math.min(props.guideStep, Math.max(props.level.steps.length - 1, 0)),
)
const currentStepIndex = computed(() =>
  Math.min(visibleStepIndex.value, furthestStepIndex.value),
)
const currentStep = computed<CourseStep>(() => props.level.steps[currentStepIndex.value])
const allCompletedIds = computed(
  () => new Set([...props.completedSteps, ...localCompletedIds.value]),
)
const currentStepResolved = computed(() => allCompletedIds.value.has(currentStep.value.id))
const hasNextStep = computed(() => currentStepIndex.value < props.level.steps.length - 1)
const hasPreviousStep = computed(() => currentStepIndex.value > 0)
const hasRevealedNextStep = computed(() => currentStepIndex.value < furthestStepIndex.value)
const cumulativeWorkbench = computed<BinaryWorkbenchSnapshot | undefined>(() => {
  const snapshot: BinaryWorkbenchSnapshot = {}
  let hasSnapshot = false
  for (const step of props.level.steps.slice(0, currentStepIndex.value + 1)) {
    if (step.type !== 'visual-trace') continue
    Object.assign(snapshot, step.workbench)
    hasSnapshot = true
  }
  return hasSnapshot ? snapshot : undefined
})
const learningPathComplete = computed(() =>
  props.level.steps.every((step) => allCompletedIds.value.has(step.id)),
)
const verificationAvailable = computed(
  () => props.mode === 'challenge' || learningPathComplete.value,
)
const completedConcepts = computed(() =>
  props.level.steps
    .filter(
      (step) =>
        step.id <= props.level.steps[furthestStepIndex.value].id &&
        (allCompletedIds.value.has(step.id) || step.id === currentStep.value.id),
    )
    .flatMap((step) => step.introduces ?? []),
)
watch(
  () => [props.level.labId, furthestStepIndex.value] as const,
  ([labId, furthest], previous) => {
    const previousLabId = previous?.[0]
    const previousFurthest = previous?.[1] ?? -1
    if (labId !== previousLabId || furthest > previousFurthest) {
      visibleStepIndex.value = furthest
    } else if (visibleStepIndex.value > furthest) {
      visibleStepIndex.value = furthest
    }
  },
  { immediate: true },
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
  () => [props.level.labId, currentStep.value.id],
  () => {
    actionPerformed.value = false
    confirmChecked.value = false
    selectedChoice.value = ''
    commandError.value = ''
    answerError.value = ''
    manualCommand.value = ''
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
      currentActionRef.value
        ?.querySelector<HTMLElement>('.action-header h3')
        ?.focus({ preventScroll: true })
    })
  },
  { flush: 'post' },
)

watch(
  () => props.level.labId,
  () => {
    localCompletedIds.value = []
    lastExecutedCommand.value = ''
  },
)

// 与 SecLab MissionPanel 同理：「重置本实验」清空 store 证据后，
// 本地缓存必须同步失效，否则引导可以无证据连点到末尾。
watch(
  () => props.completedSteps,
  (steps) => {
    const persisted = new Set(steps)
    localCompletedIds.value = localCompletedIds.value.filter((id) => persisted.has(id))
  },
)

function isUnreplacedPlaceholder(command: string): boolean {
  return /<[^<>\n]+>|\{\{[^{}\n]+\}\}/.test(command)
}

function rememberStepCompletion(): void {
  const stepId = currentStep.value.id
  if (!localCompletedIds.value.includes(stepId)) {
    localCompletedIds.value = [...localCompletedIds.value, stepId]
    emit('complete-step', props.level.labId, stepId)
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
  if (
    !actionPerformed.value &&
    currentStep.value.type !== 'manual-command' &&
    currentStep.value.type !== 'terminal'
  ) return
  rememberStepCompletion()
}

function confirmCheckpoint(): void {
  if (!confirmChecked.value) return
  rememberStepCompletion()
}

function advanceStep(): void {
  if (!currentStepResolved.value || !hasNextStep.value) return
  emit('advance-guide', props.level.labId, props.level.steps.length)
}

function showPreviousStep(): void {
  if (!hasPreviousStep.value) return
  visibleStepIndex.value -= 1
}

function showNextRevealedStep(): void {
  if (!hasRevealedNextStep.value) return
  visibleStepIndex.value += 1
}

</script>

<template>
  <aside class="mission-panel">
    <div ref="panelScrollRef" class="panel-scroll">
      <LabBrief
        :level="level"
        :completed="completed"
        :mode="mode"
        :completion-record="completionRecord"
        @change-mode="emit('change-mode', $event)"
      />

      <template v-if="completed">
        <section class="next-transfer">
          <h3>{{ isLast ? '接下来' : '下一关怎样复用' }}</h3>
          <p>{{ level.completionSummary.next }}</p>
        </section>

        <button type="button" class="btn-next" @click="emit('next')">
          {{ isLast ? '查看完整通关总结 →' : '准备好后进入下一个实验 →' }}
        </button>
      </template>

      <template v-else>
        <section
          v-if="mode === 'guided'"
          ref="currentActionRef"
          class="current-action"
          aria-live="polite"
        >
          <StepRenderer
            :step="currentStep"
            :step-index="currentStepIndex"
            :total-steps="level.steps.length"
            :completed-step-ids="[...allCompletedIds]"
            :workbench-snapshot="cumulativeWorkbench"
            @write-command="emit('run-command', $event)"
            @external-complete="rememberStepCompletion"
          />

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
          </template>

          <form
            v-else-if="['manual-command', 'terminal'].includes(currentStep.type) && !currentStep.autoRun"
            class="manual-form"
            @submit.prevent="runManualCommand"
          >
            <label :for="`manual-${level.labId}-${currentStep.id}`">输入要运行的命令</label>
            <input
              ref="manualInputRef"
              :id="`manual-${level.labId}-${currentStep.id}`"
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

          <div v-else-if="currentStep.type === 'terminal' && currentStep.autoRun" class="auto-run-state">
            <span class="auto-run-dot" aria-hidden="true" />
            <div>
              <strong>样本已自动运行</strong>
              <p>请在终端核对输出；程序退出后可按终端中的路径再次运行。</p>
            </div>
          </div>

          <fieldset
            v-else-if="['question', 'prediction'].includes(currentStep.type) && currentStep.question"
            class="question"
          >
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
            v-if="['partial-command', 'manual-command', 'terminal'].includes(currentStep.type) && !currentStep.autoRun"
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
              (actionPerformed || ['manual-command', 'terminal'].includes(currentStep.type)) &&
              !currentStepResolved
            "
            type="button"
            class="btn-evidence"
            @click="confirmObservation"
          >
            {{
              ['manual-command', 'terminal'].includes(currentStep.type) && !actionPerformed && !currentStep.autoRun
                ? '我已在真实终端完成并核对观察点'
                : currentStep.autoRun
                  ? '我已核对自动运行的输出'
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

          <nav class="step-navigation" aria-label="教学步骤导航">
            <button
              v-if="hasPreviousStep"
              type="button"
              class="btn-step-back"
              @click="showPreviousStep"
            >
              ← 返回上一步
            </button>
            <button
              v-if="hasRevealedNextStep"
              type="button"
              class="btn-advance"
              @click="showNextRevealedStep"
            >
              前往下一步 →
            </button>
            <button
              v-else-if="currentStepResolved && hasNextStep"
              type="button"
              class="btn-advance"
              @click="advanceStep"
            >
              进入下一步 →
            </button>
          </nav>
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

        <HintStack
          :hints="level.hints"
          :hints-used="hintsUsed"
          :lab-id="level.labId"
          @use-hint="emit('use-hint', $event)"
        />

        <section v-if="mode === 'guided' && completedConcepts.length > 0" class="mastery-strip">
          <h3>已掌握能力</h3>
          <span v-for="concept in completedConcepts" :key="concept.id">{{ concept.term }}</span>
        </section>

        <DebuggerControls
          v-if="level.verificationType === 'debugger-state'"
          :state="debuggerState ?? 'idle'"
          :checkpoint="level.verification.debuggerCheckpoint"
          @launch="emit('debugger-launch')"
          @command="emit('debugger-command', $event)"
        />
        <EvidenceForm
          v-else
          :verification="level.verification"
          :available="verificationAvailable"
          :total-steps="level.steps.length"
          :lab-id="level.labId"
          @run-command="emit('run-command', $event)"
        />
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

.auto-run-state {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 13px;
  padding: 10px 11px;
  color: var(--text-secondary);
  background: var(--surface-0);
  border: var(--hairline) solid var(--accent-green-border);
  border-radius: 7px;
}

.auto-run-state strong {
  color: var(--accent-green);
  font-size: 13px;
}

.auto-run-state p {
  margin: 3px 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.55;
}

.auto-run-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  margin-top: 5px;
  background: var(--accent-green);
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--accent-green-soft);
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

.step-navigation {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 13px;
}

.step-navigation .btn-advance {
  margin-top: 0;
}

.btn-step-back {
  min-height: 44px;
  padding: 9px 11px;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 700;
  background: var(--surface-2);
  border: var(--hairline) solid var(--border-strong);
  border-radius: 7px;
  cursor: pointer;
}

.step-navigation > :only-child {
  grid-column: 1 / -1;
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
