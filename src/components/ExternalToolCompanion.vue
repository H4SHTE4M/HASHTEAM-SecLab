<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import type {
  CompanionMessage,
  CompanionObservationField,
  ExternalCompanionDefinition,
  ExternalToolId,
} from '../types/companion'
import {
  buildCompanionVerificationCommand,
  createCompanionUrl,
  createCompanionSync,
  loadCompanionState,
  normalizeCompanionObservation,
  saveCompanionDefinition,
  saveCompanionState,
  type CompanionSync,
} from '../services/companion'
import { createSafeStorage } from '../services/progress-store'

const props = withDefaults(defineProps<{
  definition: ExternalCompanionDefinition
  standalone?: boolean
}>(), {
  standalone: false,
})

const emit = defineEmits<{
  (e: 'submit', payload: { values: Record<string, string>; command: string }): void
}>()

const storage = createSafeStorage()
const state = reactive(loadCompanionState(props.definition, storage))
const fieldErrors = reactive<Record<string, string>>({})
const submitStatus = ref('')
const copyStatus = ref('')
let sync: CompanionSync | null = null

const selectedRoute = computed(
  () => props.definition.tools.find((route) => route.tool === state.selectedTool) ?? props.definition.tools[0],
)
const allTasksComplete = computed(() =>
  props.definition.tasks.every((task) => state.completedTaskIds.includes(task.id)),
)

function persist(): void {
  state.updatedAt = Date.now()
  saveCompanionState(state, storage)
}

function applyMessage(message: CompanionMessage): void {
  if (message.type === 'observation') {
    const field = props.definition.observations.find((item) => item.id === message.field)
    if (!field) return
    try {
      state.observations[field.id] = normalizeCompanionObservation(field.kind, message.value)
    } catch {
      return
    }
  } else if (message.type === 'companion-progress') {
    if (!props.definition.tasks.some((task) => task.id === message.stepId)) return
    const completed = new Set(state.completedTaskIds)
    if (message.completed) completed.add(message.stepId)
    else completed.delete(message.stepId)
    state.completedTaskIds = [...completed]
  } else if (message.type === 'tool-selected') {
    if (!props.definition.tools.some((route) => route.tool === message.tool)) return
    state.selectedTool = message.tool
  }
  state.updatedAt = Math.max(state.updatedAt, message.updatedAt)
  saveCompanionState(state, storage)
}

onMounted(() => {
  saveCompanionDefinition(props.definition, storage)
  sync = createCompanionSync(props.definition.labId, applyMessage, { storage })
  sync.publish({ type: 'companion-ready', labId: props.definition.labId })
})

onBeforeUnmount(() => {
  sync?.dispose()
  sync = null
})

function selectTool(tool: ExternalToolId): void {
  state.selectedTool = tool
  persist()
  sync?.publish({ type: 'tool-selected', labId: props.definition.labId, tool })
}

function toggleTask(taskId: string, completed: boolean): void {
  const taskIds = new Set(state.completedTaskIds)
  if (completed) taskIds.add(taskId)
  else taskIds.delete(taskId)
  state.completedTaskIds = [...taskIds]
  persist()
  sync?.publish({
    type: 'companion-progress',
    labId: props.definition.labId,
    stepId: taskId,
    completed,
  })
}

function saveObservation(field: CompanionObservationField): boolean {
  const raw = state.observations[field.id] ?? ''
  if (!field.required && raw.trim().length === 0) {
    delete fieldErrors[field.id]
    return true
  }
  try {
    const value = normalizeCompanionObservation(field.kind, raw)
    state.observations[field.id] = value
    delete fieldErrors[field.id]
    persist()
    sync?.publish({
      type: 'observation',
      labId: props.definition.labId,
      field: field.id,
      value,
    })
    return true
  } catch (error) {
    fieldErrors[field.id] = error instanceof Error ? error.message : '观察值格式无效'
    return false
  }
}

function submitObservations(): void {
  if (!allTasksComplete.value) {
    submitStatus.value = '完成目标清单后再提交分析事实。'
    return
  }
  const valid = props.definition.observations.every(saveObservation)
  if (!valid) {
    submitStatus.value = '请先修正观察值格式。'
    return
  }
  try {
    const payload = buildCompanionVerificationCommand(props.definition, state.observations)
    submitStatus.value = props.standalone
      ? '分析事实已同步，可以返回主实验窗口。'
      : '已发送到 VM 做最终验证。'
    if (!props.standalone) emit('submit', payload)
  } catch (error) {
    submitStatus.value = error instanceof Error ? error.message : '无法生成验证命令'
  }
}

function openCompanionWindow(): void {
  saveCompanionDefinition(props.definition, storage)
  const url = createCompanionUrl(window.location.href, props.definition.labId)
  window.open(url, `pwnhub-companion-${props.definition.labId}`, 'noopener,noreferrer')
}

async function copyHash(): Promise<void> {
  if (navigator.clipboard === undefined) return
  await navigator.clipboard.writeText(props.definition.artifact.sha256)
  copyStatus.value = '已复制'
}
</script>

<template>
  <section class="external-companion" :class="{ standalone }" aria-labelledby="companion-title">
    <header class="companion-header">
      <div>
        <span>外部静态分析</span>
        <h4 id="companion-title">{{ definition.title }}</h4>
      </div>
      <button v-if="!standalone" type="button" class="open-companion" @click="openCompanionWindow">
        <AppIcon name="external-link" :size="15" />打开伴侣窗口
      </button>
    </header>

    <section class="artifact-band" aria-label="样本信息">
      <div>
        <strong>{{ definition.artifact.name }}</strong>
        <span>{{ definition.artifact.architecture }} · {{ definition.artifact.purpose }}</span>
      </div>
      <a :href="definition.artifact.downloadUrl" download>
        <AppIcon name="download" :size="15" />下载样本
      </a>
      <code :title="definition.artifact.sha256">SHA-256 {{ definition.artifact.sha256 }}</code>
      <button type="button" class="copy-hash" title="复制 SHA-256" @click="copyHash">
        <AppIcon name="copy" :size="14" />{{ copyStatus || '复制' }}
      </button>
    </section>

    <div class="tool-tabs" role="tablist" aria-label="静态分析路线">
      <button
        v-for="route in definition.tools"
        :id="`tool-tab-${route.tool}`"
        :key="route.tool"
        type="button"
        role="tab"
        :aria-selected="state.selectedTool === route.tool"
        :aria-controls="`tool-route-${route.tool}`"
        @click="selectTool(route.tool)"
      >{{ route.label }}</button>
    </div>

    <section
      :id="`tool-route-${selectedRoute.tool}`"
      class="tool-route"
      role="tabpanel"
      :aria-labelledby="`tool-tab-${selectedRoute.tool}`"
    >
      <div class="route-notes">
        <p><strong>版本：</strong>{{ selectedRoute.versionNote }}</p>
        <p><strong>安装与授权：</strong>{{ selectedRoute.installNote }}</p>
      </div>
      <ol>
        <li v-for="step in selectedRoute.steps" :key="step">{{ step }}</li>
      </ol>
    </section>

    <section class="target-list" aria-labelledby="target-list-title">
      <h5 id="target-list-title">目标清单</h5>
      <label v-for="task in definition.tasks" :key="task.id">
        <input
          type="checkbox"
          :checked="state.completedTaskIds.includes(task.id)"
          @change="toggleTask(task.id, ($event.target as HTMLInputElement).checked)"
        />
        <span><strong>{{ task.title }}</strong><small>{{ task.description }}</small></span>
      </label>
    </section>

    <form class="observation-form" @submit.prevent="submitObservations">
      <h5>分析事实回填</h5>
      <label v-for="field in definition.observations" :key="field.id">
        <span>{{ field.label }}<small>{{ field.kind }}{{ field.required ? ' · 必填' : ' · 可选' }}</small></span>
        <input
          v-model="state.observations[field.id]"
          autocomplete="off"
          spellcheck="false"
          :placeholder="field.placeholder"
          :aria-invalid="fieldErrors[field.id] ? 'true' : undefined"
          @change="saveObservation(field)"
        />
        <small v-if="fieldErrors[field.id]" class="field-error" role="alert">{{ fieldErrors[field.id] }}</small>
      </label>
      <button type="submit">
        <AppIcon name="check" :size="15" />{{ standalone ? '保存并同步' : '提交到 VM 验证' }}
      </button>
      <p v-if="submitStatus" role="status">{{ submitStatus }}</p>
    </form>
  </section>
</template>

<style scoped>
.external-companion { min-width: 0; margin-top: 12px; overflow: hidden; background: var(--surface-1); border: var(--hairline) solid var(--border-strong); border-radius: 8px; }
.companion-header { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; background: var(--surface-2); border-bottom: var(--hairline) solid var(--border-subtle); }
.companion-header span { color: var(--accent-violet); font-size: 10px; font-weight: 750; }
h4,
h5,
p { margin: 0; }
h4 { margin-top: 2px; color: var(--text-primary); font-size: 14px; }
h5 { color: var(--text-primary); font-size: 12px; }
.open-companion,
.artifact-band a,
.observation-form > button { min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 9px; color: var(--accent-cyan); font-size: 11px; font-weight: 700; text-decoration: none; background: var(--accent-cyan-soft); border: var(--hairline) solid var(--accent-cyan-border); border-radius: 6px; cursor: pointer; }
.artifact-band { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; padding: 12px; border-bottom: var(--hairline) solid var(--border-subtle); }
.artifact-band > div { min-width: 0; display: flex; flex-direction: column; }
.artifact-band strong { color: var(--text-primary); font-size: 12px; }
.artifact-band span { color: var(--text-faint); font-size: 10px; }
.artifact-band > code { overflow: hidden; color: var(--text-muted); font: 10px/1.5 var(--font-mono); text-overflow: ellipsis; white-space: nowrap; }
.copy-hash { min-height: 28px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 4px 7px; color: var(--text-muted); font-size: 10px; background: transparent; border: var(--hairline) solid var(--border-subtle); border-radius: 5px; cursor: pointer; }
.tool-tabs { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(90px, 1fr); overflow-x: auto; background: var(--surface-2); border-bottom: var(--hairline) solid var(--border-subtle); }
.tool-tabs button { min-height: 40px; padding: 7px 9px; color: var(--text-faint); font-size: 11px; font-weight: 650; background: transparent; border: 0; border-bottom: 2px solid transparent; cursor: pointer; }
.tool-tabs button[aria-selected='true'] { color: var(--accent-cyan); border-bottom-color: var(--accent-cyan); }
.tool-route,
.target-list,
.observation-form { padding: 12px; }
.route-notes { padding: 9px 10px; color: var(--text-muted); font-size: 11px; line-height: 1.6; background: var(--surface-2); border-radius: 6px; }
.route-notes p + p { margin-top: 3px; }
.tool-route ol { margin: 10px 0 0; padding-left: 20px; color: var(--text-secondary); font-size: 12px; line-height: 1.7; }
.target-list { display: flex; flex-direction: column; gap: 7px; border-top: var(--hairline) solid var(--border-subtle); }
.target-list label { min-height: 44px; display: flex; align-items: center; gap: 9px; padding: 7px 8px; background: var(--surface-2); border-radius: 6px; cursor: pointer; }
.target-list input { width: 16px; height: 16px; accent-color: var(--accent-cyan); }
.target-list label > span { min-width: 0; display: flex; flex-direction: column; }
.target-list strong { color: var(--text-primary); font-size: 11px; }
.target-list small { color: var(--text-faint); font-size: 10px; line-height: 1.5; }
.observation-form { display: grid; gap: 9px; border-top: var(--hairline) solid var(--border-subtle); }
.observation-form label { min-width: 0; display: grid; grid-template-columns: 130px minmax(0, 1fr); align-items: center; gap: 7px; }
.observation-form label > span { display: flex; flex-direction: column; color: var(--text-secondary); font-size: 11px; }
.observation-form label > span small { color: var(--text-faint); font-size: 9px; }
.observation-form input { width: 100%; height: 36px; min-width: 0; padding: 6px 8px; color: var(--text-primary); font: 12px/1 var(--font-mono); background: var(--surface-0); border: var(--hairline) solid var(--border-strong); border-radius: 5px; }
.observation-form input[aria-invalid='true'] { border-color: var(--accent-red); }
.field-error { grid-column: 2; color: var(--accent-red); font-size: 10px; }
.observation-form > button { min-height: 40px; }
.observation-form > p { color: var(--accent-green); font-size: 11px; text-align: center; }
.standalone { width: min(960px, 100%); margin: 0 auto; }
@media (max-width: 600px) {
  .companion-header { align-items: stretch; flex-direction: column; }
  .artifact-band { grid-template-columns: 1fr; }
  .observation-form label { grid-template-columns: 1fr; }
  .field-error { grid-column: 1; }
}
</style>
