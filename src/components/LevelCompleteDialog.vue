<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

defineProps<{
  levelId: number
  levelName: string
  isLast: boolean
}>()

const emit = defineEmits<{
  (e: 'next'): void
  (e: 'dismiss'): void
}>()

const dialogRef = ref<HTMLElement | null>(null)
const nextButtonRef = ref<HTMLButtonElement | null>(null)

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [tabindex]:not([tabindex="-1"])'

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('dismiss')
    return
  }
  if (event.key !== 'Tab' || dialogRef.value === null) return

  const focusable = Array.from(dialogRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  void nextTick(() => nextButtonRef.value?.focus())
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="complete-mask">
      <section
        ref="dialogRef"
        class="complete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="level-complete-title"
        aria-describedby="level-complete-description"
        tabindex="-1"
      >
        <div class="success-icon" aria-hidden="true">✓</div>
        <span class="success-eyebrow">验证通过</span>
        <h2 id="level-complete-title">第 {{ levelId }} 关通关！</h2>
        <p id="level-complete-description">
          你完成了“{{ levelName }}”。{{ isLast ? '所有关卡都已完成。' : '下一关已经解锁。' }}
        </p>
        <button ref="nextButtonRef" type="button" class="btn-dialog-next" @click="emit('next')">
          {{ isLast ? '查看通关总结 →' : `立即进入第 ${levelId + 1} 关 →` }}
        </button>
        <button type="button" class="btn-dialog-review" @click="emit('dismiss')">
          先留在本关查看总结
        </button>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.complete-mask {
  position: fixed;
  inset: 0;
  z-index: 65;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(5, 9, 18, 0.76);
  box-sizing: border-box;
}

.complete-dialog {
  width: min(440px, 100%);
  padding: 30px;
  color: #c7d3e8;
  text-align: center;
  background: #0f1830;
  border: 1px solid rgba(127, 219, 167, 0.5);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.48);
  box-sizing: border-box;
}

.success-icon {
  width: 58px;
  height: 58px;
  display: grid;
  margin: 0 auto 14px;
  place-items: center;
  color: #06121f;
  font-size: 30px;
  font-weight: 900;
  background: #7fdba7;
  border-radius: 50%;
  box-shadow: 0 0 0 8px rgba(127, 219, 167, 0.1);
}

.success-eyebrow {
  color: #7fdba7;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

h2 {
  margin: 7px 0 0;
  color: #eef3fc;
  font-size: 26px;
}

p {
  margin: 12px 0 22px;
  color: #b8c5dd;
  font-size: 14px;
  line-height: 1.7;
}

.btn-dialog-next,
.btn-dialog-review {
  width: 100%;
  border-radius: 9px;
  cursor: pointer;
}

.btn-dialog-next {
  padding: 13px 16px;
  color: #06121f;
  font-size: 16px;
  font-weight: 800;
  background: #38bdf8;
  border: none;
  box-shadow: 0 8px 24px rgba(56, 189, 248, 0.2);
}

.btn-dialog-next:hover {
  background: #5ccbf9;
}

.btn-dialog-review {
  margin-top: 9px;
  padding: 9px 12px;
  color: #93a5c6;
  font-size: 13px;
  background: transparent;
  border: 1px solid transparent;
}

.btn-dialog-review:hover {
  color: #c7d3e8;
  background: #111c33;
}
</style>
