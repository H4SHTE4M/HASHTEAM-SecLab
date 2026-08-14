<script setup lang="ts">
import { computed } from 'vue'
import type { CourseLabDef, LabMode, LevelCompletionRecord } from '../types/lab'
import type { ExternalToolCourseStep } from '../types/lab'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  level: CourseLabDef
  completed: boolean
  mode: LabMode
  completionRecord?: LevelCompletionRecord
}>()

const emit = defineEmits<{
  (e: 'change-mode', mode: LabMode): void
}>()

const completionRecordLabel = computed(() => {
  if (!props.completionRecord) return '历史完成'
  const path =
    props.completionRecord.path === 'challenge'
      ? '挑战通关'
      : props.completionRecord.path === 'mixed'
        ? '混合完成'
        : '引导通关'
  const hints =
    props.completionRecord.hintsUsed === 0
      ? '未使用提示'
      : `展开 ${props.completionRecord.hintsUsed} 层提示`
  return `${path} · ${hints}`
})

const hasDistinctStory = computed(() => props.level.story.trim() !== props.level.storySummary.trim())
const externalArtifact = computed(() => {
  if (props.level.kind !== 'external-tool') return null
  const step = props.level.steps.find(
    (item): item is ExternalToolCourseStep => item.type === 'external-tool',
  )
  return step?.companion.artifact ?? null
})
</script>

<template>
  <section class="lab-brief" aria-labelledby="lab-brief-title">
    <header class="level-header">
      <span class="level-badge">实验 {{ String(level.id).padStart(2, '0') }}</span>
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

    <h2 id="lab-brief-title" class="level-name">{{ level.name }}</h2>
    <p class="level-tagline">{{ level.tagline }}</p>

    <a
      v-if="externalArtifact"
      class="sample-download"
      :href="externalArtifact.downloadUrl"
      download
    >
      <AppIcon name="download" :size="15" />
      下载实验样本
      <small>{{ externalArtifact.architecture }} · SHA-256 {{ externalArtifact.sha256 }}</small>
    </a>

    <details class="story-details">
      <summary><span>任务背景</span></summary>
      <p class="story-summary">{{ level.storySummary }}</p>
      <p v-if="hasDistinctStory">{{ level.story }}</p>
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
    </template>

    <section v-else class="goals-block">
      <h3>当前目标</h3>
      <ul>
        <li v-for="goal in level.goals" :key="goal">{{ goal }}</li>
      </ul>
      <details v-if="mode === 'guided' && level.prerequisites.length > 0">
        <summary>本实验会复用的能力</summary>
        <ul>
          <li v-for="item in level.prerequisites" :key="item">{{ item }}</li>
        </ul>
      </details>
    </section>
  </section>
</template>

<style scoped>
.lab-brief { display: contents; }
.level-header { display: flex; align-items: center; gap: 8px; }
.level-badge,
.mode-badge,
.done-badge {
  display: inline-flex;
  min-height: 23px;
  align-items: center;
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
  border-radius: 5px;
}
.level-badge { color: var(--accent-cyan); background: var(--accent-cyan-soft); border: var(--hairline) solid var(--accent-cyan-border); }
.mode-badge { color: var(--accent-cyan); background: var(--surface-2); border: var(--hairline) solid var(--border-subtle); cursor: pointer; }
.done-badge { margin-left: auto; color: var(--accent-green); background: var(--accent-green-soft); border: var(--hairline) solid var(--accent-green-border); }
.level-name { margin: 8px 0 3px; color: var(--text-primary); font-family: var(--font-cjk); font-size: 20px; font-weight: 600; line-height: 1.4; }
.level-tagline { margin: 0; color: var(--text-faint); font-size: 13px; line-height: 1.6; }
.sample-download { min-height: 38px; display: flex; align-items: center; gap: 7px; margin-top: 12px; padding: 7px 9px; overflow: hidden; color: var(--accent-cyan); font-size: 12px; font-weight: 700; text-decoration: none; background: var(--accent-cyan-soft); border: var(--hairline) solid var(--accent-cyan-border); border-radius: 6px; }
.sample-download small { min-width: 0; margin-left: auto; overflow: hidden; color: var(--text-faint); font: 9px/1.4 var(--font-mono); text-overflow: ellipsis; white-space: nowrap; }
.story-details,
.goals-block,
.summary-block { margin-top: var(--space-4); }
.story-details { padding: 11px 12px; background: var(--surface-2); border-radius: 8px; }
.story-details summary,
.goals-block details summary { cursor: pointer; }
.story-details summary { color: var(--text-secondary); font-size: 15px; line-height: 1.7; }
.story-details summary span { color: var(--accent-cyan); font-size: 14px; font-weight: 650; }
.story-details p { margin: 10px 0 0; color: var(--text-secondary); font-size: 15px; line-height: 1.75; }
.story-details p + p { margin-top: 8px; }
.story-details .story-summary { color: var(--text-muted); font-weight: 550; }
.goals-block h3,
.summary-block h3 { margin: 0 0 7px; color: var(--text-muted); font-size: 14px; font-weight: 650; }
.goals-block ul,
.summary-block ul { margin: 0; padding-left: 18px; font-size: 15px; line-height: 1.75; }
.goals-block details { margin-top: 9px; color: var(--text-faint); font-size: 14px; line-height: 1.6; }
.completion-card { display: flex; gap: 12px; margin-top: 16px; padding: 14px; background: var(--accent-green-soft); border: var(--hairline) solid var(--accent-green-border); border-radius: 8px; }
.completion-mark { width: 32px; height: 32px; display: grid; flex: 0 0 auto; place-items: center; color: var(--accent-green-contrast); font-weight: 900; background: var(--accent-green); border-radius: 50%; }
.completion-card h3,
.completion-card p { margin: 0; }
.completion-card h3 { color: var(--accent-green); font-size: 15px; }
.completion-card p { margin-top: 4px; color: var(--text-secondary); font-size: 14px; line-height: 1.7; }
.completion-card .completion-path { color: var(--text-faint); font-size: 11px; font-weight: 750; }
</style>
