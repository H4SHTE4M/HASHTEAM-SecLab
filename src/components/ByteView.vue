<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ByteSnapshot } from '../types/binary'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ snapshot: ByteSnapshot }>()

type GroupSize = 1 | 2 | 4

function snapshotGroupSize(snapshot: ByteSnapshot): GroupSize {
  return snapshot.selectedLength === 1 || snapshot.selectedLength === 2 || snapshot.selectedLength === 4
    ? snapshot.selectedLength
    : 4
}

const groupSize = ref<GroupSize>(snapshotGroupSize(props.snapshot))
const selectedOffset = ref(props.snapshot.selectedOffset ?? 0)
const copyStatus = ref('')

function alignedOffset(offset: number, size = groupSize.value): number {
  if (props.snapshot.bytes.length === 0) return 0
  const clamped = Math.min(Math.max(offset, 0), props.snapshot.bytes.length - 1)
  return Math.floor(clamped / size) * size
}

watch(
  () => props.snapshot,
  (snapshot) => {
    groupSize.value = snapshotGroupSize(snapshot)
    selectedOffset.value = alignedOffset(snapshot.selectedOffset ?? 0, groupSize.value)
    copyStatus.value = ''
  },
)

const rows = computed(() => {
  const result: Array<{ offset: number; bytes: number[] }> = []
  for (let offset = 0; offset < props.snapshot.bytes.length; offset += 16) {
    result.push({ offset, bytes: props.snapshot.bytes.slice(offset, offset + 16) })
  }
  return result
})

const selectedLength = computed(() =>
  Math.max(0, Math.min(groupSize.value, props.snapshot.bytes.length - selectedOffset.value)),
)
const selectedBytes = computed(() =>
  props.snapshot.bytes.slice(selectedOffset.value, selectedOffset.value + selectedLength.value),
)
const selectedHex = computed(() => selectedBytes.value.map(formatByte).join(' '))
const groupedValue = computed(() => {
  const bytes = selectedBytes.value.slice(0, 4)
  if (bytes.length === 0) return '无'
  const ordered = props.snapshot.endian === 'little' ? [...bytes].reverse() : bytes
  return `0x${ordered.map(formatByte).join('')}`
})

function formatByte(byte: number): string {
  return byte.toString(16).padStart(2, '0')
}

function formatAddress(address: number): string {
  return `0x${address.toString(16).padStart(8, '0')}`
}

function ascii(byte: number): string {
  return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.'
}

function isSelected(offset: number): boolean {
  return offset >= selectedOffset.value && offset < selectedOffset.value + selectedLength.value
}

function isGroupStart(offset: number): boolean {
  return offset % groupSize.value === 0
}

function isGroupEnd(offset: number): boolean {
  return (offset + 1) % groupSize.value === 0
}

function selectByte(offset: number): void {
  selectedOffset.value = alignedOffset(offset)
  copyStatus.value = ''
}

function setGroupSize(size: GroupSize): void {
  groupSize.value = size
  selectedOffset.value = alignedOffset(selectedOffset.value, size)
  copyStatus.value = ''
}

function moveSelection(event: KeyboardEvent): void {
  const delta = event.key === 'ArrowLeft'
    ? -groupSize.value
    : event.key === 'ArrowRight'
      ? groupSize.value
      : event.key === 'ArrowUp'
        ? -16
        : event.key === 'ArrowDown'
          ? 16
          : undefined
  if (delta === undefined) return
  event.preventDefault()
  selectedOffset.value = alignedOffset(selectedOffset.value + delta)
  copyStatus.value = ''
}

async function copySelection(): Promise<void> {
  if (!selectedHex.value || navigator.clipboard === undefined) return
  await navigator.clipboard.writeText(selectedHex.value)
  copyStatus.value = '已复制'
}
</script>

<template>
  <section class="byte-view" aria-labelledby="byte-view-title" @keydown="moveSelection">
    <header>
      <div>
        <h4 id="byte-view-title">字节视图</h4>
        <p>{{ snapshot.endian === 'little' ? '小端' : '大端' }} · {{ snapshot.bytes.length }} 字节</p>
      </div>
      <div class="byte-group" role="group" aria-label="字节分组">
        <button
          v-for="size in ([1, 2, 4] as const)"
          :key="size"
          type="button"
          :class="{ active: groupSize === size }"
          :aria-pressed="groupSize === size"
          @click="setGroupSize(size)"
        >
          {{ size }}B
        </button>
      </div>
    </header>

    <div v-if="rows.length > 0" class="byte-table-scroll" tabindex="0" aria-label="可横向滚动的字节表格">
      <div class="byte-table" role="grid" aria-label="地址、十六进制字节和 ASCII">
        <div class="byte-table-head" aria-hidden="true">
          <span>地址</span>
          <span class="hex-heading">十六进制</span>
          <span class="ascii-heading">ASCII</span>
        </div>
        <div v-for="row in rows" :key="row.offset" class="byte-row" role="row">
          <code class="address-cell">{{ formatAddress(snapshot.baseAddress + row.offset) }}</code>
          <span class="hex-cells">
            <button
              v-for="(byte, index) in row.bytes"
              :key="row.offset + index"
              type="button"
              :class="{
                selected: isSelected(row.offset + index),
                'group-start': isGroupStart(row.offset + index),
                'group-end': isGroupEnd(row.offset + index),
              }"
              :aria-label="`偏移 ${row.offset + index}，字节 ${formatByte(byte)}`"
              @click="selectByte(row.offset + index)"
            >{{ formatByte(byte) }}</button>
            <i v-for="index in 16 - row.bytes.length" :key="`empty-${row.offset + index}`" aria-hidden="true" />
          </span>
          <span class="ascii-cells" aria-label="ASCII">
            <span
              v-for="(byte, index) in row.bytes"
              :key="row.offset + index"
              :class="{
                selected: isSelected(row.offset + index),
                'group-start': isGroupStart(row.offset + index),
                'group-end': isGroupEnd(row.offset + index),
              }"
            >{{ ascii(byte) }}</span>
            <i v-for="index in 16 - row.bytes.length" :key="`ascii-empty-${row.offset + index}`" aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
    <p v-else class="empty-state">当前没有可展示的字节。</p>

    <footer v-if="selectedBytes.length > 0">
      <span>偏移 {{ selectedOffset }} · {{ selectedLength }}B · {{ groupedValue }}</span>
      <button type="button" title="复制选中十六进制" @click="copySelection">
        <AppIcon name="copy" :size="14" />
        <span>{{ copyStatus || '复制' }}</span>
      </button>
    </footer>
  </section>
</template>

<style scoped>
.byte-view { min-width: 0; }
.byte-view > header, .byte-view > footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h4, p { margin: 0; }
h4 { color: var(--text-primary); font-size: 13px; }
header p { margin-top: 2px; color: var(--text-faint); font-size: 11px; }
.byte-group { width: 108px; height: 30px; display: grid; flex: 0 0 auto; grid-template-columns: repeat(3, 36px); border: var(--hairline) solid var(--border-subtle); border-radius: 6px; overflow: hidden; }
.byte-group button { padding: 0; color: var(--text-faint); font: 650 10px/1 var(--font-mono); background: var(--surface-1); border: 0; cursor: pointer; }
.byte-group button + button { border-left: var(--hairline) solid var(--border-subtle); }
.byte-group button.active { color: var(--accent-cyan); background: var(--accent-cyan-soft); box-shadow: inset 0 -2px var(--accent-cyan); }
.byte-table-scroll { min-width: 0; margin-top: 10px; overflow-x: auto; overscroll-behavior-inline: contain; scrollbar-gutter: stable; }
.byte-table-scroll:focus-visible { border-radius: 4px; outline: 2px solid var(--accent-cyan); outline-offset: 2px; }
.byte-table { width: 711px; min-width: 711px; font: 12px/1.6 var(--font-mono); }
.byte-table-head, .byte-row { display: grid; grid-template-columns: 88px 431px 176px; align-items: center; column-gap: 8px; }
.byte-table-head { padding: 0 4px 5px; color: var(--text-faint); font-size: 10px; box-sizing: border-box; }
.byte-table-head > span { text-align: left; }
.byte-row { min-height: 31px; padding: 3px 4px; border-top: var(--hairline) solid var(--border-subtle); box-sizing: border-box; }
.address-cell { color: var(--accent-violet); }
.hex-cells { display: grid; grid-template-columns: repeat(16, 26px); gap: 1px; }
.ascii-cells { display: grid; grid-template-columns: repeat(16, 10px); gap: 1px; color: var(--accent-amber); white-space: pre; }
.hex-cells button, .hex-cells i, .ascii-cells span, .ascii-cells i { width: 100%; min-width: 0; height: 24px; display: grid; place-items: center; padding: 0; box-sizing: border-box; }
.hex-cells button { color: var(--text-secondary); font: inherit; background: transparent; border: 0; border-radius: 2px; cursor: pointer; }
.hex-cells i, .ascii-cells i { visibility: hidden; }
.hex-cells button:hover, .hex-cells button:focus-visible { color: var(--text-primary); background: var(--surface-3); }
.hex-cells button.group-start, .ascii-cells span.group-start { border-left: var(--hairline) solid var(--border-strong); }
.hex-cells button.group-end, .ascii-cells span.group-end { border-right: var(--hairline) solid var(--border-strong); }
.hex-cells button.selected { color: var(--accent-cyan); background: var(--accent-cyan-soft); outline: var(--hairline) solid var(--accent-cyan-border); outline-offset: -1px; }
.ascii-cells span.selected { color: var(--accent-cyan); background: var(--accent-cyan-soft); }
.ascii-heading { color: var(--accent-amber); }
footer { min-height: 36px; margin-top: 8px; padding-top: 8px; border-top: var(--hairline) solid var(--border-subtle); }
footer > span { color: var(--text-muted); font: 11px/1.4 var(--font-mono); }
footer button { min-height: 32px; display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px; color: var(--accent-cyan); background: transparent; border: var(--hairline) solid var(--accent-cyan-border); border-radius: 6px; cursor: pointer; }
.empty-state { padding: 18px 0; color: var(--text-faint); font-size: 12px; text-align: center; }
@media (max-width: 560px) {
  .byte-view > header { align-items: flex-start; }
  .byte-table-scroll { margin-inline: -2px; }
  footer { align-items: flex-start; flex-direction: column; }
}
</style>
