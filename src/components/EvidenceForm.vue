<script setup lang="ts">
import { ref, watch } from 'vue'
import { normalizeAnswer } from '../services/answer-normalize'
import type { VerificationDef } from '../types/lab'

const props = defineProps<{
  verification: VerificationDef
  available: boolean
  totalSteps: number
  labId: string
}>()

const emit = defineEmits<{
  (e: 'run-command', command: string): void
}>()

const command = ref('')
const error = ref('')

watch(
  () => props.labId,
  () => {
    command.value = ''
    error.value = ''
  },
)

function submit(): void {
  const normalized = normalizeAnswer(command.value)
  if (!props.available) {
    error.value = '先完成当前教学步骤，验证区才会开放。'
    return
  }
  if (!normalized) {
    error.value = '请手动输入完整验证命令。'
    return
  }
  if (!/^check(?:\s|$)/.test(normalized)) {
    error.value = '验证命令应以 check 开头。'
    return
  }
  if (/<[^<>\n]+>|\{\{[^{}\n]+\}\}/.test(normalized)) {
    error.value = '仍有尖括号占位符，请用终端中发现的真实值替换。'
    return
  }
  error.value = ''
  emit('run-command', normalized)
}
</script>

<template>
  <section class="verification" :class="{ locked: !available }">
    <h3>最终验证</h3>
    <template v-if="available">
      <p>{{ verification.instruction }}</p>
      <code>{{ verification.usage }}</code>
      <dl v-if="verification.placeholders.length > 0">
        <div v-for="placeholder in verification.placeholders" :key="placeholder.token">
          <dt>{{ placeholder.token }}</dt>
          <dd>{{ placeholder.meaning }}</dd>
        </div>
      </dl>
      <form class="verification-form" @submit.prevent="submit">
        <label :for="`verification-${labId}`">手动输入完整验证命令</label>
        <input
          :id="`verification-${labId}`"
          v-model="command"
          autocomplete="off"
          spellcheck="false"
          placeholder="不要照抄尖括号占位符"
        />
        <button type="submit">在终端验证</button>
      </form>
      <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
    </template>
    <p v-else>完成全部 {{ totalSteps }} 个必要步骤后开放，每一步都需要你亲自确认。</p>
  </section>
</template>

<style scoped>
.verification { margin-top: var(--space-4); padding: 13px; background: var(--surface-2); border-radius: 8px; }
.verification.locked { color: var(--text-faint); }
.verification h3 { margin: 0 0 7px; color: var(--text-muted); font-size: 14px; font-weight: 650; }
.verification p { margin: 0; font-size: 14px; line-height: 1.65; }
.verification > code { display: block; margin-top: 8px; padding: 8px 9px; overflow-x: auto; color: var(--accent-cyan); background: var(--surface-1); border-radius: 6px; }
.verification dl { margin: 9px 0 0; }
.verification dl div + div { margin-top: 7px; }
.verification dt { color: var(--text-secondary); font-family: var(--font-mono); font-size: 12px; }
.verification dd { margin: 2px 0 0; color: var(--text-muted); font-size: 13px; }
.verification-form { display: grid; gap: 8px; margin-top: 10px; }
.verification-form label { color: var(--text-muted); font-size: 13px; }
.verification-form input { width: 100%; min-height: 42px; padding: 8px 10px; color: var(--text-primary); font-family: var(--font-mono); background: var(--surface-1); border: var(--hairline) solid var(--border-strong); border-radius: 6px; box-sizing: border-box; }
.verification-form button { min-height: 44px; color: var(--bg-canvas); font-size: 14px; font-weight: 750; background: var(--accent-cyan); border: 0; border-radius: 7px; cursor: pointer; }
.inline-error { margin-top: 9px !important; color: var(--accent-red); font-size: 13px !important; }
</style>
