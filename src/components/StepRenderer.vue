<script setup lang="ts">
import { computed } from 'vue'
import type { CourseStep, LearningStep } from '../types/lab'
import type { BinaryWorkbenchSnapshot } from '../types/binary'
import BinaryWorkbench from './BinaryWorkbench.vue'
import ExternalToolCompanion from './ExternalToolCompanion.vue'

const props = defineProps<{
  step: LearningStep | CourseStep
  stepIndex: number
  totalSteps: number
  completedStepIds: number[]
  workbenchSnapshot?: BinaryWorkbenchSnapshot
}>()

const emit = defineEmits<{
  (e: 'write-command', command: string): void
  (e: 'external-complete'): void
}>()

function submitExternalObservation(payload: { command: string }): void {
  emit('write-command', payload.command)
  emit('external-complete')
}

const headingId = computed(() => `course-step-${props.step.id}-heading`)

function stepTypeLabel(type: CourseStep['type']): string {
  const labels: Record<CourseStep['type'], string> = {
    explain: '必要知识',
    observe: '运行并观察',
    'partial-command': '补全命令',
    'manual-command': '独立输入',
    question: '根据输出判断',
    checkpoint: '中间检查',
    reflection: '方法回顾',
    concept: '概念',
    terminal: '终端观察',
    prediction: '预测',
    'visual-trace': '状态追踪',
    'external-tool': '外部工具',
    worksheet: '分析记录',
    'payload-builder': 'Payload 组装',
  }
  return labels[type]
}
</script>

<template>
  <div class="step-renderer" :data-step-type="step.type" :aria-labelledby="headingId">
    <header class="action-header">
      <div>
        <span class="action-eyebrow">{{ stepTypeLabel(step.type) }}</span>
        <h3 :id="headingId" tabindex="-1">
          第 {{ stepIndex + 1 }} / {{ totalSteps }} 步 · {{ step.title }}
        </h3>
      </div>
      <span class="step-progress" aria-hidden="true">
        <i
          v-for="index in totalSteps"
          :key="index"
          :class="{
            active: index <= step.id,
            done: completedStepIds.includes(index),
          }"
        />
      </span>
    </header>

    <p class="step-objective"><strong>这一步要做到：</strong>{{ step.objective }}</p>

    <div v-for="concept in step.introduces" :key="concept.id" class="concept-card">
      <span>首次出现</span>
      <h4>{{ concept.term }}</h4>
      <p>{{ concept.explanation }}</p>
    </div>

    <p class="step-instruction">{{ step.instruction }}</p>

    <BinaryWorkbench
      v-if="step.type === 'visual-trace'"
      :snapshot="workbenchSnapshot ?? step.workbench"
      :initial-tab="step.initialTab"
    />
    <BinaryWorkbench
      v-else-if="step.type === 'terminal' && workbenchSnapshot"
      :snapshot="workbenchSnapshot"
    />
    <BinaryWorkbench
      v-else-if="step.type === 'payload-builder'"
      initial-tab="payload"
      :payload-preset="step.payload"
      show-payload
      @write-command="emit('write-command', $event)"
    />
    <ExternalToolCompanion
      v-else-if="step.type === 'external-tool'"
      :definition="step.companion"
      @submit="submitExternalObservation"
    />

    <div v-if="step.observation && step.type !== 'checkpoint'" class="observation-box">
      <span>运行后观察</span>
      <p>{{ step.observation }}</p>
    </div>
  </div>
</template>

<style scoped>
.step-renderer { display: contents; }
.action-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.action-eyebrow { color: var(--accent-cyan); font-size: 11px; font-weight: 750; }
.action-header h3 { margin: 3px 0 0; color: var(--text-primary); font-size: 16px; font-weight: 680; line-height: 1.45; }
.action-header h3:focus { outline: none; }
.action-header h3:focus-visible { border-radius: 4px; outline: 2px solid var(--accent-cyan); outline-offset: 3px; }
.step-progress { display: flex; flex: 0 0 auto; gap: 3px; padding-top: 5px; }
.step-progress i { width: 5px; height: 5px; background: var(--border-strong); border-radius: 50%; }
.step-progress i.active { background: var(--accent-cyan); }
.step-progress i.done { box-shadow: 0 0 0 2px var(--accent-green-soft); }
.step-objective { margin: 12px 0 0; color: var(--text-secondary); font-size: 14px; line-height: 1.65; }
.step-objective strong { color: var(--text-primary); }
.concept-card { margin-top: 11px; padding: 10px 11px; background: var(--accent-cyan-soft); border-left: 3px solid var(--accent-cyan); border-radius: 6px; }
.concept-card > span { color: var(--accent-cyan); font-size: 10px; font-weight: 750; }
.concept-card h4 { margin: 3px 0 0; color: var(--text-primary); font-size: 14px; }
.concept-card p { margin: 4px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.65; }
.step-instruction { margin: 12px 0 0; color: var(--text-secondary); font-size: 15px; line-height: 1.72; }
.observation-box { margin-top: 11px; padding: 9px 10px; background: var(--surface-2); border-radius: 6px; }
.observation-box span { color: var(--accent-amber); font-size: 11px; font-weight: 750; }
.observation-box p { margin: 3px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.65; }
</style>
