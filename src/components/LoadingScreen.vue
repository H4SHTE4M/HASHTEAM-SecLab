<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { BootStage } from '../types/lab'
import { subscribe, type BootLogEntry } from '../services/boot-logger'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  stage: BootStage
  errorMessage: string | null
  moduleLabel?: string
}>()

const emit = defineEmits<{
  (e: 'retry'): void
}>()

interface StageItem {
  key: BootStage
  label: string
  shortLabel: string
}

const STAGES: StageItem[] = [
  { key: 'loading-assets', label: '正在加载虚拟机资源', shortLabel: '资源' },
  { key: 'starting-linux', label: '正在启动 Linux', shortLabel: 'Linux' },
  { key: 'preparing-env', label: '正在准备实验环境', shortLabel: '环境' },
  { key: 'ready', label: '环境已就绪', shortLabel: '就绪' },
]

const stageOrder: Record<BootStage, number> = {
  idle: -1,
  'loading-assets': 0,
  'starting-linux': 1,
  'preparing-env': 2,
  ready: 3,
  error: -2,
}

const currentOrder = computed(() => Math.max(0, stageOrder[props.stage]))
const activeStage = computed(() => STAGES[Math.min(currentOrder.value, STAGES.length - 1)])
const progressWidth = computed(() => `${((currentOrder.value + 1) / STAGES.length) * 100}%`)

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
    :aria-busy="stage !== 'ready' && stage !== 'error'"
    aria-label="Linux 实验环境启动状态"
  >
    <div class="loading-float">
      <div class="loading-card">
        <header class="loading-head">
          <div class="loading-brand">
            <span class="mark"><AppIcon name="hash" :size="16" /></span>
            <span class="brand-copy">
              <strong>HASHTEAM</strong>
              <span class="sub">Security Lab</span>
            </span>
          </div>
          <div class="loading-head-actions">
            <span v-if="moduleLabel" class="module-chip" aria-label="当前 Lab">
              <AppIcon name="layers" :size="12" />
              <span>{{ moduleLabel }}</span>
            </span>
            <span class="boot-chip" :class="{ error: stage === 'error' }">
              <span class="boot-pulse" aria-hidden="true" />
              <AppIcon name="server" :size="13" />
              <span>{{ stage === 'error' ? '启动异常' : '本地 VM' }}</span>
            </span>
          </div>
        </header>

        <template v-if="stage !== 'error'">
          <section class="active-stage" aria-label="当前启动阶段">
            <div>
              <span class="stage-kicker">系统初始化</span>
              <Transition name="stage-copy" mode="out-in">
                <strong :key="stage">{{ activeStage.label }}</strong>
              </Transition>
            </div>
            <code>{{ currentOrder + 1 }} / {{ STAGES.length }}</code>
          </section>

          <div class="stage-meter" aria-hidden="true">
            <span :style="{ width: progressWidth }" />
          </div>

          <ul class="stage-list" aria-label="启动阶段">
            <li
              v-for="(item, index) in STAGES"
              :key="item.key"
              class="stage-item"
              :class="stageState(item.key)"
              :aria-current="stageState(item.key) === 'active' ? 'step' : undefined"
              :title="item.label"
            >
              <span class="stage-icon">
                <AppIcon
                  v-if="stageState(item.key) === 'done' || (stage === 'ready' && item.key === 'ready')"
                  name="check"
                  :size="15"
                />
                <span v-else-if="stageState(item.key) === 'active'" class="spinner" aria-hidden="true" />
                <span v-else class="stage-number" aria-hidden="true">{{ index + 1 }}</span>
              </span>
              <span class="stage-label">{{ item.shortLabel }}</span>
            </li>
          </ul>

          <p class="loading-note">
            {{
              stage === 'ready'
                ? 'Linux 已在浏览器中启动，正在打开实验工作台。'
                : 'Linux 正在你的浏览器中本地启动，首次加载约需 10–15 秒（下载约 7MB），请稍候。'
            }}
          </p>

          <div class="log-panel">
            <button
              type="button"
              class="log-toggle"
              :aria-expanded="showLogs"
              aria-controls="boot-log-list"
              @click="toggleLogs"
            >
              <span class="log-toggle-main">
                <AppIcon name="chevron-right" :size="14" :class="{ open: showLogs }" />
                <span>启动日志</span>
              </span>
              <span class="log-count">{{ logs.length }}</span>
            </button>
            <div v-if="showLogs" id="boot-log-list" ref="logContainer" class="log-list">
              <p class="log-reassure">以下是技术日志，不用看懂</p>
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
            <button type="button" class="btn-retry" @click="emit('retry')">
              <AppIcon name="rotate-ccw" :size="16" />
              <span>重试</span>
            </button>
            <p class="error-fallback">多次重试仍失败：换最新版 Chrome / Edge，或截图联系助教</p>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  width: 100%;
  height: 100vh;
  height: 100svh;
  height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(20px + var(--safe-top)) calc(20px + var(--safe-right)) calc(20px + var(--safe-bottom)) calc(20px + var(--safe-left));
  background: var(--overlay-backdrop);
  backdrop-filter: blur(20px) saturate(112%);
  box-sizing: border-box;
  animation: overlay-arrive 260ms ease both;
}

:global(:root[data-theme='light']) .loading-overlay {
  background: var(--overlay-backdrop);
}

.loading-float {
  width: min(440px, 100%);
  max-height: 100%;
  animation: loading-float 5.2s ease-in-out 700ms infinite;
}

.loading-card {
  width: 100%;
  max-height: 100%;
  overflow-y: auto;
  padding: 22px;
  box-sizing: border-box;
  background: var(--floating-surface);
  border: var(--hairline) solid var(--border-strong);
  border-radius: 8px;
  box-shadow: var(--shadow-dialog), 0 10px 28px rgba(4, 10, 6, 0.16);
  backdrop-filter: blur(26px) saturate(118%);
  animation: loading-rise 520ms var(--ease-out) both;
}

.loading-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  animation: loading-content-in 420ms var(--ease-out) 90ms both;
}

.loading-brand {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
  font-family: var(--font-display);
}

.loading-brand .mark {
  flex: 0 0 auto;
  color: var(--accent-coral);
  line-height: 0;
  filter: drop-shadow(0 5px 12px rgba(225, 123, 89, 0.28));
}

.brand-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.brand-copy strong {
  font-size: 16px;
  font-weight: 750;
  line-height: 1;
}

.loading-brand .sub {
  color: var(--text-faint);
  font-size: 10px;
  font-weight: 520;
  line-height: 1;
}
.loading-head-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.module-chip {
  min-height: 28px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  color: var(--accent-cyan);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  background: var(--accent-cyan-soft);
  border: var(--hairline) solid var(--accent-cyan-border);
  border-radius: 6px;
  white-space: nowrap;
}

.boot-chip {
  min-height: 28px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 650;
  background: var(--surface-2);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 6px;
}

.boot-chip.error {
  color: var(--accent-red);
}

.boot-pulse {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  background: var(--accent-green);
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--accent-green-soft);
  animation: boot-pulse 1.9s ease-in-out infinite;
}

.boot-chip.error .boot-pulse {
  background: var(--accent-red);
  box-shadow: none;
  animation: none;
}

.active-stage {
  min-height: 48px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-top: 24px;
  animation: loading-content-in 420ms var(--ease-out) 150ms both;
}

.active-stage > div {
  min-width: 0;
}

.stage-kicker {
  display: block;
  margin-bottom: 5px;
  color: var(--accent-cyan);
  font-size: 10px;
  font-weight: 720;
}

.active-stage strong {
  display: block;
  overflow: hidden;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 660;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.active-stage code {
  flex: 0 0 auto;
  padding-bottom: 2px;
  color: var(--text-faint);
  font: 520 11px/1 var(--font-mono);
}

.stage-copy-enter-active,
.stage-copy-leave-active {
  transition: opacity 180ms ease, transform 220ms var(--ease-out);
}

.stage-copy-enter-from {
  opacity: 0;
  transform: translateY(5px);
}

.stage-copy-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.stage-meter {
  height: 3px;
  margin-top: 12px;
  overflow: hidden;
  background: var(--surface-3);
  border-radius: 2px;
  animation: loading-content-in 420ms var(--ease-out) 190ms both;
}

.stage-meter span {
  display: block;
  height: 100%;
  background: var(--accent-cyan);
  border-radius: inherit;
  box-shadow: 0 0 12px var(--accent-cyan-border);
  transition: width 420ms var(--ease-out);
}

.stage-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  list-style: none;
  margin: 10px 0 0;
  padding: 6px;
  background: var(--surface-0);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 8px;
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.04);
  animation: loading-content-in 420ms var(--ease-out) 230ms both;
}

.stage-item {
  min-width: 0;
  min-height: 54px;
  display: grid;
  grid-template-rows: 30px 12px;
  gap: 4px;
  place-items: center;
  padding: 5px 4px 6px;
  color: var(--text-faint);
  background: transparent;
  border: var(--hairline) solid transparent;
  border-radius: 6px;
  transition: color var(--duration-normal) ease, background-color var(--duration-normal) ease, border-color var(--duration-normal) ease, box-shadow var(--duration-normal) ease;
}

.stage-item.active {
  color: var(--accent-cyan);
  background: var(--surface-raised);
  border-color: var(--accent-cyan-border);
  box-shadow: var(--shadow-control);
}

.stage-item.done {
  color: var(--accent-green);
}

.stage-icon {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  border-radius: 6px;
  transition: transform var(--duration-normal) var(--ease-out), background-color var(--duration-normal) ease;
}

.stage-item.active .stage-icon {
  background: var(--accent-cyan-soft);
  animation: dock-active 1.8s ease-in-out infinite;
}

.stage-item.done .stage-icon {
  background: var(--accent-green-soft);
}

.stage-number {
  font: 600 10px/1 var(--font-mono);
}

.stage-label {
  min-width: 0;
  color: currentColor;
  font-size: 10px;
  font-weight: 620;
  line-height: 1;
  letter-spacing: 0;
  white-space: nowrap;
}

.spinner {
  width: 13px;
  height: 13px;
  border: 2px solid var(--accent-cyan-border);
  border-top-color: var(--accent-cyan);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

.loading-note {
  margin: 14px 0 0;
  color: var(--text-faint);
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
  animation: loading-content-in 420ms var(--ease-out) 270ms both;
}

.error-box {
  margin-top: 28px;
  text-align: center;
  animation: loading-content-in 360ms var(--ease-out) 130ms both;
}

.error-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--accent-red);
}

.error-message {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  word-break: break-all;
}

.error-fallback {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--text-faint);
  line-height: 1.6;
}

.btn-retry {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px 24px;
  font-size: 14px;
  color: var(--accent-cyan-contrast);
  font-weight: 700;
  background: var(--accent-cyan);
  border: none;
  border-radius: 7px;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(101, 212, 206, 0.14), inset 0 1px rgba(255, 255, 255, 0.24);
}

.btn-retry:hover {
  background: var(--accent-cyan-hover);
  transform: translateY(-1px);
}

.log-panel {
  margin-top: 14px;
  text-align: left;
  animation: loading-content-in 420ms var(--ease-out) 310ms both;
}

.log-toggle {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  color: var(--text-muted);
  font-size: 12px;
  font-family: inherit;
  background: var(--surface-0);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 7px;
  cursor: pointer;
}

.log-toggle:hover {
  color: var(--text-secondary);
  background: var(--surface-hover);
  border-color: var(--border-strong);
}

.log-toggle-main {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.log-toggle svg {
  transition: transform 180ms ease;
}

.log-toggle svg.open {
  transform: rotate(90deg);
}

.log-count {
  min-width: 22px;
  height: 20px;
  display: grid;
  place-items: center;
  padding: 0 5px;
  color: var(--text-faint);
  font: 550 10px/1 var(--font-mono);
  background: var(--surface-2);
  border-radius: 5px;
}

.log-list {
  margin-top: 8px;
  max-height: 180px;
  overflow-y: auto;
  padding: 8px 10px;
  background: var(--surface-0);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 7px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.6;
}

.log-empty {
  margin: 0;
  color: var(--text-faint);
}

.log-reassure {
  margin: 0 0 6px;
  color: var(--text-faint);
  font-family: var(--font-ui);
}

.log-line {
  display: grid;
  grid-template-columns: 64px 60px 1fr;
  gap: 8px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-secondary);
}

.log-time {
  color: var(--text-faint);
}

.log-source {
  color: var(--accent-cyan);
}

.log-text {
  color: var(--text-secondary);
}

.log-line.log-warn .log-text {
  color: var(--accent-amber);
}

.log-line.log-error .log-text {
  color: var(--accent-red);
}

@keyframes loading-rise {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.97);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes loading-float {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-3px);
  }
}

@keyframes loading-content-in {
  from {
    opacity: 0;
    transform: translateY(7px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes overlay-arrive {
  from {
    opacity: 0;
    backdrop-filter: blur(4px) saturate(100%);
  }

  to {
    opacity: 1;
    backdrop-filter: blur(20px) saturate(112%);
  }
}

@keyframes boot-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.58;
    transform: scale(0.78);
  }
}

@keyframes dock-active {
  0%,
  100% {
    transform: translateY(0);
  }

  50% {
    transform: translateY(-2px);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 480px) {
  .loading-overlay {
    padding: calc(12px + var(--safe-top)) calc(12px + var(--safe-right)) calc(12px + var(--safe-bottom)) calc(12px + var(--safe-left));
  }

  .loading-card {
    padding: 20px 18px;
  }
}

@media (max-width: 360px) {
  .loading-head {
    gap: 10px;
  }

  .active-stage strong {
    font-size: 16px;
  }

  .log-list {
    padding-inline: 7px;
  }

  .log-line {
    grid-template-columns: 52px minmax(44px, 58px) minmax(0, 1fr);
    gap: 6px;
  }
}

@media (max-height: 600px) {
  .loading-overlay {
    align-items: stretch;
    padding-top: calc(8px + var(--safe-top));
    padding-bottom: calc(8px + var(--safe-bottom));
  }

  .loading-float {
    margin: auto;
    animation: none;
  }

  .loading-card {
    padding-top: 16px;
    padding-bottom: 16px;
  }

  .active-stage {
    min-height: 42px;
    margin-top: 14px;
  }

  .loading-note {
    margin-top: 10px;
  }

  .log-panel {
    margin-top: 8px;
  }

  .log-list {
    max-height: min(120px, 24dvh);
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-overlay,
  .loading-float,
  .loading-card,
  .loading-head,
  .active-stage,
  .stage-meter,
  .stage-list,
  .loading-note,
  .log-panel,
  .error-box,
  .boot-pulse,
  .stage-item.active .stage-icon,
  .spinner {
    animation: none !important;
  }

  .stage-copy-enter-active,
  .stage-copy-leave-active,
  .stage-meter span {
    transition: none !important;
  }
}
</style>
