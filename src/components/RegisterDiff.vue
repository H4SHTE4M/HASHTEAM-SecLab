<script setup lang="ts">
import { computed } from 'vue'
import type { RegisterDiffSnapshot } from '../types/binary'

const props = defineProps<{ snapshot: RegisterDiffSnapshot }>()

const beforeFlags = computed(() => new Set(props.snapshot.flagsBefore ?? []))
const afterFlags = computed(() => new Set(props.snapshot.flagsAfter ?? []))
const allFlags = computed(() => [...new Set([...beforeFlags.value, ...afterFlags.value])])

function hex(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, '0')}`
}
</script>

<template>
  <section class="register-diff" aria-labelledby="register-diff-title">
    <header>
      <h4 id="register-diff-title">寄存器差分</h4>
      <code v-if="snapshot.instruction">{{ snapshot.instruction }}</code>
    </header>
    <table v-if="snapshot.registers.length > 0">
      <thead><tr><th>寄存器</th><th>单步前</th><th>单步后</th><th>变化</th></tr></thead>
      <tbody>
        <tr v-for="register in snapshot.registers" :key="register.name" :class="{ changed: register.before !== register.after }">
          <th scope="row">{{ register.name.toUpperCase() }}</th>
          <td><code>{{ hex(register.before) }}</code></td>
          <td><code>{{ hex(register.after) }}</code></td>
          <td>{{ register.before === register.after ? '未变' : '已变' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty-state">当前没有寄存器快照。</p>
    <div v-if="allFlags.length > 0" class="flag-row" aria-label="flags 差分">
      <span
        v-for="flag in allFlags"
        :key="flag"
        :class="{ active: afterFlags.has(flag), changed: beforeFlags.has(flag) !== afterFlags.has(flag) }"
        :aria-label="`${flag}：${beforeFlags.has(flag) ? 1 : 0} 变为 ${afterFlags.has(flag) ? 1 : 0}`"
      >
        <strong>{{ flag }}</strong>
        <code>{{ beforeFlags.has(flag) ? 1 : 0 }} → {{ afterFlags.has(flag) ? 1 : 0 }}</code>
      </span>
    </div>
  </section>
</template>

<style scoped>
h4 { margin: 0; color: var(--text-primary); font-size: 13px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
header code { overflow: hidden; color: var(--accent-amber); font: 11px/1.4 var(--font-mono); text-overflow: ellipsis; white-space: nowrap; }
table { width: 100%; margin-top: 10px; border-collapse: collapse; font-size: 12px; }
th,
td { padding: 7px 8px; text-align: left; border-top: var(--hairline) solid var(--border-subtle); }
thead th { color: var(--text-faint); font-size: 10px; font-weight: 650; }
tbody th { color: var(--accent-violet); font-family: var(--font-mono); }
td { color: var(--text-muted); }
td code { color: var(--text-secondary); font-family: var(--font-mono); }
tr.changed td code,
tr.changed td:last-child { color: var(--accent-green); }
.flag-row { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.flag-row span { min-width: 58px; display: inline-grid; grid-template-columns: auto auto; align-items: center; gap: 6px; padding: 5px 7px; color: var(--text-faint); font: 650 10px/1 var(--font-mono); background: var(--surface-2); border-radius: 4px; }
.flag-row strong { font: inherit; }
.flag-row code { color: inherit; font: inherit; }
.flag-row span.active { color: var(--text-primary); }
.flag-row span.changed { color: var(--accent-green); outline: var(--hairline) solid var(--accent-green-border); }
.empty-state { padding: 18px 0; color: var(--text-faint); font-size: 12px; text-align: center; }
</style>
