<script setup lang="ts">
import { computed } from 'vue'
import { CTF_POSITIONING, LAB_DIRECTIONS, LEVELS } from '../data/levels'
import type { CompletionPath, CourseDef, LevelCompletionRecord } from '../types/lab'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  completionRecords: Record<number, LevelCompletionRecord>
  course?: CourseDef
  labCompletionRecords?: Record<string, LevelCompletionRecord>
}>()

const emit = defineEmits<{
  (e: 'exit'): void
  (e: 'restart'): void
}>()

const activeRecords = computed(() =>
  props.course === undefined
    ? Object.values(props.completionRecords)
    : props.course.labs
        .map((lab) => props.labCompletionRecords?.[lab.labId])
        .filter((record): record is LevelCompletionRecord => record !== undefined),
)

const completionItems = computed(() =>
  props.course?.labs.map((lab) => ({
    id: lab.labId,
    title: lab.title,
    record: props.labCompletionRecords?.[lab.labId],
  })) ?? [],
)

const pathCounts = computed(() => {
  const counts: Record<CompletionPath, number> = {
    guided: 0,
    challenge: 0,
    mixed: 0,
  }
  activeRecords.value.forEach((record) => {
    counts[record.path] += 1
  })
  return counts
})

const noHintChallenges = computed(
  () =>
    activeRecords.value.filter(
      (record) => record.path === 'challenge' && record.hintsUsed === 0,
    ).length,
)

function recordLabel(record?: LevelCompletionRecord): string {
  if (!record) return '未完成'
  const path =
    record.path === 'challenge'
      ? '挑战通关'
      : record.path === 'mixed'
        ? '混合完成'
        : '引导通关'
  const hints = record.hintsUsed === 0 ? '未使用提示' : `${record.hintsUsed} 层提示`
  return `${path} · ${hints}`
}
</script>

<template>
  <main class="completion-page">
    <div class="completion-inner">
      <p class="congrats-badge"><AppIcon name="trophy" :size="16" /> 全部实验完成</p>
      <h1 class="title">
        {{ course === undefined ? '欢迎加入 HASHTEAM 的世界' : 'PwnHub 首批课程已完成' }}
      </h1>
      <p v-if="course === undefined" class="intro">
        你已经在真实的 Linux 终端里完成了身份确认、文件整理、隐藏信息探索、
        权限收紧、日志分析、编码还原、进程排查、Web 信息收集和配置修复——
        这正是安全工作的日常缩影。
      </p>
      <p v-else class="intro">
        你已从内存模型走到汇编与 ELF 静态分析，并完成了真实 i386 实验的验证。
        后续章节会按发布计划逐步开放。
      </p>

      <section class="completion-records">
        <h2>你的完成路径</h2>
        <div class="record-stats">
          <span><strong>{{ pathCounts.challenge }}</strong> 挑战通关</span>
          <span><strong>{{ pathCounts.guided }}</strong> 引导通关</span>
          <span><strong>{{ pathCounts.mixed }}</strong> 混合完成</span>
          <span><strong>{{ noHintChallenges }}</strong> 无提示挑战</span>
        </div>
        <ul v-if="course === undefined" class="record-list">
          <li v-for="level in LEVELS" :key="level.id">
            <span>第 {{ level.id }} 关 · {{ level.name }}</span>
            <strong :class="completionRecords[level.id]?.path">
              {{ recordLabel(completionRecords[level.id]) }}
            </strong>
          </li>
        </ul>
        <ul v-else class="record-list">
          <li v-for="item in completionItems" :key="item.id">
            <span>{{ item.title }}</span>
            <strong :class="item.record?.path">{{ recordLabel(item.record) }}</strong>
          </li>
        </ul>
      </section>

      <section v-if="course === undefined" class="directions">
        <h2>实验室在做什么</h2>
        <div class="direction-grid">
          <article v-for="d in LAB_DIRECTIONS" :key="d.name" class="direction-card">
            <h3>{{ d.name }}</h3>
            <p>{{ d.description }}</p>
          </article>
        </div>
      </section>

      <section v-if="course === undefined" class="ctf-note">
        <h2>关于 CTF</h2>
        <p>{{ CTF_POSITIONING }}</p>
      </section>

      <div class="completion-actions">
        <button type="button" class="btn-exit" @click="emit('exit')">
          <AppIcon name="hash" :size="17" />
          返回 Lab 选择器
        </button>
        <button type="button" class="btn-restart" @click="emit('restart')">
          <AppIcon name="rotate-ccw" :size="17" />
          重新开始体验
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.completion-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: calc(48px + var(--safe-top)) calc(24px + var(--safe-right)) calc(48px + var(--safe-bottom)) calc(24px + var(--safe-left));
  background: var(--bg-canvas);
}

.completion-inner {
  max-width: 860px;
  margin: 0 auto;
  text-align: center;
  animation: completion-page-in 420ms var(--ease-out) both;
}

.congrats-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  color: var(--accent-green);
  background: var(--accent-green-soft);
  border: var(--hairline) solid var(--accent-green-border);
  padding: 6px 18px;
  border-radius: 6px;
  margin: 0 0 20px;
}

.title {
  margin: 0 0 16px;
  font-family: var(--font-display);
  font-size: 38px;
  font-weight: 760;
  line-height: 1.22;
  color: var(--text-primary);
}

.intro {
  margin: 0 auto 40px;
  max-width: 640px;
  font-size: 16px;
  line-height: 1.85;
  color: var(--text-secondary);
}

.directions h2,
.completion-records h2,
.ctf-note h2 {
  font-size: 14px;
  font-weight: 720;
  color: var(--text-muted);
  margin: 0 0 18px;
}

.completion-records {
  margin-bottom: 40px;
}

.record-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.record-stats span {
  padding: 13px 8px;
  color: var(--text-muted);
  font-size: 12px;
  background: var(--surface-1);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 8px;
}

.record-stats strong {
  display: block;
  margin-bottom: 3px;
  color: var(--text-primary);
  font-size: 20px;
}

.record-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  text-align: left;
  list-style: none;
}

.record-list li {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  color: var(--text-secondary);
  font-size: 12px;
  background: var(--surface-1);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 7px;
}

.record-list strong {
  color: var(--text-faint);
  font-size: 11px;
}

.record-list strong.challenge {
  color: var(--accent-violet);
}

.record-list strong.guided {
  color: var(--accent-green);
}

.record-list strong.mixed {
  color: var(--accent-amber);
}

.direction-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 14px;
  margin-bottom: 40px;
  text-align: left;
}

.direction-card {
  background: var(--surface-1);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 8px;
  padding: 20px 22px;
  transition: transform var(--duration-normal) var(--ease-out), border-color var(--duration-normal) ease, background-color var(--duration-normal) ease, box-shadow var(--duration-normal) ease;
}

.direction-card:hover {
  background: var(--surface-2);
  border-color: var(--border-strong);
  box-shadow: var(--shadow-control);
  transform: translateY(-2px);
}

.direction-card h3 {
  margin: 0 0 8px;
  font-family: var(--font-display);
  font-size: 17px;
  color: var(--accent-cyan);
}

.direction-card p {
  margin: 0;
  font-size: 14px;
  line-height: 1.78;
  color: var(--text-secondary);
}

.ctf-note {
  max-width: 680px;
  margin: 0 auto 40px;
  padding: 20px 24px;
  background: var(--surface-1);
  border-left: 3px solid var(--accent-coral);
  border-radius: 0 8px 8px 0;
}

.ctf-note p {
  margin: 0;
  font-size: 14px;
  line-height: 1.9;
  color: var(--text-secondary);
  text-align: left;
}

.completion-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}

.btn-exit,
.btn-restart {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 28px;
  font-size: 15px;
  font-weight: 720;
  color: var(--text-primary);
  background: var(--surface-raised);
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  cursor: pointer;
  box-shadow: var(--shadow-control);
}

.btn-exit:hover {
  background: var(--surface-hover);
  transform: translateY(-1px);
}

.btn-restart {
  color: var(--accent-cyan-contrast);
  background: var(--accent-cyan);
  border-color: var(--accent-cyan);
}

.btn-restart:hover {
  background: var(--accent-cyan-hover);
  box-shadow: 0 10px 28px rgba(101, 212, 206, 0.2), inset 0 1px rgba(255, 255, 255, 0.28);
  transform: translateY(-1px);
}

@keyframes completion-page-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 640px) {
  .completion-page {
    padding: calc(28px + var(--safe-top)) calc(16px + var(--safe-right)) calc(28px + var(--safe-bottom)) calc(16px + var(--safe-left));
  }

  .title {
    font-size: 28px;
  }

  .intro {
    margin-bottom: 30px;
    font-size: 14px;
  }

  .direction-grid {
    grid-template-columns: minmax(0, 1fr);
    margin-bottom: 30px;
  }

  .record-stats,
  .record-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ctf-note {
    margin-bottom: 30px;
    padding: 16px 18px;
  }
}

@media (max-width: 360px) {
  .completion-page {
    padding-inline: calc(12px + var(--safe-left)) calc(12px + var(--safe-right));
  }

  .congrats-badge {
    padding-inline: 12px;
  }

  .record-stats,
  .record-list {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
