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
          data-tooltip="关闭"
          data-tooltip-placement="left"
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
  background: var(--overlay-backdrop);
  backdrop-filter: blur(10px) saturate(115%);
  box-sizing: border-box;
}

.modal-card {
  width: min(620px, 100%);
  max-height: min(720px, 100%);
  display: flex;
  flex-direction: column;
  background: var(--surface-1);
  border: var(--hairline) solid var(--border-strong);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: var(--shadow-dialog);
  animation: dialog-rise var(--duration-slow) var(--ease-out) both;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 17px 20px 17px 24px;
  border-bottom: var(--hairline) solid var(--border-subtle);
}

.modal-header h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 720;
  color: var(--text-primary);
}

.btn-close {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  background: transparent;
  border: var(--hairline) solid transparent;
  border-radius: 7px;
  cursor: pointer;
  padding: 0;
}

.btn-close:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
  border-color: var(--border-strong);
  transform: rotate(2deg);
}

.modal-body {
  padding: 22px 24px 26px;
  overflow-y: auto;
}

.modal-body h3 {
  margin: 18px 0 8px;
  font-size: 14px;
  font-weight: 720;
  color: var(--accent-cyan);
}

.modal-body p,
.modal-body li {
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-secondary);
}

.modal-body ul {
  margin: 0;
  padding-left: 20px;
}

.modal-body li + li {
  margin-top: 7px;
}

.modal-body a {
  color: var(--accent-cyan);
}

.build-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 0;
  color: var(--text-muted);
}

.build-info code {
  padding: 2px 6px;
  color: var(--text-secondary);
  background: var(--surface-2);
  border: var(--hairline) solid var(--border-subtle);
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
    gap: 12px;
    padding: 12px 14px 12px 16px;
  }

  .modal-header h2 {
    font-size: 16px;
    line-height: 1.4;
  }

  .btn-close {
    flex: 0 0 44px;
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
