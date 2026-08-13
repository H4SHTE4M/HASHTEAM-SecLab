<script setup lang="ts">
import type { CallTraceSnapshot } from '../types/binary'

defineProps<{ snapshot: CallTraceSnapshot }>()

function hex(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, '0')}`
}
</script>

<template>
  <section class="call-trace" aria-labelledby="call-trace-title">
    <h4 id="call-trace-title">调用轨迹</h4>
    <ol v-if="snapshot.entries.length > 0">
      <li v-for="entry in snapshot.entries" :key="entry.id" :class="entry.kind">
        <span class="trace-mark" aria-hidden="true" />
        <div>
          <strong>{{ entry.functionName }}</strong>
          <code>{{ entry.instruction }}</code>
        </div>
        <small>{{ entry.kind === 'call' ? 'call' : entry.kind === 'return' ? 'ret' : '当前' }} · ESP {{ hex(entry.stackPointer) }}</small>
      </li>
    </ol>
    <p v-else class="empty-state">当前没有可验证的调用轨迹。</p>
  </section>
</template>

<style scoped>
h4 { margin: 0 0 10px; color: var(--text-primary); font-size: 13px; }
ol { margin: 0; padding: 0; list-style: none; }
li { position: relative; min-height: 52px; display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; align-items: center; gap: 8px; }
li:not(:last-child)::after { position: absolute; top: 31px; bottom: -12px; left: 6px; width: 1px; background: var(--border-strong); content: ''; }
.trace-mark { width: 13px; height: 13px; background: var(--surface-1); border: 2px solid var(--border-strong); border-radius: 50%; }
li.current .trace-mark { background: var(--accent-green); border-color: var(--accent-green); box-shadow: 0 0 0 3px var(--accent-green-soft); }
li.return .trace-mark { border-color: var(--accent-amber); }
li > div { min-width: 0; display: flex; flex-direction: column; }
strong { color: var(--text-primary); font-size: 12px; }
code { overflow: hidden; color: var(--text-muted); font: 11px/1.5 var(--font-mono); text-overflow: ellipsis; white-space: nowrap; }
small { color: var(--text-faint); font: 10px/1.4 var(--font-mono); white-space: nowrap; }
.empty-state { padding: 18px 0; color: var(--text-faint); font-size: 12px; text-align: center; }
</style>
