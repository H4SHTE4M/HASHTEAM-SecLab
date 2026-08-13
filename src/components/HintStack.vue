<script setup lang="ts">
import { computed } from 'vue'
import type { HintLayer } from '../types/lab'

const props = defineProps<{
  hints: HintLayer[]
  hintsUsed: number
  labId: string
}>()

const emit = defineEmits<{
  (e: 'use-hint', labId: string): void
}>()

const visibleHints = computed(() => props.hints.slice(0, props.hintsUsed))
const hasMoreHints = computed(() => props.hintsUsed < props.hints.length)

function hintKindLabel(kind: HintLayer['kind']): string {
  if (kind === 'direction') return '方向'
  if (kind === 'tool') return '工具'
  return '结构'
}
</script>

<template>
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
      @click="emit('use-hint', labId)"
    >
      展开第 {{ hintsUsed + 1 }} 层提示
    </button>
    <p v-else class="hint-note">最高级提示仍保留需要你填写或判断的关键部分。</p>
  </section>
</template>

<style scoped>
.hints-block { margin-top: var(--space-4); padding-top: 13px; border-top: var(--hairline) solid var(--border-subtle); }
.hints-block h3 { margin: 0 0 7px; color: var(--text-muted); font-size: 14px; font-weight: 650; }
.hints { display: flex; flex-direction: column; gap: 8px; margin: 0 0 9px; padding: 0; list-style: none; font-size: 14px; line-height: 1.72; }
.hints li { padding: 8px 9px; background: var(--accent-amber-soft); border-radius: 6px; }
.hints span { display: block; color: var(--accent-amber); font-size: 11px; font-weight: 700; }
.btn-hint { min-height: 44px; padding: 7px 11px; color: var(--accent-amber); font-size: 14px; font-weight: 650; background: var(--accent-amber-soft); border: var(--hairline) solid var(--accent-amber-border); border-radius: 7px; cursor: pointer; }
.hint-note { margin: 0; color: var(--text-faint); font-size: 13px; }
</style>
