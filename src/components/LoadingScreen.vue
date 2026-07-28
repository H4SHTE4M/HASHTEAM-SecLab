<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { BootStage } from '../types/lab'
import { subscribe, type BootLogEntry } from '../services/boot-logger'

const props = defineProps<{
  stage: BootStage
  errorMessage: string | null
}>()

const emit = defineEmits<{
  (e: 'retry'): void
}>()

interface StageItem {
  key: BootStage
  label: string
}

const STAGES: StageItem[] = [
  { key: 'loading-assets', label: '正在加载虚拟机资源' },
  { key: 'starting-linux', label: '正在启动 Linux' },
  { key: 'preparing-env', label: '正在准备实验环境' },
  { key: 'ready', label: '环境已就绪' },
]

const stageOrder: Record<BootStage, number> = {
  idle: -1,
  'loading-assets': 0,
  'starting-linux': 1,
  'preparing-env': 2,
  ready: 3,
  error: -2,
}

const currentOrder = computed(() => stageOrder[props.stage])

function stageState(key: BootStage): 'done' | 'active' | 'pending' {
  const order = stageOrder[key]
  if (order < currentOrder.value) return 'done'
  if (order === currentOrder.value) return 'active'
  return 'pending'
}

// 启动日志：订阅 boot-logger，界面实时显示串口/协议/阶段事件
const logs = ref<BootLogEntry[]>([])
const showLogs = ref(false)
const unsubscribe = subscribe((entries) => {
  logs.value = entries
  // 卡在 preparing-env 时自动展开日志，便于排查
  if (props.stage === 'preparing-env') showLogs.value = true
})
onBeforeUnmount(() => unsubscribe())

const logContainer = ref<HTMLDivElement | null>(null)
function toggleLogs(): void {
  showLogs.value = !showLogs.value
}
</script>

<template>
  <div
    class="loading-overlay"
    :role="stage === 'error' ? 'alert' : 'status'"
    :aria-live="stage === 'error' ? 'assertive' : 'polite'"
    aria-atomic="false"
    :aria-busy="stage !== 'error'"
    aria-label="Linux 实验环境启动状态"
  >
    <div class="loading-card">
      <div class="loading-brand">
        <span class="mark">#</span> HASHTEAM <span class="sub">Security Lab</span>
      </div>

      <template v-if="stage !== 'error'">
        <ul class="stage-list">
          <li v-for="item in STAGES" :key="item.key" class="stage-item" :class="stageState(item.key)">
            <span class="stage-icon">
              <template v-if="stageState(item.key) === 'done'">✓</template>
              <template v-else-if="stageState(item.key) === 'active'"><span class="spinner" aria-hidden="true" /></template>
              <template v-else>·</template>
            </span>
            <span>{{ item.label }}</span>
          </li>
        </ul>
        <p class="loading-note">Linux 正在你的浏览器里本地启动，首次加载需要一些时间。</p>

        <div class="log-panel">
          <button
            type="button"
            class="log-toggle"
            :aria-expanded="showLogs"
            aria-controls="boot-log-list"
            @click="toggleLogs"
          >
            {{ showLogs ? '▾' : '▸' }} 启动日志 ({{ logs.length }})
          </button>
          <div
            v-if="showLogs"
            id="boot-log-list"
            ref="logContainer"
            class="log-list"
            aria-live="off"
          >
            <p v-if="logs.length === 0" class="log-empty">暂无日志</p>
            <div
              v-for="entry in logs.slice(-80)"
              :key="entry.seq"
              class="log-line"
              :class="`log-${entry.level}`"
            >
              <span class="log-time">+{{ entry.time }}ms</span>
              <span class="log-source">{{ entry.source }}</span>
              <span class="log-text">{{ entry.text }}</span>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="error-box">
          <p class="error-title">加载失败</p>
          <p class="error-message">{{ errorMessage ?? '未知错误' }}</p>
          <button type="button" class="btn-retry" @click="emit('retry')">重试</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow-y: auto;
  box-sizing: border-box;
  overscroll-behavior: contain;
  background: rgba(7, 11, 20, 0.92);
  backdrop-filter: blur(2px);
}

.loading-card {
  width: min(420px, 90vw);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 32px;
  box-sizing: border-box;
  background: #0f1830;
  border: 1px solid #22314f;
  border-radius: 12px;
}

.loading-brand {
  font-size: 18px;
  font-weight: 700;
  color: #e8eef9;
  margin-bottom: 24px;
  text-align: center;
}

.loading-brand .mark {
  color: #38bdf8;
}

.loading-brand .sub {
  color: #7d8aa5;
  font-size: 14px;
  font-weight: 400;
}

.stage-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.stage-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 4px;
  font-size: 14px;
  color: #8b9bbb;
  transition: color 0.2s ease;
}

.stage-item.active {
  color: #e8eef9;
}

.stage-item.done {
  color: #7fdba7;
}

.stage-icon {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(56, 189, 248, 0.25);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-note {
  margin: 20px 0 0;
  font-size: 12px;
  color: #8b9bbb;
  text-align: center;
  line-height: 1.6;
}

.error-box {
  text-align: center;
}

.error-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: #ff9eb0;
}

.error-message {
  margin: 0 0 20px;
  font-size: 13px;
  color: #b8c5dd;
  line-height: 1.7;
  word-break: break-all;
}

.btn-retry {
  padding: 8px 28px;
  font-size: 14px;
  color: #06121f;
  font-weight: 600;
  background: #38bdf8;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.btn-retry:hover {
  background: #5ccbf9;
}

.log-panel {
  margin-top: 16px;
  text-align: left;
}

.log-toggle {
  background: none;
  border: none;
  color: #7d8aa5;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 0;
  font-family: inherit;
}

.log-toggle:hover {
  color: #b8c5dd;
}

.log-list {
  margin-top: 8px;
  max-height: 180px;
  overflow-y: auto;
  padding: 8px 10px;
  background: #0a101f;
  border: 1px solid #1c2a44;
  border-radius: 6px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 11px;
  line-height: 1.6;
}

.log-empty {
  margin: 0;
  color: #8b9bbb;
}

.log-line {
  display: grid;
  grid-template-columns: 64px 60px 1fr;
  gap: 8px;
  white-space: pre-wrap;
  word-break: break-all;
  color: #b8c5dd;
}

.log-time {
  color: #5a6a8a;
}

.log-source {
  color: #38bdf8;
}

.log-text {
  color: #d6deeb;
}

.log-line.log-warn .log-text {
  color: #f5c97b;
}

.log-line.log-error .log-text {
  color: #ff9eb0;
}

@media (max-width: 520px) {
  .loading-card {
    padding: 24px 20px;
  }

  .btn-retry,
  .log-toggle {
    min-height: 44px;
  }
}
</style>
