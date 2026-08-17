<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const dialogRef = ref<HTMLElement | null>(null)
const closeButtonRef = ref<HTMLButtonElement | null>(null)
let previouslyFocused: HTMLElement | null = null

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function close(): void {
  emit('close')
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
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

const groups = [
  {
    title: '终端',
    items: [
      { keys: ['Ctrl', 'C'], label: '中断卡住的程序' },
      { keys: ['Ctrl', 'Shift', 'C'], label: '复制选中内容' },
      { keys: ['Ctrl', 'Shift', 'V'], label: '粘贴剪贴板' },
      { keys: ['Ctrl', 'L'], label: '清空终端屏幕' },
      { keys: ['Ctrl', 'Shift', 'F'], label: '在终端输出中搜索' },
      { keys: ['Ctrl', '+'], label: '增大终端字号' },
      { keys: ['Ctrl', '-'], label: '减小终端字号' },
      { keys: ['Ctrl', '0'], label: '复位终端字号' },
    ],
  },
  {
    title: '任务栏',
    items: [
      { keys: ['拖动'], label: '调整任务栏宽度' },
      { keys: ['双击'], label: '复位任务栏宽度' },
      { keys: ['←', '→'], label: '聚焦分隔条时按步调整宽度' },
      { keys: ['Home', 'End'], label: '聚焦分隔条时跳到最小/最大宽度' },
    ],
  },
  {
    title: '通用',
    items: [
      { keys: ['Esc'], label: '关闭当前弹窗' },
      { keys: ['Tab'], label: '在可交互元素间移动焦点' },
    ],
  },
]

onMounted(() => {
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.addEventListener('keydown', handleKeydown)
  void nextTick(() => closeButtonRef.value?.focus())
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  previouslyFocused?.focus()
})
</script>

<template>
  <div class="shortcut-overlay" role="presentation" @click.self="close">
    <section
      ref="dialogRef"
      class="shortcut-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-title"
      tabindex="-1"
    >
      <header class="dialog-header">
        <div>
          <h2 id="shortcut-title">键盘快捷键</h2>
          <p>以下快捷键在实验工作台内生效；终端快捷键仅在终端获得焦点时触发。</p>
        </div>
        <button
          ref="closeButtonRef"
          type="button"
          class="btn-close"
          aria-label="关闭快捷键速查"
          @click="close"
        >
          <AppIcon name="x" :size="18" />
        </button>
      </header>

      <div class="dialog-body">
        <section v-for="group in groups" :key="group.title" class="shortcut-group">
          <h3>{{ group.title }}</h3>
          <ul>
            <li v-for="item in group.items" :key="item.label">
              <span class="keys">
                <kbd v-for="key in item.keys" :key="key">{{ key }}</kbd>
              </span>
              <span class="label">{{ item.label }}</span>
            </li>
          </ul>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.shortcut-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(4, 7, 9, 0.55);
  backdrop-filter: blur(2px);
}

.shortcut-dialog {
  width: min(560px, 100%);
  max-height: min(80vh, 640px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-1);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  outline: none;
}

.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: var(--hairline) solid var(--border-subtle);
}

.dialog-header h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
}

.dialog-header p {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.btn-close {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 0;
  color: var(--text-muted);
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}

.btn-close:hover {
  color: var(--text-primary);
  background: var(--surface-2);
}

.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 20px 20px;
  overflow-y: auto;
}

.shortcut-group h3 {
  margin: 0 0 8px;
  color: var(--accent-cyan);
  font-size: 12px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.shortcut-group ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.shortcut-group li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 26px;
}

.keys {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

kbd {
  min-width: 22px;
  padding: 2px 6px;
  color: var(--text-primary);
  font: 11px/1.6 var(--font-mono);
  text-align: center;
  background: var(--surface-0);
  border: var(--hairline) solid var(--border-subtle);
  border-bottom-width: 2px;
  border-radius: 5px;
}

.label {
  color: var(--text-secondary);
  font-size: 13px;
  text-align: right;
}
</style>
