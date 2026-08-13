<script setup lang="ts">
import type { MemoryCell, MemorySnapshot } from '../types/binary'

const props = defineProps<{ snapshot: MemorySnapshot }>()

function hex(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, '0')}`
}

function signed(value: number): number {
  return value >>> 31 ? (value >>> 0) - 0x100000000 : value >>> 0
}

function displayValue(cell: MemoryCell): string {
  return cell.kind === 'signed' ? String(signed(cell.value)) : hex(cell.value)
}

function kindLabel(kind: MemoryCell['kind']): string {
  if (kind === 'pointer') return '指针'
  if (kind === 'signed') return '有符号值'
  return '无符号值'
}

function dereferencedCell(cell: MemoryCell): MemoryCell | undefined {
  if (cell.targetAddress === undefined) return undefined
  return props.snapshot.cells.find((candidate) =>
    candidate.address === cell.targetAddress && candidate.kind !== 'pointer',
  )
}

function dereferencedValue(cell: MemoryCell): string | undefined {
  const target = dereferencedCell(cell)
  return target === undefined ? undefined : displayValue(target)
}
</script>

<template>
  <section class="memory-view" aria-labelledby="memory-view-title">
    <header class="memory-header">
      <div>
        <h4 id="memory-view-title">内存表</h4>
        <p>{{ snapshot.endian === 'little' ? '小端' : '大端' }} · 地址与变量值</p>
      </div>
      <span class="memory-count">{{ snapshot.cells.length }} 个观察对象</span>
    </header>

    <div v-if="snapshot.cells.length > 0" class="memory-table-wrap">
      <table class="memory-table">
        <thead>
          <tr>
            <th scope="col">地址</th>
            <th scope="col">变量名</th>
            <th scope="col">变量值</th>
            <th scope="col">含义</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cell in snapshot.cells" :key="`${cell.address}-${cell.name}`">
            <td><code>{{ hex(cell.address) }}</code></td>
            <th scope="row"><code>{{ cell.name }}</code></th>
            <td>
              <code class="cell-value">{{ displayValue(cell) }}</code>
              <code v-if="cell.kind === 'signed'" class="raw-value">位模式 {{ hex(cell.value) }}</code>
              <span v-if="cell.targetAddress !== undefined" class="target-link">
                <span aria-hidden="true">→</span>
                <span>
                  指向 <code>{{ cell.targetName || hex(cell.targetAddress) }}</code>
                  <template v-if="dereferencedValue(cell) !== undefined">
                    ，解引用值 <code>{{ dereferencedValue(cell) }}</code>
                  </template>
                </span>
              </span>
            </td>
            <td>
              <span class="meaning-kind">{{ kindLabel(cell.kind) }}</span>
              <span class="meaning-text">{{ cell.meaning }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="empty-state">当前没有内存观察数据。</p>
  </section>
</template>

<style scoped>
.memory-view { min-width: 0; }
.memory-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h4,
p { margin: 0; }
h4 { color: var(--text-primary); font-size: 13px; }
.memory-header p { margin-top: 2px; color: var(--text-faint); font-size: 11px; }
.memory-count { flex: 0 0 auto; color: var(--text-faint); font: 10px/1.3 var(--font-mono); }
.memory-table-wrap { margin-top: 10px; overflow-x: auto; border-top: var(--hairline) solid var(--border-subtle); }
.memory-table { width: 100%; min-width: 480px; border-collapse: collapse; font-size: 11px; }
th,
td { padding: 8px 7px; border-bottom: var(--hairline) solid var(--border-subtle); text-align: left; vertical-align: top; }
thead th { color: var(--text-faint); font-size: 10px; font-weight: 650; white-space: nowrap; }
tbody td:first-child,
tbody th { color: var(--accent-violet); font-weight: 550; }
tbody td:first-child code,
tbody th code,
.cell-value,
.target-link code { font: 11px/1.45 var(--font-mono); }
.cell-value { color: var(--text-primary); }
.raw-value { display: block; margin-top: 2px; color: var(--text-faint); font: 10px/1.35 var(--font-mono); }
.target-link { display: inline-flex; align-items: flex-start; gap: 4px; margin-left: 7px; color: var(--accent-cyan); }
.target-link code { color: inherit; }
.meaning-kind { display: block; color: var(--accent-amber); font-size: 10px; font-weight: 700; }
.meaning-text { display: block; margin-top: 2px; color: var(--text-secondary); line-height: 1.5; }
.empty-state { padding: 18px 0; color: var(--text-faint); font-size: 12px; text-align: center; }
@media (max-width: 560px) {
  .memory-table { min-width: 0; table-layout: fixed; }
  th,
  td { padding-inline: 5px; overflow-wrap: anywhere; }
  .memory-table th:nth-child(1) { width: 25%; }
  .memory-table th:nth-child(2) { width: 21%; }
  .memory-table th:nth-child(3) { width: 25%; }
  .memory-table th:nth-child(4) { width: 29%; }
  .target-link { display: flex; margin: 2px 0 0; }
}
</style>
