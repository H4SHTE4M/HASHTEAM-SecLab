<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

defineProps<{
  completedCount: number
  total: number
}>()

const emit = defineEmits<{
  (e: 'reset-level'): void
  (e: 'reset-all'): void
  (e: 'about'): void
}>()

/** 「重新开始」需要二次确认：第一次点击后按钮进入确认态 */
const confirming = ref(false)
let confirmTimer: number | null = null

function handleResetAll(): void {
  if (!confirming.value) {
    confirming.value = true
    confirmTimer = window.setTimeout(() => {
      confirming.value = false
      confirmTimer = null
    }, 3000)
    return
  }
  if (confirmTimer !== null) {
    window.clearTimeout(confirmTimer)
    confirmTimer = null
  }
  confirming.value = false
  emit('reset-all')
}

onBeforeUnmount(() => {
  if (confirmTimer !== null) window.clearTimeout(confirmTimer)
})
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">#</span>
      <span class="brand-name">HASHTEAM</span>
      <span class="brand-sub">Security Lab</span>
    </div>
    <div
      class="progress"
      title="关卡进度"
      role="progressbar"
      aria-label="已完成关卡"
      aria-valuemin="0"
      :aria-valuemax="total"
      :aria-valuenow="completedCount"
    >
      <span class="progress-label">进度</span>
      <span class="progress-value">{{ completedCount }} / {{ total }}</span>
    </div>
    <nav class="actions">
      <button type="button" class="btn" @click="emit('reset-level')">重置本关</button>
      <button
        type="button"
        class="btn"
        :class="{ 'btn-danger': confirming }"
        :aria-label="confirming ? '再次点击以确认重新开始' : '重新开始全部关卡'"
        @click="handleResetAll"
      >
        {{ confirming ? '确认重新开始？' : '重新开始' }}
      </button>
      <button type="button" class="btn btn-ghost" @click="emit('about')">关于实验室</button>
    </nav>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 24px;
  height: 56px;
  padding: 0 20px;
  background: #0d1526;
  border-bottom: 1px solid #1c2a44;
  flex-shrink: 0;
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.brand-mark {
  color: #38bdf8;
  font-weight: 700;
  font-size: 20px;
}

.brand-name {
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #e8eef9;
}

.brand-sub {
  color: #7d8aa5;
  font-size: 13px;
}

.progress {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: #111c33;
  border: 1px solid #22314f;
  border-radius: 6px;
  font-size: 13px;
}

.progress-label {
  color: #7d8aa5;
}

.progress-value {
  color: #38bdf8;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.btn {
  padding: 6px 14px;
  font-size: 13px;
  color: #c7d3e8;
  background: #16213a;
  border: 1px solid #27375a;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.btn:hover {
  background: #1c2a49;
  border-color: #35507e;
}

.btn-danger {
  color: #ffb4c0;
  background: #3a1622;
  border-color: #7e2740;
}

.btn-danger:hover {
  background: #4a1b2b;
  border-color: #a13453;
}

.btn-ghost {
  background: transparent;
  border-color: transparent;
  color: #7d8aa5;
}

.btn-ghost:hover {
  background: #16213a;
  color: #c7d3e8;
}

@media (max-width: 600px) {
  .topbar {
    height: auto;
    min-height: 56px;
    padding: 8px 12px;
    gap: 8px 12px;
    flex-wrap: wrap;
    box-sizing: border-box;
  }

  .brand-sub {
    display: none;
  }

  .progress {
    margin-left: auto;
  }

  .actions {
    width: 100%;
    margin-left: 0;
  }

  .btn {
    flex: 1;
    padding-inline: 8px;
    white-space: nowrap;
  }
}
</style>
