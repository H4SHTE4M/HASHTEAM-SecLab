<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { GuideStep, LabMode, LevelDef } from '../types/lab'
import LevelCompleteDialog from './LevelCompleteDialog.vue'

const props = defineProps<{
  level: LevelDef
  completed: boolean
  hintsUsed: number
  isLast: boolean
  mode: LabMode
  guideStep: number
}>()

const emit = defineEmits<{
  (e: 'next'): void
  (e: 'use-hint', level: number): void
  (e: 'run-command', command: string): void
  (e: 'advance-guide', level: number, totalSteps: number): void
  (e: 'change-mode', mode: LabMode): void
}>()

const visibleHints = computed(() => props.level.hints.slice(0, props.hintsUsed))
const hasMoreHints = computed(() => props.hintsUsed < props.level.hints.length)
const guide = computed(() => props.level.guide ?? [])
const currentGuideIndex = computed(() => {
  if (guide.value.length === 0) return 0
  return Math.min(props.guideStep, guide.value.length - 1)
})
const currentGuide = computed<GuideStep | undefined>(() => guide.value[currentGuideIndex.value])
const viewedGuide = computed(() => guide.value.slice(0, currentGuideIndex.value))
const hasNextGuide = computed(() => currentGuideIndex.value < guide.value.length - 1)
const panelScrollRef = ref<HTMLElement | null>(null)
const showCompletionPrompt = ref(false)

watch(
  () => props.completed,
  (completed, wasCompleted) => {
    if (!completed || wasCompleted) return
    showCompletionPrompt.value = true
    void nextTick(() => {
      if (panelScrollRef.value !== null) panelScrollRef.value.scrollTop = 0
    })
  },
)

watch(
  () => props.level.id,
  () => {
    showCompletionPrompt.value = false
  },
)

function isCommandTemplate(command: string): boolean {
  return /<[^<>\n]+>/.test(command)
}

function runGuideCommand(command: string): void {
  if (isCommandTemplate(command)) return
  emit('run-command', command)
}

function enterNextLevel(): void {
  showCompletionPrompt.value = false
  emit('next')
}
</script>

<template>
  <aside class="mission-panel">
    <div ref="panelScrollRef" class="panel-scroll">
      <header class="level-header">
        <span class="level-badge">第 {{ level.id }} 关</span>
        <span class="mode-badge">{{ mode === 'guided' ? '引导模式' : '挑战模式' }}</span>
        <span v-if="completed" class="done-badge" role="status" aria-live="polite">✓ 已完成</span>
      </header>
      <h2 class="level-name">{{ level.name }}</h2>
      <p class="level-tagline">{{ level.tagline }}</p>

      <section class="story-block">
        <h3>任务背景</h3>
        <p class="story">{{ level.story }}</p>
      </section>

      <template v-if="completed">
        <section class="completion-card" role="status">
          <span class="completion-mark">✓</span>
          <div>
            <h3>验证通过</h3>
            <p>你完成了本关的真实环境检查。</p>
          </div>
        </section>

        <section class="next-level-callout" aria-label="下一步">
          <span>{{ isLast ? '全部关卡已经完成' : `第 ${level.id + 1} 关已经解锁` }}</span>
          <button type="button" class="btn-next" @click="enterNextLevel">
            {{ isLast ? '查看通关总结 →' : `立即进入第 ${level.id + 1} 关 →` }}
          </button>
          <p>也可以继续向下查看本关知识总结。</p>
        </section>

        <section v-if="level.takeaway" class="takeaway">
          <h3>这一关的意义</h3>
          <p>{{ level.takeaway }}</p>
        </section>

        <section v-if="level.concepts && level.concepts.length > 0" class="block">
          <h3>核心概念</h3>
          <dl class="concepts">
            <div v-for="concept in level.concepts" :key="concept.term" class="concept">
              <dt>{{ concept.term }}</dt>
              <dd>{{ concept.explanation }}</dd>
            </div>
          </dl>
        </section>

        <section class="block">
          <h3>你已经学会</h3>
          <div class="teaches">
            <span v-for="item in level.teaches" :key="item" class="teach-tag">{{ item }}</span>
          </div>
        </section>

      </template>

      <template v-else-if="mode === 'guided'">
        <details class="goals-details">
          <summary>查看本关全部目标（{{ level.goals.length }} 项）</summary>
          <ul class="goals">
            <li v-for="goal in level.goals" :key="goal">{{ goal }}</li>
          </ul>
        </details>

        <section v-if="currentGuide" class="current-action" aria-live="polite">
          <header class="action-header">
            <div>
              <span class="action-eyebrow">现在只做这一件事</span>
              <h3>第 {{ currentGuideIndex + 1 }} / {{ guide.length }} 步</h3>
            </div>
            <span class="step-progress" aria-hidden="true">
              <i
                v-for="(_, index) in guide"
                :key="index"
                :class="{ active: index <= currentGuideIndex }"
              />
            </span>
          </header>

          <button
            v-if="currentGuide.command && !isCommandTemplate(currentGuide.command)"
            type="button"
            class="command-run"
            :title="`在终端中运行：${currentGuide.command}`"
            @click="runGuideCommand(currentGuide.command)"
          >
            <span>点击运行</span>
            <code>{{ currentGuide.command }}</code>
          </button>
          <div
            v-else-if="currentGuide.command"
            class="command-template"
            aria-label="需要替换内容的命令模板"
          >
            <span>命令模板 · 先替换尖括号内容</span>
            <code>{{ currentGuide.command }}</code>
          </div>

          <p class="guide-note">{{ currentGuide.note }}</p>

          <button
            v-if="hasNextGuide"
            type="button"
            class="btn-advance"
            @click="emit('advance-guide', level.id, guide.length)"
          >
            我已尝试并看到结果，下一步 →
          </button>
          <p v-else class="last-step-note">
            这是最后一步。完成操作后，用下方的验证命令检查结果。
          </p>
        </section>

        <details v-if="viewedGuide.length > 0" class="history-details">
          <summary>已查看步骤（{{ viewedGuide.length }}）</summary>
          <ol class="history-list">
            <li v-for="(step, index) in viewedGuide" :key="index">
              <span class="history-check">✓</span>
              <div>
                <button
                  v-if="step.command && !isCommandTemplate(step.command)"
                  type="button"
                  class="history-command"
                  @click="runGuideCommand(step.command)"
                >
                  {{ step.command }}
                </button>
                <code v-else-if="step.command" class="history-template">{{ step.command }}</code>
                <p>{{ step.note }}</p>
              </div>
            </li>
          </ol>
        </details>

        <section class="block compact-block">
          <h3>卡住了？</h3>
          <ol v-if="visibleHints.length > 0" class="hints">
            <li v-for="hint in visibleHints" :key="hint">{{ hint }}</li>
          </ol>
          <button
            v-if="hasMoreHints"
            type="button"
            class="btn-hint"
            @click="emit('use-hint', level.id)"
          >
            显示一条提示（{{ hintsUsed + 1 }} / {{ level.hints.length }}）
          </button>
          <p v-else class="hint-note">提示已全部展开，也可以在终端输入 hint。</p>
        </section>

        <section class="verification">
          <h3>最终验证</h3>
          <p>在终端中运行：</p>
          <code>{{ level.checkUsage }}</code>
        </section>
      </template>

      <template v-else>
        <section class="block">
          <h3>当前目标</h3>
          <ul class="goals">
            <li v-for="goal in level.goals" :key="goal">{{ goal }}</li>
          </ul>
        </section>

        <section class="verification">
          <h3>最终验证</h3>
          <p>完成目标后，在终端中运行：</p>
          <code>{{ level.checkUsage }}</code>
        </section>

        <button type="button" class="btn-switch" @click="emit('change-mode', 'guided')">
          需要分步带领？切换到引导模式
        </button>

        <details class="commands-details">
          <summary>展开命令备忘（可能包含解题方向）</summary>
          <div class="static-commands">
            <code v-for="command in level.suggestedCommands" :key="command">{{ command }}</code>
          </div>
        </details>

        <section class="block compact-block">
          <h3>提示</h3>
          <ol v-if="visibleHints.length > 0" class="hints">
            <li v-for="hint in visibleHints" :key="hint">{{ hint }}</li>
          </ol>
          <button
            v-if="hasMoreHints"
            type="button"
            class="btn-hint"
            @click="emit('use-hint', level.id)"
          >
            显示一条提示（{{ hintsUsed + 1 }} / {{ level.hints.length }}）
          </button>
          <p v-else class="hint-note">提示已全部展开，也可以在终端输入 hint。</p>
        </section>
      </template>
    </div>
    <LevelCompleteDialog
      v-if="showCompletionPrompt"
      :level-id="level.id"
      :level-name="level.name"
      :is-last="isLast"
      @next="enterNextLevel"
      @dismiss="showCompletionPrompt = false"
    />
  </aside>
</template>

<style scoped>
.mission-panel {
  height: 100%;
  overflow: hidden;
  background: #0f1830;
  border-left: 1px solid #1c2a44;
}

.panel-scroll {
  height: 100%;
  overflow-y: auto;
  padding: 18px 20px 24px;
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
  padding: 2px 9px;
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

.story-block,
.block {
  margin-top: 15px;
}

.story-block h3,
.block h3,
.verification h3,
.takeaway h3 {
  margin: 0 0 7px;
  color: #93a5c6;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.story {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: #c7d3e8;
  font-size: 13px;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.goals-details,
.history-details,
.commands-details {
  margin-top: 14px;
  color: #93a5c6;
  font-size: 13px;
}

summary {
  cursor: pointer;
}

.goals {
  margin: 8px 0 0;
  padding-left: 18px;
  color: #c7d3e8;
  font-size: 13px;
  line-height: 1.7;
}

.current-action {
  margin-top: 14px;
  padding: 15px;
  background: linear-gradient(145deg, rgba(56, 189, 248, 0.1), rgba(17, 28, 51, 0.9));
  border: 1px solid rgba(56, 189, 248, 0.35);
  border-radius: 10px;
}

.action-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.action-eyebrow {
  display: block;
  margin-bottom: 3px;
  color: #7dd3fc;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.action-header h3 {
  margin: 0;
  color: #eef3fc;
  font-size: 14px;
}

.step-progress {
  display: flex;
  gap: 3px;
  padding-top: 5px;
}

.step-progress i {
  width: 12px;
  height: 3px;
  background: #2a3a5c;
  border-radius: 2px;
}

.step-progress i.active {
  background: #38bdf8;
}

.command-run,
.command-template {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  margin-top: 13px;
  padding: 10px 12px;
  text-align: left;
  background: #0b1220;
  border-radius: 7px;
  box-sizing: border-box;
}

.command-run {
  color: #a8e6c0;
  border: 1px solid #2b7553;
  cursor: pointer;
}

.command-run:hover {
  background: #10251f;
}

.command-template {
  color: #ffd580;
  border: 1px solid rgba(255, 213, 128, 0.35);
}

.command-run span,
.command-template span {
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.command-run code,
.command-template code {
  max-width: 100%;
  overflow-x: auto;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  white-space: nowrap;
}

.guide-note {
  margin: 12px 0 0;
  color: #c7d3e8;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-line;
}

.btn-advance {
  width: 100%;
  margin-top: 13px;
  padding: 9px 10px;
  color: #06121f;
  font-size: 13px;
  font-weight: 700;
  background: #38bdf8;
  border: none;
  border-radius: 7px;
  cursor: pointer;
}

.btn-advance:hover,
.btn-next:hover {
  background: #5ccbf9;
}

.last-step-note {
  margin: 12px 0 0;
  color: #7fdba7;
  font-size: 12px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.history-list li {
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 7px;
}

.history-check {
  color: #7fdba7;
}

.history-command,
.history-template {
  max-width: 100%;
  overflow-x: auto;
  padding: 0;
  color: #a8c7fa;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 11px;
  text-align: left;
  white-space: nowrap;
  background: none;
  border: none;
}

.history-command {
  cursor: pointer;
}

.history-command:hover {
  color: #7dd3fc;
}

.history-list p {
  margin: 4px 0 0;
  color: #7d8aa5;
  font-size: 12px;
  line-height: 1.55;
}

.compact-block {
  padding-top: 13px;
  border-top: 1px solid #1c2a44;
}

.hints {
  margin: 0 0 9px;
  padding-left: 18px;
  color: #b8c5dd;
  font-size: 12px;
  line-height: 1.65;
}

.btn-hint,
.btn-switch {
  padding: 7px 11px;
  font-size: 12px;
  border-radius: 7px;
  cursor: pointer;
}

.btn-hint {
  color: #ffd580;
  background: rgba(255, 213, 128, 0.08);
  border: 1px solid rgba(255, 213, 128, 0.3);
}

.btn-switch {
  width: 100%;
  margin-top: 14px;
  color: #7dd3fc;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.hint-note {
  margin: 0;
  color: #66779a;
  font-size: 12px;
}

.verification {
  margin-top: 14px;
  padding: 11px 12px;
  background: rgba(127, 219, 167, 0.06);
  border: 1px solid rgba(127, 219, 167, 0.22);
  border-radius: 8px;
}

.verification p {
  margin: 0 0 7px;
  color: #93a5c6;
  font-size: 12px;
}

.verification code,
.static-commands code {
  display: block;
  overflow-x: auto;
  color: #7fdba7;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  white-space: nowrap;
}

.static-commands {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 10px;
  padding: 10px;
  background: #111c33;
  border-radius: 7px;
}

.completion-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding: 13px;
  background: rgba(127, 219, 167, 0.08);
  border: 1px solid rgba(127, 219, 167, 0.3);
  border-radius: 9px;
}

.next-level-callout {
  margin-top: 12px;
  padding: 13px;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.38);
  border-radius: 9px;
}

.next-level-callout > span {
  display: block;
  margin-bottom: 8px;
  color: #7dd3fc;
  font-size: 12px;
  font-weight: 700;
}

.next-level-callout p {
  margin: 7px 0 0;
  color: #7d8aa5;
  font-size: 11px;
  text-align: center;
}

.completion-mark {
  width: 32px;
  height: 32px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  color: #06121f;
  font-weight: 800;
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

.completion-card p {
  margin-top: 3px;
  color: #93a5c6;
  font-size: 12px;
}

.takeaway {
  margin-top: 15px;
  padding: 14px;
  background: #111c33;
  border-radius: 9px;
}

.takeaway h3 {
  color: #7fdba7;
}

.takeaway p,
.concept dd {
  margin: 0;
  color: #c7d3e8;
  font-size: 12px;
  line-height: 1.65;
}

.concepts {
  display: flex;
  flex-direction: column;
  gap: 11px;
  margin: 0;
}

.concept dt {
  margin-bottom: 3px;
  color: #7dd3fc;
  font-size: 12px;
  font-weight: 700;
}

.teaches {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.teach-tag {
  padding: 3px 9px;
  color: #93a5c6;
  font-size: 11px;
  background: #111c33;
  border: 1px solid #22314f;
  border-radius: 999px;
}

.btn-next {
  width: 100%;
  padding: 11px;
  color: #06121f;
  font-size: 15px;
  font-weight: 800;
  background: #38bdf8;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(56, 189, 248, 0.18);
}
</style>
