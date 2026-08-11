<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { BlockingAnomaly } from '../services/progress-anomaly'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  anomaly: BlockingAnomaly
  /** 日志已成功下载；由 App 在异常切换时复位 */
  downloaded: boolean
}>()

const emit = defineEmits<{
  /** 按异常种类的修复动作：A → 重置本关（终端环境 + 引导进度）；E1/E2 → 重启实验环境 */
  (e: 'primary-action'): void
  /** 仅 A 类有的次要出口：切到挑战模式绕开步骤校验 */
  (e: 'secondary-action'): void
  (e: 'download'): void
  /** 「先自己看看」：未修复主动关闭，本会话不再弹同 key */
  (e: 'dismiss'): void
}>()

const dialogRef = ref<HTMLElement | null>(null)
const primaryButtonRef = ref<HTMLButtonElement | null>(null)
let previouslyFocused: HTMLElement | null = null

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface DialogCopy {
  title: string
  intro: string
  detail?: string
  primaryLabel: string
  secondaryLabel?: string
}

const copy = computed<DialogCopy>(() => {
  const anomaly = props.anomaly
  switch (anomaly.kind) {
    case 'guide-ahead-of-evidence': {
      const missing = anomaly.missingPrefixSteps.map((id) => `第 ${id + 1} 步`).join('、')
      return {
        title: 'Wow，你挖出了一个稀有 Bug',
        intro:
          `别慌，不是你的操作问题——浏览器存档显示你正在学第 ${anomaly.level} 关的第 ${anomaly.guideStep + 1} 步，` +
          '但这关前面步骤的完成记录缺失，右侧教学步骤被卡死了。这锅是我们的' +
          '（常见于手动修改过浏览器存档，或更换了浏览器 / 设备）。' +
          '修复只要 10 秒：点「重置本关」，终端环境和右侧步骤一起回到本关起点，' +
          '跟着面板快速走一遍即可；急的话也可以切到挑战模式，只凭 check 通关。',
        detail: `缺失完成记录：${missing}${anomaly.truncated ? '（进度还越过了本关最后一步）' : ''}`,
        primaryLabel: '重置本关，满血复活',
        secondaryLabel: '切到挑战模式，继续闯关',
      }
    }
    case 'missing-session-key':
      return {
        title: 'Wow，实验环境的裁判忘带哨子了',
        intro: anomaly.keyPresent
          ? '这次启动的判题密钥格式无效，裁判没法记录你的 check 成绩——' +
            '依然不是你的问题，锅还是我们的。修复只要一下：重启实验环境，让裁判重新上岗。'
          : '这次启动没拿到判题密钥，接下来所有 check 成绩都不会被记录——' +
            '依然不是你的问题，锅还是我们的。修复只要一下：重启实验环境，让裁判重新上岗。',
        primaryLabel: '重启实验环境，让裁判上岗',
      }
    case 'crypto-unavailable':
      return {
        title: 'Wow，这个浏览器没收了裁判的哨子',
        intro: anomaly.isSecureContext
          ? '当前浏览器不支持网页加密接口（WebCrypto），判题验签做不了——' +
            '重启环境也救不了这个。请换用较新的 Chrome / Edge / Firefox / Safari，一切就正常了。'
          : '当前页面不是安全上下文（非 HTTPS），浏览器停用了加密接口，判题验签做不了——' +
            '重启环境也救不了这个。请改用 HTTPS 地址（或 localhost）打开本页，一切就正常了。',
        primaryLabel: '仍要重启碰运气',
      }
  }
})

function dismiss(): void {
  emit('dismiss')
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    dismiss()
    return
  }
  if (event.key !== 'Tab' || dialogRef.value === null) return

  const focusable = Array.from(dialogRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  if (focusable.length === 0) {
    event.preventDefault()
    dialogRef.value.focus()
    return
  }

  const activeIndex = focusable.indexOf(document.activeElement as HTMLElement)
  const nextIndex = event.shiftKey
    ? activeIndex <= 0
      ? focusable.length - 1
      : activeIndex - 1
    : activeIndex < 0 || activeIndex === focusable.length - 1
      ? 0
      : activeIndex + 1

  event.preventDefault()
  focusable[nextIndex]?.focus()
}

onMounted(() => {
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.addEventListener('keydown', handleKeydown)
  void nextTick(() => primaryButtonRef.value?.focus())
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  previouslyFocused?.focus()
})
</script>

<template>
  <div class="report-mask" @click.self="dismiss">
    <div
      ref="dialogRef"
      class="report-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-report-title"
      tabindex="-1"
    >
      <header class="report-header">
        <h2 id="bug-report-title">{{ copy.title }}</h2>
        <button type="button" class="btn-close" aria-label="先自己看看，关闭提示" @click="dismiss">
          <AppIcon name="x" :size="18" />
        </button>
      </header>
      <div class="report-body">
        <p class="report-intro">{{ copy.intro }}</p>
        <p v-if="copy.detail" class="report-detail">{{ copy.detail }}</p>

        <div class="report-actions">
          <button ref="primaryButtonRef" type="button" class="btn-primary" @click="emit('primary-action')">
            {{ copy.primaryLabel }}
          </button>
          <button
            v-if="copy.secondaryLabel"
            type="button"
            class="btn-secondary"
            @click="emit('secondary-action')"
          >
            {{ copy.secondaryLabel }}
          </button>
          <button
            type="button"
            class="btn-download"
            :disabled="downloaded"
            @click="emit('download')"
          >
            {{ downloaded ? '✓ 日志已下载，发群里就完成举报' : '下载现场日志（不用读，甩给开发者）' }}
          </button>
        </div>

        <p class="report-feedback">
          日志不用你自己看懂：把下载的 .json 文件和终端最后几行的截图发到
          <strong>SDUCTF 新手村 QQ 群：985019477</strong>，你就是今天的捉虫英雄。
        </p>
        <button type="button" class="btn-dismiss" @click="dismiss">先自己看看（本次打开不再提示）</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.report-mask {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(16px + var(--safe-top)) calc(16px + var(--safe-right)) calc(16px + var(--safe-bottom)) calc(16px + var(--safe-left));
  background: rgba(4, 8, 9, 0.82);
  backdrop-filter: blur(7px) saturate(100%);
  box-sizing: border-box;
}

.report-card {
  width: min(100%, clamp(24rem, 92vw, 30rem));
  max-height: min(100%, 82dvh);
  display: flex;
  flex-direction: column;
  color: #dce3e1;
  background: #090d0f;
  border: var(--hairline) solid #2a3638;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.56), inset 0 1px rgba(255, 255, 255, 0.025);
  animation: report-dialog-rise var(--duration-slow) var(--ease-out) both;
}

@keyframes report-dialog-rise {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.report-header {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px 10px 20px;
  background: #0c1113;
  border-bottom: var(--hairline) solid #273034;
}

.report-header h2 {
  min-width: 0;
  margin: 0;
  color: #f0b869;
  font-family: var(--font-terminal);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.btn-close {
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  padding: 0;
  color: #71807d;
  background: #090d0f;
  border: var(--hairline) solid #273034;
  border-radius: 6px;
  cursor: pointer;
}

.btn-close:hover,
.btn-close:focus-visible {
  color: #83e1de;
  background: #11191b;
  border-color: #4c8f90;
  box-shadow: 0 0 0 2px rgba(107, 213, 210, 0.12);
}

.report-body {
  padding: 16px 20px 18px;
  overflow-y: auto;
  font-family: var(--font-terminal);
  scrollbar-color: #3a474b transparent;
}

.report-body p {
  margin: 0;
  color: #c9d2d0;
  font-size: 13.5px;
  line-height: 1.8;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}

.report-detail {
  margin-top: 10px !important;
  color: #9aa8a5 !important;
  font-size: 12.5px !important;
}

.report-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.btn-primary {
  flex: 1 1 auto;
  min-height: 38px;
  padding: 8px 16px;
  color: #06211f;
  font-family: var(--font-terminal);
  font-size: 13.5px;
  font-weight: 700;
  background: #6bd5d2;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-primary:hover,
.btn-primary:focus-visible {
  background: #83e1de;
  box-shadow: 0 0 0 2px rgba(107, 213, 210, 0.25);
}

.btn-secondary {
  flex: 0 1 auto;
  min-height: 38px;
  padding: 8px 14px;
  color: #c9d2d0;
  font-family: var(--font-terminal);
  font-size: 13px;
  background: #11191b;
  border: var(--hairline) solid #3a474b;
  border-radius: 6px;
  cursor: pointer;
}

.btn-secondary:hover,
.btn-secondary:focus-visible {
  color: #83e1de;
  border-color: #4c8f90;
  box-shadow: 0 0 0 2px rgba(107, 213, 210, 0.12);
}

.btn-download {
  flex: 0 1 auto;
  min-height: 38px;
  padding: 8px 14px;
  color: #83e1de;
  font-family: var(--font-terminal);
  font-size: 13px;
  background: transparent;
  border: var(--hairline) solid #4c8f90;
  border-radius: 6px;
  cursor: pointer;
}

.btn-download:hover:not(:disabled),
.btn-download:focus-visible:not(:disabled) {
  background: #11191b;
  box-shadow: 0 0 0 2px rgba(107, 213, 210, 0.12);
}

.btn-download:disabled {
  color: #5f7a76;
  border-color: #2f3f41;
  cursor: default;
}

.report-feedback {
  margin-top: 14px !important;
  color: #9aa8a5 !important;
  font-size: 12.5px !important;
}

.report-feedback strong {
  color: #c9d2d0;
}

.btn-dismiss {
  margin-top: 10px;
  padding: 4px 0;
  color: #71807d;
  font-family: var(--font-terminal);
  font-size: 12.5px;
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.btn-dismiss:hover,
.btn-dismiss:focus-visible {
  color: #83e1de;
}
</style>
