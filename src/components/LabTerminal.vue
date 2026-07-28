<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const emit = defineEmits<{
  (e: 'input', data: string): void
}>()

const containerRef = ref<HTMLElement | null>(null)
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null

function write(data: string): void {
  terminal?.write(data)
}

function focus(): void {
  terminal?.focus()
}

onMounted(() => {
  const container = containerRef.value
  if (container === null) return

  terminal = new Terminal({
    fontFamily: '"JetBrains Mono", "Fira Code", Consolas, "Noto Sans Mono CJK SC", monospace',
    fontSize: 14,
    lineHeight: 1.25,
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback: 5000,
    convertEol: false,
    theme: {
      background: '#0b1220',
      foreground: '#d6deeb',
      cursor: '#7dd3fc',
      cursorAccent: '#0b1220',
      selectionBackground: '#1e3a5f',
      black: '#0b1220',
      blue: '#82aaff',
      cyan: '#7dd3fc',
      green: '#7fdba7',
      magenta: '#c792ea',
      red: '#ff7a93',
      white: '#d6deeb',
      yellow: '#ffd580',
      brightBlack: '#5b7185',
      brightBlue: '#82aaff',
      brightCyan: '#89ddff',
      brightGreen: '#a8e6c0',
      brightMagenta: '#d0a9f5',
      brightRed: '#ff9eb0',
      brightWhite: '#ffffff',
      brightYellow: '#ffe0a3',
    },
  })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(container)
  fitAddon.fit()

  // xterm.js 自带 ClipboardEvent 处理：有选区时 Ctrl+C 复制、否则作为
  // \x03 发送给真实 tty，粘贴则读取事件中的 clipboardData。不要在这里
  // 无条件拦截快捷键调用 navigator.clipboard，否则权限拒绝或非安全上下文
  // 会同时破坏 xterm 的原生降级路径。

  terminal.onData((data) => emit('input', data))
  terminal.focus()
  container.addEventListener('click', focus)

  resizeObserver = new ResizeObserver(() => {
    try {
      fitAddon?.fit()
    } catch {
      // 容器隐藏时 fit 可能失败，忽略
    }
    // 跨断点缩放时容器最终尺寸在下一帧才稳定，再校正一次行列数
    requestAnimationFrame(() => {
      try {
        fitAddon?.fit()
      } catch {
        // 同上
      }
    })
  })
  resizeObserver.observe(container)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  terminal?.dispose()
  terminal = null
  fitAddon = null
})

defineExpose({ write, focus })
</script>

<template>
  <div ref="containerRef" class="lab-terminal" aria-label="Linux 终端" />
</template>

<style scoped>
.lab-terminal {
  width: 100%;
  height: 100%;
  padding: 8px;
  box-sizing: border-box;
  background: #0b1220;
}

.lab-terminal :deep(.xterm) {
  height: 100%;
}
</style>
