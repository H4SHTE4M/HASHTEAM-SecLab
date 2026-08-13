<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  BinaryWorkbenchSnapshot,
  BinaryWorkbenchTab,
  PayloadWorkbenchPreset,
} from '../types/binary'
import AppIcon from './AppIcon.vue'
import AssemblyTui from './AssemblyTui.vue'
import ByteView from './ByteView.vue'
import CallTrace from './CallTrace.vue'
import MemoryView from './MemoryView.vue'
import PayloadWorkbench from './PayloadWorkbench.vue'
import ProtectionCard from './ProtectionCard.vue'
import RegisterDiff from './RegisterDiff.vue'
import StackView from './StackView.vue'

const props = withDefaults(defineProps<{
  snapshot?: BinaryWorkbenchSnapshot
  payloadPreset?: PayloadWorkbenchPreset
  initialTab?: BinaryWorkbenchTab
  showPayload?: boolean
}>(), {
  initialTab: 'bytes',
  showPayload: false,
})

const emit = defineEmits<{
  (e: 'write-command', command: string): void
}>()

const tabs: Array<{ id: BinaryWorkbenchTab; label: string; icon: 'hash' | 'activity' | 'layers' | 'git-branch' | 'shield-check' | 'braces' }> = [
  { id: 'bytes', label: '字节', icon: 'hash' },
  { id: 'memory', label: '内存', icon: 'layers' },
  { id: 'registers', label: '寄存器', icon: 'activity' },
  { id: 'stack', label: '栈', icon: 'layers' },
  { id: 'trace', label: '调用', icon: 'git-branch' },
  { id: 'protections', label: '保护', icon: 'shield-check' },
  { id: 'payload', label: 'Payload', icon: 'braces' },
]
const activeTab = ref<BinaryWorkbenchTab>(props.initialTab)
const assemblyTuiSnapshot = computed(() => props.snapshot?.assemblyTui)

function hasTab(tab: BinaryWorkbenchTab): boolean {
  if (tab === 'payload') return props.showPayload
  if (tab === 'bytes') return props.snapshot?.bytes !== undefined
  if (tab === 'memory') return props.snapshot?.memory !== undefined
  if (tab === 'registers') return props.snapshot?.registers !== undefined
  if (tab === 'stack') return props.snapshot?.stack !== undefined
  if (tab === 'trace') return props.snapshot?.trace !== undefined
  return props.snapshot?.protections !== undefined
}

const availableTabs = computed(() => tabs.filter((tab) => hasTab(tab.id)))

watch(
  () => [props.initialTab, props.snapshot, props.showPayload] as const,
  () => {
    activeTab.value = hasTab(props.initialTab)
      ? props.initialTab
      : (availableTabs.value[0]?.id ?? props.initialTab)
  },
  { immediate: true, deep: true },
)
</script>

<template>
  <section class="binary-workbench" aria-label="二进制工作台">
    <div class="workbench-tabs" role="tablist" aria-label="工作台视图">
      <button
        v-for="tab in tabs"
        :id="`binary-tab-${tab.id}`"
        :key="tab.id"
        type="button"
        role="tab"
        :disabled="!hasTab(tab.id)"
        :aria-selected="activeTab === tab.id"
        :aria-controls="`binary-panel-${tab.id}`"
        :title="!hasTab(tab.id) ? `${tab.label}数据尚未载入` : tab.label"
        @click="activeTab = tab.id"
      >
        <AppIcon :name="tab.icon" :size="14" />
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <div
      :id="`binary-panel-${activeTab}`"
      class="workbench-panel"
      role="tabpanel"
      :aria-labelledby="`binary-tab-${activeTab}`"
    >
      <ByteView v-if="activeTab === 'bytes' && snapshot?.bytes" :snapshot="snapshot.bytes" />
      <MemoryView v-else-if="activeTab === 'memory' && snapshot?.memory" :snapshot="snapshot.memory" />
      <RegisterDiff v-else-if="activeTab === 'registers' && snapshot?.registers" :snapshot="snapshot.registers" />
      <StackView v-else-if="activeTab === 'stack' && snapshot?.stack" :snapshot="snapshot.stack" />
      <CallTrace v-else-if="activeTab === 'trace' && snapshot?.trace" :snapshot="snapshot.trace" />
      <ProtectionCard v-else-if="activeTab === 'protections' && snapshot?.protections" :snapshot="snapshot.protections" />
      <PayloadWorkbench
        v-else-if="activeTab === 'payload' && showPayload"
        :preset="payloadPreset"
        @write-command="emit('write-command', $event)"
      />
      <p v-else class="workbench-empty">这个视图需要由真实 ELF 或调试会话提供数据。</p>
    </div>
    <AssemblyTui v-if="assemblyTuiSnapshot" :snapshot="assemblyTuiSnapshot" />
  </section>
</template>

<style scoped>
.binary-workbench { min-width: 0; margin-top: 12px; overflow: hidden; background: var(--surface-1); border: var(--hairline) solid var(--border-strong); border-radius: 8px; }
.workbench-tabs { min-height: 42px; display: grid; grid-template-columns: repeat(7, minmax(58px, 1fr)); background: var(--surface-2); border-bottom: var(--hairline) solid var(--border-subtle); overflow-x: auto; }
.workbench-tabs button { min-width: 58px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 7px 6px; color: var(--text-faint); font-size: 10px; font-weight: 650; background: transparent; border: 0; border-bottom: 2px solid transparent; cursor: pointer; }
.workbench-tabs button:hover:not(:disabled),
.workbench-tabs button:focus-visible { color: var(--text-primary); background: var(--surface-3); }
.workbench-tabs button[aria-selected='true'] { color: var(--accent-cyan); border-bottom-color: var(--accent-cyan); }
.workbench-tabs button:disabled { cursor: not-allowed; opacity: 0.32; }
.workbench-panel { min-height: 150px; padding: 12px; }
.workbench-empty { margin: 0; padding: 46px 12px; color: var(--text-faint); font-size: 12px; text-align: center; }
@media (max-width: 680px) {
  .workbench-tabs { grid-template-columns: repeat(7, 58px); }
  .workbench-tabs button span { display: none; }
  .workbench-panel { padding: 10px; }
}
</style>
