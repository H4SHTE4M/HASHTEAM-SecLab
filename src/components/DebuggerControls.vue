<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

type DebuggerState = 'idle' | 'ready' | 'stopped' | 'running' | 'exited'

const props = defineProps<{
  state: DebuggerState
  checkpoint?: string
}>()

const emit = defineEmits<{
  (e: 'launch'): void
  (e: 'command', command: string): void
}>()

const register = ref('eax')
const value = ref('0x0')
const address = ref('$esp')
const length = ref('32')
const locationAction = ref('until')
const location = ref(props.checkpoint ?? '_start')
const memoryBytes = ref('41424344')
const commandEnabled = computed(() => props.state === 'ready' || props.state === 'stopped')

watch(
  () => props.checkpoint,
  (checkpoint) => {
    location.value = checkpoint ?? '_start'
  },
)

function send(command: string): void {
  if (props.state === 'idle' || props.state === 'exited') return
  emit('command', command)
}

function runToCheckpoint(): void {
  if (props.checkpoint !== undefined) send(`until ${props.checkpoint}`)
}
</script>

<template>
  <section class="debugger-controls">
    <div class="debugger-controls-header">
      <div>
        <h3>Debugger</h3>
        <p>真实 i386 进程状态</p>
      </div>
      <span class="debugger-state" :data-state="state">{{ state }}</span>
    </div>
    <template>
      <button v-if="state === 'idle' || state === 'exited'" type="button" class="debugger-launch" @click="emit('launch')">
        <AppIcon name="play" :size="14" />
        启动 debugger
      </button>
      <button
        v-if="checkpoint !== undefined"
        type="button"
        class="debugger-checkpoint"
        :disabled="!commandEnabled"
        :title="`until ${checkpoint}`"
        @click="runToCheckpoint"
      >
        <AppIcon name="crosshair" :size="14" />
        <span>运行到本关检查点</span>
        <code>{{ checkpoint }}</code>
      </button>
      <div class="debugger-command-grid">
        <button type="button" title="step" :disabled="!commandEnabled" @click="send('step')"><AppIcon name="activity" :size="14" />单步</button>
        <button type="button" title="continue" :disabled="!commandEnabled" @click="send('continue')"><AppIcon name="play" :size="14" />继续</button>
        <button type="button" title="regs" :disabled="!commandEnabled" @click="send('regs')"><AppIcon name="braces" :size="14" />寄存器</button>
        <button type="button" title="maps" :disabled="!commandEnabled" @click="send('maps')"><AppIcon name="layers" :size="14" />映射</button>
        <button type="button" title="restart" :disabled="!commandEnabled" @click="send('restart')"><AppIcon name="rotate-ccw" :size="14" />重启目标</button>
        <button type="button" title="check" :disabled="!commandEnabled" @click="send('check')"><AppIcon name="check" :size="14" />检查状态</button>
        <button type="button" title="quit" :disabled="!commandEnabled" @click="send('quit')"><AppIcon name="x" :size="14" />退出</button>
      </div>
      <form class="debugger-command-form" @submit.prevent="send('setreg ' + register + ' ' + value)">
        <label for="debugger-register">寄存器</label>
        <select id="debugger-register" v-model="register">
          <option value="eax">EAX</option>
          <option value="ebx">EBX</option>
          <option value="ecx">ECX</option>
          <option value="edx">EDX</option>
          <option value="esi">ESI</option>
          <option value="edi">EDI</option>
          <option value="ebp">EBP</option>
          <option value="esp">ESP</option>
        </select>
        <input v-model="value" aria-label="寄存器值" placeholder="0x..." spellcheck="false" />
        <button type="submit" :disabled="!commandEnabled">写入</button>
      </form>
      <form class="debugger-command-form" @submit.prevent="send('x ' + address + ' ' + length)">
        <label for="debugger-address">内存</label>
        <input id="debugger-address" v-model="address" placeholder="$esp" spellcheck="false" />
        <input v-model="length" aria-label="读取长度" inputmode="numeric" placeholder="32" />
        <button type="submit" :disabled="!commandEnabled">读取</button>
      </form>
      <form class="debugger-command-form" @submit.prevent="send(locationAction + ' ' + location)">
        <label for="debugger-location-action">指令</label>
        <select id="debugger-location-action" v-model="locationAction">
          <option value="until">运行到</option>
          <option value="jump">跳转到</option>
          <option value="break">设断点</option>
        </select>
        <input v-model="location" aria-label="指令地址或符号" placeholder="符号或 0x..." spellcheck="false" />
        <button type="submit" :disabled="!commandEnabled">执行</button>
      </form>
      <form class="debugger-command-form" @submit.prevent="send('setmem ' + address + ' ' + memoryBytes)">
        <label for="debugger-memory-bytes">写内存</label>
        <input id="debugger-memory-bytes" v-model="memoryBytes" placeholder="十六进制字节" spellcheck="false" />
        <button type="submit" :disabled="!commandEnabled">写入</button>
      </form>
    </template>
  </section>
</template>

<style scoped>
.debugger-controls { margin-top: var(--space-4); padding: 13px; background: var(--surface-2); border: var(--hairline) solid var(--accent-cyan-border); border-radius: 8px; }
.debugger-controls-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.debugger-controls h3 { margin: 0; color: var(--text-primary); font-size: 14px; }
.debugger-controls p { margin: 3px 0 0; color: var(--text-muted); font-size: 12px; }
.debugger-state { color: var(--accent-cyan); font: 11px var(--font-mono); text-transform: uppercase; }
.debugger-state[data-state="exited"] { color: var(--accent-amber); }
.debugger-launch, .debugger-checkpoint, .debugger-command-grid button, .debugger-command-form button { min-height: 36px; color: var(--text-primary); background: var(--surface-1); border: var(--hairline) solid var(--border-strong); border-radius: 6px; cursor: pointer; }
.debugger-launch { display: inline-flex; align-items: center; gap: 6px; width: 100%; justify-content: center; margin-top: 11px; color: var(--bg-canvas); background: var(--accent-cyan); border: 0; font-weight: 700; }
.debugger-checkpoint { display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: center; gap: 7px; width: 100%; margin-top: 8px; padding: 7px 10px; text-align: left; }
.debugger-checkpoint code { min-width: 0; overflow-wrap: anywhere; color: var(--accent-cyan); font: 11px var(--font-mono); text-align: right; }
.debugger-command-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 10px; }
.debugger-command-grid button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 0; }
.debugger-checkpoint:disabled, .debugger-command-grid button:disabled, .debugger-command-form button:disabled { opacity: .45; cursor: not-allowed; }
.debugger-command-form { display: grid; grid-template-columns: 50px minmax(0, 1fr) minmax(0, 1fr) auto; align-items: center; gap: 6px; margin-top: 8px; }
.debugger-command-form:last-child { grid-template-columns: 50px minmax(0, 1fr) auto; }
.debugger-command-form label { color: var(--text-muted); font-size: 12px; }
.debugger-command-form input, .debugger-command-form select { min-width: 0; min-height: 36px; padding: 6px 8px; color: var(--text-primary); background: var(--surface-1); border: var(--hairline) solid var(--border-strong); border-radius: 5px; box-sizing: border-box; font: 12px var(--font-mono); }
.debugger-command-form button { padding: 0 10px; }
@media (max-width: 520px) {
  .debugger-command-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .debugger-checkpoint { grid-template-columns: auto minmax(0, 1fr); }
  .debugger-checkpoint code { grid-column: 1 / -1; text-align: left; }
  .debugger-command-form,
  .debugger-command-form:last-child { grid-template-columns: minmax(0, 1fr); }
  .debugger-command-form button { width: 100%; }
}
</style>
