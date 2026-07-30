<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { CTF_POSITIONING, LAB_DIRECTIONS } from '../data/levels'
import { BUILD_INFO } from '../services/build-info'
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
  <div class="modal-mask" @click.self="close">
    <div
      ref="dialogRef"
      class="modal-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-dialog-title"
      tabindex="-1"
    >
      <header class="modal-header">
        <h2 id="about-dialog-title">关于 HASHTEAM 安全实验室</h2>
        <button
          ref="closeButtonRef"
          type="button"
          class="btn-close"
          aria-label="关闭"
          @click="close"
        >
          <AppIcon name="x" :size="18" />
        </button>
      </header>
      <div class="modal-body">
        <p>
          HASHTEAM 是一个由在校学生组成的网络安全实验室。这个「新手村」里的 Linux
          环境在静态资源加载完成后完全运行在你的浏览器本地（基于 WebAssembly
          的 x86 虚拟化）。虚拟机没有网卡，终端命令不会发送到服务器或访问公网。
        </p>
        <h3>实验室方向</h3>
        <ul>
          <li v-for="d in LAB_DIRECTIONS" :key="d.name">
            <strong>{{ d.name }}</strong>——{{ d.description }}
          </li>
        </ul>
        <h3>关于 CTF</h3>
        <p>{{ CTF_POSITIONING }}</p>
        <h3>安全说明</h3>
        <p>
          本环境仅用于教学体验：所有实验都作用于随网页提供的隔离虚拟机。
          客户端关卡可以被分析和修改，因此它不适合作为有奖金或正式排名的比赛系统。
        </p>
        <h3>开源组件与对应源码</h3>
        <p>
          生产环境同时提供第三方许可证声明和 VM 对应源码：
          <a href="./legal/THIRD_PARTY_NOTICES.md">第三方声明</a>
          ·
          <a href="./legal/SOURCE_CODE.md">源码获取说明</a>
        </p>
        <p class="build-info">
          <span>当前构建</span>
          <code :title="BUILD_INFO.sourceId">{{ BUILD_INFO.displayId }}</code>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  width: 100%;
  height: 100vh;
  height: 100svh;
  height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(20px + var(--safe-top)) calc(20px + var(--safe-right)) calc(20px + var(--safe-bottom)) calc(20px + var(--safe-left));
  background: rgba(4, 8, 9, 0.82);
  backdrop-filter: blur(7px) saturate(100%);
  box-sizing: border-box;
}

.modal-card {
  width: min(680px, 100%);
  max-height: min(760px, 100%);
  display: flex;
  flex-direction: column;
  color: #dce3e1;
  background: #090d0f;
  border: var(--hairline) solid #2a3638;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.56), inset 0 1px rgba(255, 255, 255, 0.025);
  animation: dialog-rise var(--duration-slow) var(--ease-out) both;
}

.modal-header {
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px 10px 24px;
  background: #0c1113;
  border-bottom: var(--hairline) solid #273034;
}

.modal-header h2 {
  min-width: 0;
  margin: 0;
  color: #83e1de;
  font-family: var(--font-terminal);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;
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

.modal-body {
  padding: 20px 24px 26px;
  overflow-y: auto;
  font-family: var(--font-terminal);
  scrollbar-color: #3a474b transparent;
}

.modal-body h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 20px 0 8px;
  color: #83e1de;
  font-family: var(--font-terminal);
  font-size: 14px;
  font-weight: 600;
}

.modal-body h3::before {
  color: #6bd5d2;
  content: '›';
}

.modal-body p,
.modal-body li {
  color: #c9d2d0;
  font-size: 14px;
  line-height: 1.85;
}

.modal-body ul {
  margin: 0;
  padding-left: 20px;
}

.modal-body li + li {
  margin-top: 7px;
}

.modal-body a {
  color: #83e1de;
}

.build-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 0;
  color: #71807d;
}

.build-info code {
  padding: 2px 6px;
  color: #c9d2d0;
  background: #0c1113;
  border: var(--hairline) solid #273034;
  border-radius: 4px;
  font-size: 12px;
}

@keyframes dialog-rise {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (max-width: 480px) {
  .modal-mask {
    padding: calc(12px + var(--safe-top)) calc(12px + var(--safe-right)) calc(12px + var(--safe-bottom)) calc(12px + var(--safe-left));
  }

  .modal-header {
    min-height: 52px;
    gap: 10px;
    padding: 8px 8px 8px 16px;
  }

  .modal-header h2 {
    font-size: 16px;
    line-height: 1.4;
  }

  .btn-close {
    flex-basis: 44px;
    width: 44px;
    height: 44px;
  }

  .modal-body {
    padding: 14px 16px 18px;
  }
}

@media (max-height: 600px) {
  .modal-mask {
    align-items: stretch;
    padding-top: calc(8px + var(--safe-top));
    padding-bottom: calc(8px + var(--safe-bottom));
  }

  .modal-card {
    max-height: 100%;
    margin: auto;
  }

  .modal-header {
    padding-block: 8px;
  }

  .modal-body {
    padding-top: 10px;
    padding-bottom: 12px;
  }

  .modal-body h3 {
    margin-top: 12px;
  }
}
</style>
