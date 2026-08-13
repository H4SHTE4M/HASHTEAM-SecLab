<script setup lang="ts">
import type { StackEntryKind, StackSnapshot } from '../types/binary'

defineProps<{ snapshot: StackSnapshot }>()

const kindLabels: Record<StackEntryKind, string> = {
  'stack-pointer': 'ESP',
  'frame-pointer': 'EBP',
  'return-address': '返回地址',
  local: '局部变量',
  argument: '参数',
  payload: 'Payload',
}

function hex(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, '0')}`
}
</script>

<template>
  <section class="stack-view" aria-labelledby="stack-view-title">
    <h4 id="stack-view-title">栈视图</h4>
    <div v-if="snapshot.entries.length > 0" class="stack-table-wrap">
      <table class="stack-table">
        <thead><tr><th>地址</th><th>变量名 / 位置</th><th>变量值</th><th>作用</th></tr></thead>
        <tbody>
          <tr v-for="entry in snapshot.entries" :key="entry.address" :data-kind="entry.kind">
            <td><code>{{ hex(entry.address) }}</code></td>
            <td>{{ entry.label }}</td>
            <td><code>{{ hex(entry.value) }}</code></td>
            <td><span class="kind">{{ kindLabels[entry.kind] }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="empty-state">当前没有栈快照。</p>
  </section>
</template>

<style scoped>
h4 { margin: 0 0 10px; color: var(--text-primary); font-size: 13px; }
.stack-table-wrap { min-width: 0; overflow-x: auto; }
.stack-table { width: 100%; min-width: 510px; border-collapse: collapse; table-layout: fixed; }
th, td { padding: 8px 10px; border-top: var(--hairline) solid var(--border-subtle); text-align: left; }
th { color: var(--text-faint); font-size: 10px; font-weight: 650; }
th:nth-child(1), td:nth-child(1) { width: 108px; }
th:nth-child(2), td:nth-child(2) { width: auto; }
th:nth-child(3), td:nth-child(3) { width: 108px; }
th:nth-child(4), td:nth-child(4) { width: 76px; text-align: right; }
td { color: var(--text-muted); font-size: 11px; }
td code { color: var(--text-primary); font: 11px/1.4 var(--font-mono); }
tr { border-left: 3px solid var(--border-strong); }
tr[data-kind='stack-pointer'] { border-left-color: var(--accent-green); }
tr[data-kind='frame-pointer'] { border-left-color: var(--accent-violet); }
tr[data-kind='return-address'] { border-left-color: var(--accent-amber); }
tr[data-kind='payload'] { border-left-color: var(--accent-coral); }
.kind { color: var(--text-faint); font-size: 10px; white-space: nowrap; }
.empty-state { padding: 18px 0; color: var(--text-faint); font-size: 12px; text-align: center; }
</style>
