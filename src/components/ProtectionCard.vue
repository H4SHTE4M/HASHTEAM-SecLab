<script setup lang="ts">
import type { ProtectionName, ProtectionSnapshot, ProtectionState } from '../types/binary'

defineProps<{ snapshot: ProtectionSnapshot }>()

const names: Record<ProtectionName, string> = {
  architecture: '架构',
  nx: 'NX',
  pie: 'PIE',
  canary: 'Canary',
  relro: 'RELRO',
  symbols: '符号',
}

const states: Record<ProtectionState, string> = {
  enabled: '启用',
  disabled: '关闭',
  partial: '部分',
  present: '存在',
  stripped: '已剥离',
  unknown: '未知',
}
</script>

<template>
  <section class="protection-card" aria-labelledby="protection-title">
    <h4 id="protection-title">保护机制证据</h4>
    <dl v-if="snapshot.entries.length > 0">
      <div v-for="entry in snapshot.entries" :key="entry.name">
        <dt>{{ names[entry.name] }}</dt>
        <dd><span :data-state="entry.state">{{ states[entry.state] }}</span><code>{{ entry.evidence }}</code></dd>
      </div>
    </dl>
    <p v-else class="empty-state">当前没有保护状态证据。</p>
  </section>
</template>

<style scoped>
h4 { margin: 0 0 10px; color: var(--text-primary); font-size: 13px; }
dl { margin: 0; }
dl > div { min-height: 48px; display: grid; grid-template-columns: 82px minmax(0, 1fr); align-items: center; gap: 10px; padding: 6px 8px; border-top: var(--hairline) solid var(--border-subtle); }
dt { color: var(--text-primary); font-size: 12px; font-weight: 700; }
dd { min-width: 0; display: grid; grid-template-columns: 54px minmax(0, 1fr); align-items: center; gap: 8px; margin: 0; }
dd span { padding: 4px 6px; color: var(--text-faint); font-size: 10px; text-align: center; background: var(--surface-2); border-radius: 4px; }
dd span[data-state='enabled'],
dd span[data-state='present'] { color: var(--accent-green); background: var(--accent-green-soft); }
dd span[data-state='disabled'],
dd span[data-state='stripped'] { color: var(--accent-coral); background: color-mix(in srgb, var(--accent-coral) 10%, transparent); }
dd span[data-state='partial'] { color: var(--accent-amber); background: var(--accent-amber-soft); }
dd code { overflow: hidden; color: var(--text-muted); font: 11px/1.5 var(--font-mono); text-overflow: ellipsis; white-space: nowrap; }
.empty-state { padding: 18px 0; color: var(--text-faint); font-size: 12px; text-align: center; }
</style>
