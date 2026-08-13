<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AssemblyTuiSnapshot } from '../types/binary'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ snapshot: AssemblyTuiSnapshot }>()

const stateIndex = ref(0)
const exited = ref(false)
const currentState = computed(() => props.snapshot.states[stateIndex.value])
const canGoBack = computed(() => stateIndex.value > 0)
const canGoForward = computed(() => stateIndex.value < props.snapshot.states.length - 1)

watch(
  () => props.snapshot,
  () => {
    stateIndex.value = 0
    exited.value = false
  },
  { deep: true },
)

function hex(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, '0')}`
}

function goBack(): void {
  if (exited.value || !canGoBack.value) return
  stateIndex.value -= 1
}

function goForward(): void {
  if (exited.value || !canGoForward.value) return
  stateIndex.value += 1
}

function reset(): void {
  stateIndex.value = 0
  exited.value = false
}

function exitTui(): void {
  exited.value = true
}

function reenter(): void {
  exited.value = false
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    goBack()
  } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
    event.preventDefault()
    goForward()
  } else if (event.key.toLowerCase() === 'r') {
    event.preventDefault()
    reset()
  } else if (event.key.toLowerCase() === 'q') {
    event.preventDefault()
    exitTui()
  }
}
</script>

<template>
  <section
    class="assembly-tui"
    aria-labelledby="assembly-tui-title"
    tabindex="0"
    @keydown="handleKeydown"
  >
    <header class="tui-header">
      <div>
        <span class="tui-eyebrow">调试视图</span>
        <h4 id="assembly-tui-title">{{ snapshot.title || '汇编单步' }}</h4>
      </div>
      <span class="tui-position" aria-live="polite">
        {{ exited ? '已退出' : `${stateIndex + 1} / ${snapshot.states.length}` }}
      </span>
    </header>

    <div v-if="exited" class="tui-exited" role="status">
      <AppIcon name="terminal" :size="16" />
      <span>已退出调试视图。重新进入后会保留当前状态。</span>
      <button type="button" class="tui-button tui-button-primary" title="重新进入" @click="reenter">
        <AppIcon name="chevron-right" :size="14" />
        <span>重新进入</span>
      </button>
    </div>

    <template v-else-if="currentState">
      <div class="tui-step-line">
        <span class="tui-step-title">{{ currentState.title }}</span>
        <span class="tui-instruction"><small>当前指令</small><code>{{ currentState.instruction }}</code></span>
      </div>
      <p class="tui-explanation">{{ currentState.explanation }}</p>

      <div class="tui-grid">
        <div v-if="currentState.trace" class="tui-table-scroll">
        <table class="tui-table">
          <caption>调用轨迹</caption>
          <thead><tr><th>状态</th><th>函数</th><th>ESP</th></tr></thead>
          <tbody>
            <tr v-for="entry in currentState.trace.entries" :key="entry.id">
              <th scope="row">{{ entry.kind === 'call' ? '调用' : entry.kind === 'return' ? '返回' : '当前' }}</th>
              <td>{{ entry.functionName }}<code>{{ entry.instruction }}</code></td>
              <td><code>{{ hex(entry.stackPointer) }}</code></td>
            </tr>
          </tbody>
        </table>
        </div>

        <div v-if="currentState.registers" class="tui-table-scroll">
        <table class="tui-table">
          <caption>寄存器</caption>
          <thead><tr><th>名称</th><th>单步前</th><th>单步后</th></tr></thead>
          <tbody>
            <tr v-for="register in currentState.registers.registers" :key="register.name">
              <th scope="row">{{ register.name.toUpperCase() }}</th>
              <td><code>{{ hex(register.before) }}</code></td>
              <td><code>{{ hex(register.after) }}</code></td>
            </tr>
          </tbody>
        </table>
        </div>

        <div v-if="currentState.stack" class="tui-table-scroll">
        <table class="tui-table">
          <caption>栈</caption>
          <thead><tr><th>地址</th><th>含义</th><th>值</th></tr></thead>
          <tbody>
            <tr v-for="entry in currentState.stack.entries" :key="entry.address">
              <td><code>{{ hex(entry.address) }}</code></td>
              <td>{{ entry.label }}</td>
              <td><code>{{ hex(entry.value) }}</code></td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>

      <div v-if="currentState.registers && (currentState.registers.flagsBefore || currentState.registers.flagsAfter)" class="tui-flags">
        <span>flags</span>
        <code>前：{{ currentState.registers.flagsBefore?.join(', ') || '无' }}</code>
        <code>后：{{ currentState.registers.flagsAfter?.join(', ') || '无' }}</code>
      </div>
    </template>

    <nav class="tui-controls" aria-label="汇编单步控制">
      <button type="button" class="tui-button" :disabled="exited || !canGoBack" title="上一步" @click="goBack">
        <AppIcon name="chevron-right" :size="14" class="icon-back" />
        <span>上一步</span>
      </button>
      <button type="button" class="tui-button tui-button-primary" :disabled="exited || !canGoForward" title="下一步" @click="goForward">
        <span>下一步</span>
        <AppIcon name="chevron-right" :size="14" />
      </button>
      <button type="button" class="tui-button" title="重置" @click="reset">
        <AppIcon name="rotate-ccw" :size="14" />
        <span>重置</span>
      </button>
      <button v-if="!exited" type="button" class="tui-button tui-button-quiet" title="退出调试视图" @click="exitTui">
        <AppIcon name="x" :size="14" />
        <span>退出</span>
      </button>
    </nav>
  </section>
</template>

<style scoped>
.assembly-tui { margin-top: 12px; padding: 11px; color: var(--text-secondary); background: var(--surface-0); border: var(--hairline) solid var(--border-strong); border-radius: 6px; outline: none; }
.assembly-tui:focus-visible { outline: 2px solid var(--accent-cyan); outline-offset: 2px; }
.tui-header, .tui-controls, .tui-step-line, .tui-exited { display: flex; align-items: center; gap: 8px; }
.tui-header { justify-content: space-between; }
.tui-eyebrow { color: var(--accent-cyan); font-size: 10px; font-weight: 750; }
h4 { margin: 2px 0 0; color: var(--text-primary); font-size: 13px; }
.tui-position { color: var(--text-faint); font: 11px var(--font-mono); }
.tui-step-line { min-width: 0; margin-top: 10px; }
.tui-step-title { flex: 0 0 auto; color: var(--text-primary); font-size: 12px; font-weight: 700; }
.tui-instruction { min-width: 0; display: flex; align-items: baseline; gap: 6px; overflow: hidden; }
.tui-instruction small { flex: 0 0 auto; color: var(--text-faint); font-size: 9px; }
.tui-step-line code { min-width: 0; overflow: hidden; color: var(--accent-amber); font: 11px/1.4 var(--font-mono); text-overflow: ellipsis; white-space: nowrap; }
.tui-explanation { margin: 6px 0 0; color: var(--text-muted); font-size: 12px; line-height: 1.5; }
.tui-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; margin-top: 9px; }
.tui-table-scroll { min-width: 0; overflow-x: auto; }
.tui-table { width: 100%; min-width: 310px; border-collapse: collapse; font-size: 11px; }
.tui-table caption { padding: 5px 6px; color: var(--accent-cyan); font-size: 10px; font-weight: 750; text-align: left; background: var(--surface-2); }
.tui-table th, .tui-table td { padding: 5px 6px; border-top: var(--hairline) solid var(--border-subtle); text-align: left; vertical-align: top; }
.tui-table thead th { color: var(--text-faint); font-size: 10px; font-weight: 650; }
.tui-table tbody th { color: var(--accent-violet); font-family: var(--font-mono); }
.tui-table code { display: block; color: var(--text-primary); font: 10px/1.35 var(--font-mono); }
.tui-flags { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; font: 10px var(--font-mono); }
.tui-flags > span { color: var(--accent-amber); font-weight: 700; }
.tui-flags code { color: var(--text-muted); }
.tui-controls { flex-wrap: wrap; margin-top: 10px; padding-top: 9px; border-top: var(--hairline) solid var(--border-subtle); }
.tui-button { min-height: 32px; display: inline-flex; align-items: center; gap: 5px; padding: 5px 8px; color: var(--text-secondary); background: var(--surface-2); border: var(--hairline) solid var(--border-strong); border-radius: 5px; cursor: pointer; }
.tui-button:hover:not(:disabled), .tui-button:focus-visible { color: var(--text-primary); border-color: var(--accent-cyan-border); }
.tui-button-primary { color: var(--accent-cyan); border-color: var(--accent-cyan-border); }
.tui-button-quiet { margin-left: auto; color: var(--text-faint); }
.tui-button:disabled { cursor: not-allowed; opacity: .4; }
.icon-back { transform: rotate(180deg); }
.tui-exited { flex-wrap: wrap; margin-top: 12px; padding: 10px; color: var(--text-muted); background: var(--surface-2); }
.tui-exited .tui-button { margin-left: auto; }
@media (max-width: 560px) {
  .tui-step-line { align-items: flex-start; flex-direction: column; }
  .tui-button-quiet, .tui-exited .tui-button { margin-left: 0; }
}
</style>
