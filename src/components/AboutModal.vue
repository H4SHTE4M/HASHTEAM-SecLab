<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { CTF_POSITIONING, LAB_DIRECTIONS } from '../data/levels'

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
        <button ref="closeButtonRef" type="button" class="btn-close" aria-label="关闭" @click="close">×</button>
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
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(7, 11, 20, 0.7);
}

.modal-card {
  width: min(620px, 92vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #0f1830;
  border: 1px solid #22314f;
  border-radius: 12px;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #1c2a44;
}

.modal-header h2 {
  margin: 0;
  font-size: 17px;
  color: #eef3fc;
}

.btn-close {
  font-size: 22px;
  line-height: 1;
  color: #7d8aa5;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 4px;
}

.btn-close:hover {
  color: #e8eef9;
}

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
}

.modal-body h3 {
  margin: 18px 0 8px;
  font-size: 14px;
  color: #38bdf8;
}

.modal-body p,
.modal-body li {
  font-size: 14px;
  line-height: 1.85;
  color: #c7d3e8;
}

.modal-body a {
  color: #7dd3fc;
}

.modal-body ul {
  margin: 0;
  padding-left: 20px;
}

@media (max-width: 520px) {
  .modal-header {
    padding: 12px 16px;
  }

  .modal-body {
    padding: 16px;
  }

  .btn-close {
    min-width: 44px;
    min-height: 44px;
  }
}
</style>
