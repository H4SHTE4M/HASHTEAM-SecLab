<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  PayloadSegmentDefinition,
  PayloadWorkbenchPreset,
} from '../types/binary'
import {
  DEFAULT_PAYLOAD_LIMIT,
  buildPayloadWriteCommand,
  bytesToHex,
  composePayload,
  cyclicFind,
} from '../services/payload'
import AppIcon from './AppIcon.vue'
import ByteView from './ByteView.vue'

const props = defineProps<{
  preset?: PayloadWorkbenchPreset
}>()

const emit = defineEmits<{
  (e: 'write-command', command: string): void
}>()

const PREVIEW_LIMIT = 256
const segmentKind = ref<PayloadSegmentDefinition['kind']>('padding')
const segments = ref<PayloadSegmentDefinition[]>(cloneSegments(props.preset?.segments ?? defaultSegments()))
const outputPath = ref(props.preset?.outputPath ?? 'payload.bin')
const cyclicNeedle = ref('')
const cyclicResult = ref<string>('')
const outputError = ref('')
let nextSegmentId = segments.value.length + 1

watch(
  () => props.preset,
  (preset) => {
    segments.value = cloneSegments(preset?.segments ?? defaultSegments())
    outputPath.value = preset?.outputPath ?? 'payload.bin'
    cyclicNeedle.value = ''
    cyclicResult.value = ''
    outputError.value = ''
    nextSegmentId = segments.value.length + 1
  },
  { deep: true },
)

const maxBytes = computed(() => props.preset?.maxBytes ?? DEFAULT_PAYLOAD_LIMIT)
const composition = computed(() => {
  try {
    return { value: composePayload(segments.value, maxBytes.value), error: '' }
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : 'Payload 无法组装' }
  }
})
const previewBytes = computed(() => composition.value.value?.bytes.slice(0, PREVIEW_LIMIT) ?? new Uint8Array())
const previewSnapshot = computed(() => ({
  baseAddress: 0,
  bytes: [...previewBytes.value],
  endian: 'little' as const,
  selectedOffset: 0,
  selectedLength: Math.min(4, previewBytes.value.length),
}))

function defaultSegments(): PayloadSegmentDefinition[] {
  return [{ id: 'segment-1', kind: 'padding', label: 'padding', byte: 0x41, length: 16 }]
}

function cloneSegments(source: PayloadSegmentDefinition[]): PayloadSegmentDefinition[] {
  return source.map((segment) => ({ ...segment }))
}

function addSegment(): void {
  const id = `segment-${nextSegmentId}`
  nextSegmentId += 1
  const label = segmentKind.value
  if (segmentKind.value === 'padding') {
    segments.value.push({ id, kind: 'padding', label, byte: 0x41, length: 8 })
  } else if (segmentKind.value === 'p32') {
    segments.value.push({ id, kind: 'p32', label, value: '0x00000000' })
  } else if (segmentKind.value === 'hex') {
    segments.value.push({ id, kind: 'hex', label, value: '00' })
  } else {
    segments.value.push({ id, kind: 'cyclic', label, length: 32 })
  }
}

function removeSegment(id: string): void {
  segments.value = segments.value.filter((segment) => segment.id !== id)
}

function writePayload(): void {
  const payload = composition.value.value
  if (payload === null || payload.bytes.length === 0) return
  try {
    emit('write-command', buildPayloadWriteCommand(payload.bytes, outputPath.value))
    outputError.value = ''
  } catch (error) {
    outputError.value = error instanceof Error ? error.message : '文件名无效'
  }
}

function downloadPayload(): void {
  const payload = composition.value.value
  if (payload === null || payload.bytes.length === 0) return
  const blob = new Blob([payload.bytes.slice().buffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = outputPath.value.split('/').pop() || 'payload.bin'
  anchor.click()
  URL.revokeObjectURL(url)
}

function findCyclicOffset(): void {
  try {
    const offset = cyclicFind(cyclicNeedle.value, maxBytes.value)
    cyclicResult.value = offset < 0 ? '当前搜索范围内未找到' : `偏移 ${offset}（0x${offset.toString(16)}）`
  } catch (error) {
    cyclicResult.value = error instanceof Error ? error.message : '无法查找偏移'
  }
}
</script>

<template>
  <section class="payload-workbench" aria-labelledby="payload-title">
    <header class="payload-header">
      <div>
        <h4 id="payload-title">Payload 组装</h4>
        <p>按顺序拼接确定性字节段</p>
      </div>
      <output :class="{ invalid: composition.error }">
        {{ composition.value?.bytes.length ?? 0 }} / {{ maxBytes }} B
      </output>
    </header>

    <ol class="segment-list">
      <li v-for="(segment, index) in segments" :key="segment.id" :data-kind="segment.kind">
        <span class="segment-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <label class="segment-label">
          分段名称
          <input v-model="segment.label" autocomplete="off" maxlength="32" />
        </label>
        <label v-if="segment.kind === 'padding'">
          填充字节
          <input v-model.number="segment.byte" type="number" min="0" max="255" />
        </label>
        <label v-if="segment.kind === 'padding' || segment.kind === 'cyclic'">
          长度
          <input v-model.number="segment.length" type="number" min="0" :max="maxBytes" />
        </label>
        <label v-else-if="segment.kind === 'p32'">
          32 位数值
          <input v-model="segment.value" autocomplete="off" spellcheck="false" placeholder="0x00000000" />
        </label>
        <label v-else-if="segment.kind === 'hex'">
          十六进制字节
          <input v-model="segment.value" autocomplete="off" spellcheck="false" placeholder="41 42 43" />
        </label>
        <span class="segment-kind">{{ segment.kind }}</span>
        <button type="button" class="remove-segment" title="删除分段" :aria-label="`删除 ${segment.label} 分段`" @click="removeSegment(segment.id)">
          <AppIcon name="trash-2" :size="15" />
        </button>
      </li>
    </ol>

    <div class="add-segment">
      <label>
        新分段类型
        <select v-model="segmentKind">
          <option value="padding">重复填充</option>
          <option value="p32">p32 小端整数</option>
          <option value="hex">十六进制字节</option>
          <option value="cyclic">cyclic pattern</option>
        </select>
      </label>
      <button type="button" @click="addSegment"><AppIcon name="plus" :size="15" />添加分段</button>
    </div>

    <p v-if="composition.error" class="payload-error" role="alert">{{ composition.error }}</p>

    <section v-if="composition.value" class="payload-map" aria-label="Payload 分段布局">
      <span
        v-for="range in composition.value.ranges"
        :key="range.id"
        :data-kind="range.kind"
        :title="`${range.label}: ${range.offset}..${range.offset + range.length}`"
      >
        {{ range.label }} · {{ range.length }}B
      </span>
    </section>

    <ByteView v-if="previewBytes.length > 0" :snapshot="previewSnapshot" />
    <p v-if="(composition.value?.bytes.length ?? 0) > PREVIEW_LIMIT" class="preview-note">
      字节视图仅展示前 {{ PREVIEW_LIMIT }} 字节；导出仍包含全部内容。
    </p>

    <dl v-if="composition.value" class="payload-facts">
      <div><dt>空字节</dt><dd>{{ composition.value.nullOffsets.length }}</dd></div>
      <div><dt>HEX</dt><dd><code>{{ bytesToHex(composition.value.bytes.slice(0, 32)) }}{{ composition.value.bytes.length > 32 ? ' …' : '' }}</code></dd></div>
    </dl>

    <form class="cyclic-find" @submit.prevent="findCyclicOffset">
      <label for="cyclic-needle">cyclic-find</label>
      <input id="cyclic-needle" v-model="cyclicNeedle" autocomplete="off" spellcheck="false" placeholder="baaa 或 0x61616162" />
      <button type="submit">查偏移</button>
      <output v-if="cyclicResult" aria-live="polite">{{ cyclicResult }}</output>
    </form>

    <div class="payload-output">
      <label for="payload-output-path">VM 相对路径</label>
      <input id="payload-output-path" v-model="outputPath" autocomplete="off" spellcheck="false" />
      <button type="button" :disabled="!composition.value || composition.value.bytes.length === 0" @click="writePayload">
        <AppIcon name="save" :size="15" />写入终端
      </button>
      <button type="button" :disabled="!composition.value || composition.value.bytes.length === 0" @click="downloadPayload">
        <AppIcon name="download" :size="15" />下载文件
      </button>
    </div>
    <p v-if="outputError" class="payload-error output-error" role="alert">{{ outputError }}</p>
  </section>
</template>

<style scoped>
.payload-workbench { min-width: 0; }
.payload-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h4,
p { margin: 0; }
h4 { color: var(--text-primary); font-size: 13px; }
.payload-header p { margin-top: 2px; color: var(--text-faint); font-size: 11px; }
.payload-header output { min-width: 96px; color: var(--accent-green); font: 650 11px/1 var(--font-mono); text-align: right; }
.payload-header output.invalid { color: var(--accent-red); }
.segment-list { display: flex; flex-direction: column; gap: 6px; margin: 10px 0 0; padding: 0; list-style: none; }
.segment-list li { min-height: 62px; display: grid; grid-template-columns: 30px minmax(100px, 1fr) minmax(120px, 1.5fr) 62px 34px; align-items: end; gap: 8px; padding: 8px; background: var(--surface-2); border-left: 3px solid var(--border-strong); border-radius: 6px; }
.segment-list li[data-kind='padding'] { border-left-color: var(--accent-cyan); }
.segment-list li[data-kind='p32'] { border-left-color: var(--accent-violet); }
.segment-list li[data-kind='hex'] { border-left-color: var(--accent-amber); }
.segment-list li[data-kind='cyclic'] { border-left-color: var(--accent-coral); }
.segment-index { align-self: center; color: var(--text-faint); font: 650 10px/1 var(--font-mono); }
label { min-width: 0; display: flex; flex-direction: column; gap: 4px; color: var(--text-faint); font-size: 10px; }
input,
select { width: 100%; height: 34px; min-width: 0; padding: 5px 7px; color: var(--text-primary); font: 12px/1 var(--font-mono); background: var(--surface-1); border: var(--hairline) solid var(--border-strong); border-radius: 5px; }
.segment-kind { align-self: center; color: var(--text-muted); font: 10px/1 var(--font-mono); }
.remove-segment { width: 34px; height: 34px; display: grid; place-items: center; padding: 0; color: var(--text-faint); background: transparent; border: 0; border-radius: 5px; cursor: pointer; }
.remove-segment:hover { color: var(--accent-red); background: color-mix(in srgb, var(--accent-red) 10%, transparent); }
.add-segment { display: grid; grid-template-columns: minmax(150px, 1fr) auto; align-items: end; gap: 8px; margin-top: 8px; }
.add-segment button,
.cyclic-find button,
.payload-output button { min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 6px 9px; color: var(--accent-cyan); font-size: 11px; font-weight: 700; background: var(--accent-cyan-soft); border: var(--hairline) solid var(--accent-cyan-border); border-radius: 6px; cursor: pointer; }
.payload-error { margin-top: 8px; color: var(--accent-red); font-size: 11px; }
.payload-map { min-height: 32px; display: flex; gap: 2px; margin-top: 10px; overflow-x: auto; }
.payload-map span { min-width: max-content; flex: 1 0 auto; padding: 7px 8px; overflow: hidden; color: var(--text-secondary); font: 10px/1.4 var(--font-mono); text-align: center; text-overflow: ellipsis; white-space: nowrap; background: var(--surface-3); }
.payload-map span[data-kind='padding'] { background: var(--accent-cyan-soft); }
.payload-map span[data-kind='p32'] { background: var(--accent-violet-soft); }
.payload-map span[data-kind='cyclic'] { background: color-mix(in srgb, var(--accent-coral) 10%, transparent); }
.payload-workbench :deep(.byte-view) { margin-top: 12px; padding-top: 10px; border-top: var(--hairline) solid var(--border-subtle); }
.preview-note { margin-top: 6px; color: var(--text-faint); font-size: 10px; }
.payload-facts { margin: 9px 0 0; }
.payload-facts > div { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 8px; padding: 4px 0; }
.payload-facts dt { color: var(--text-faint); font-size: 10px; }
.payload-facts dd { min-width: 0; margin: 0; color: var(--text-secondary); font-size: 11px; }
.payload-facts code { display: block; overflow: hidden; font-family: var(--font-mono); text-overflow: ellipsis; white-space: nowrap; }
.cyclic-find { display: grid; grid-template-columns: 92px minmax(0, 1fr) 72px; align-items: end; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: var(--hairline) solid var(--border-subtle); }
.cyclic-find label { align-self: center; color: var(--text-muted); font: 650 11px/1 var(--font-mono); }
.cyclic-find output { grid-column: 2 / -1; color: var(--accent-amber); font-size: 11px; }
.payload-output { display: grid; grid-template-columns: minmax(140px, 1fr) repeat(2, auto); align-items: end; gap: 8px; margin-top: 10px; }
.payload-output > label { grid-column: 1; }
.payload-output > input { grid-column: 1; }
.payload-output button:disabled { cursor: not-allowed; opacity: 0.45; }
.output-error { margin-top: 6px; }
@media (max-width: 680px) {
  .segment-list li { grid-template-columns: 30px minmax(0, 1fr) 34px; }
  .segment-list li > label { grid-column: 2; }
  .segment-list li > .segment-kind { grid-column: 1; }
  .remove-segment { grid-column: 3; grid-row: 1; }
  .payload-output { grid-template-columns: 1fr 1fr; }
  .payload-output > label,
  .payload-output > input { grid-column: 1 / -1; }
  .cyclic-find { grid-template-columns: 1fr 78px; }
  .cyclic-find label { grid-column: 1 / -1; }
}
</style>
