<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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

const parameterValues = ref<Record<string, string>>({})
const error = ref('')

watch(
  () => props.labId,
  () => {
    parameterValues.value = {}
    error.value = ''
  },
)

function isUnreplacedPlaceholder(value: string): boolean {
  return /<[^<>\n]+>|\{\{[^{}\n]+\}\}/.test(value)
}

function parameterLabel(token: string): string {
  return token.replace(/^<|>$/g, '')
}

function parameterPrompt(token: string): string {
  const label = parameterLabel(token).replace(/\s+/g, ' ').trim()
  const detailSeparator = label.lastIndexOf('的')
  const shortLabel = (detailSeparator >= 0 ? label.slice(detailSeparator + 1) : label)
    .replace(/\s+/g, '')

  // Keep the prompt readable inside narrow, equal-width fields. The detailed
  // meaning remains visible above the fields and available to assistive tools.
  if (shortLabel === '十六进制写法') return '十六进制'
  if (shortLabel === '十进制值') return '十进制'
  const qualifiedField = shortLabel.match(/^[._A-Za-z][._A-Za-z0-9]*(地址|类型|标志)$/)
  if (qualifiedField) return qualifiedField[1]

  const registerResult = shortLabel.match(/^(?:MOV|LEA)后([A-Z]{2,3})$/)
  if (registerResult) return `${registerResult[1]}值`

  const branchResult = shortLabel.match(/^(?:TEST|CMP)后(JE|JG)$/)
  if (branchResult) return `${branchResult[1]}结果`

  if (/^(?:第一次|第二次)(?:PUSH后ESP)$/.test(shortLabel)) return 'ESP'
  if (/^(?:第一次|第二次)POP值$/.test(shortLabel)) return 'POP值'
  if (/^(?:第一次|第二次)取出值$/.test(shortLabel)) return '取出值'
  if (shortLabel === '随后栈顶值') return '栈顶值'
  if (shortLabel === '栈顶寄存器') return '寄存器'
  if (shortLabel === 'call目标函数') return '目标函数'
  if (shortLabel === '条件跳转助记符') return '助记符'
  if (shortLabel === 'JG符号关系') return '符号关系'
  if (shortLabel === 'JE依据') return '依据'
  if (shortLabel === '清理字节数') return '字节数'
  if (shortLabel === 'EAX返回值') return 'EAX值'
  if (shortLabel === '字节序标记') return '字节序'
  if (shortLabel === '字符串标记') return '字符串'

  if (shortLabel.length <= 4) return shortLabel
  const semanticSuffix = shortLabel.match(/(地址|类型|标志|权限|结果|数值|数量|值|函数|助记符|立即数|金额|口令|写法)$/)?.[1]
  return semanticSuffix && semanticSuffix.length <= 4 ? semanticSuffix : '值'
}

const parameterDetails = computed(() =>
  props.verification.placeholders.map(
    (placeholder, index) =>
      `第${index + 1}项“${parameterLabel(placeholder.token)}”：${placeholder.meaning}`,
  ),
)

function buildCommand(): string | null {
  const placeholders = props.verification.placeholders
  if (placeholders.length === 0) return normalizeAnswer(props.verification.usage)

  // Keep accepting a pasted full command while the parameter fields provide the
  // primary path for the structured verification UI.
  const firstValue = normalizeAnswer(parameterValues.value[placeholders[0].token] ?? '')
  if (/^check(?:\s|$)/.test(firstValue)) return firstValue

  let generated = normalizeAnswer(props.verification.usage)
  for (const placeholder of placeholders) {
    const value = normalizeAnswer(parameterValues.value[placeholder.token] ?? '')
    if (!value) {
      error.value = `请填写“${placeholder.meaning}”。`
      return null
    }
    if (/\r|\n/.test(value)) {
      error.value = '参数不能包含换行，请填写单个观察值。'
      return null
    }
    if (isUnreplacedPlaceholder(value)) {
      error.value = '仍有尖括号占位符，请换成真实观察值。'
      return null
    }
    generated = generated.split(placeholder.token).join(value)
  }
  return normalizeAnswer(generated)
}

function submit(): void {
  if (!props.available) {
    error.value = '先完成当前教学步骤，验证区才会开放。'
    return
  }
  const normalized = buildCommand()
  if (normalized === null) return
  if (!normalized) {
    error.value = '验证命令不能为空。'
    return
  }
  if (!/^check(?:\s|$)/.test(normalized)) {
    error.value = '验证命令应以 check 开头。'
    return
  }
  if (isUnreplacedPlaceholder(normalized)) {
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
      <p class="verification-instruction">{{ verification.instruction }}</p>
      <p v-if="verification.placeholders.length > 0" class="verification-details">
        <span
          v-for="(detail, index) in parameterDetails"
          :key="index"
          class="verification-detail-line"
        >{{ detail }}{{ index === parameterDetails.length - 1 ? '。' : '；' }}</span>
      </p>
      <form class="verification-form" @submit.prevent="submit">
        <div
          v-if="verification.placeholders.length > 0"
          class="verification-fields"
          role="group"
          aria-label="验证参数"
        >
          <label
            v-for="(placeholder, index) in verification.placeholders"
            :key="placeholder.token"
            class="verification-field"
            :for="`verification-${labId}-${index}`"
          >
            <input
              :id="`verification-${labId}-${index}`"
              v-model="parameterValues[placeholder.token]"
              :aria-label="placeholder.meaning"
              :placeholder="parameterPrompt(placeholder.token)"
              :title="placeholder.meaning"
              autocomplete="off"
              spellcheck="false"
              data-verification-parameter
            />
          </label>
        </div>
        <button type="submit" @click.prevent="submit">在终端验证</button>
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
.verification-form { display: grid; gap: 9px; margin-top: 10px; min-width: 0; }
.verification-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; min-width: 0; }
.verification-field { display: grid; gap: 4px; min-width: 0; overflow: hidden; color: var(--text-muted); font-size: 12px; }
.verification-instruction,
.verification-details { overflow-wrap: anywhere; }
.verification-details { margin-top: 7px !important; color: var(--text-muted); font-size: 12px !important; line-height: 1.6 !important; }
.verification-detail-line { display: block; }
.verification-field input { width: 100%; min-width: 0; min-height: 42px; padding: 8px 10px; overflow: hidden; color: var(--text-primary); font: 13px var(--font-mono); white-space: nowrap; background: var(--surface-1); border: var(--hairline) solid var(--border-strong); border-radius: 6px; box-sizing: border-box; }
.verification-field input::placeholder { color: var(--text-faint); opacity: 1; }
.verification-form button { width: 100%; min-height: 44px; color: var(--bg-canvas); font-size: 14px; font-weight: 750; background: var(--accent-cyan); border: 0; border-radius: 7px; cursor: pointer; }
.inline-error { margin-top: 9px !important; color: var(--accent-red); font-size: 13px !important; }

@media (max-width: 520px) {
  .verification-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
