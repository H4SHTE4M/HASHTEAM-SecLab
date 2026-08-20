<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useTerminalShortcuts } from '../composables/useTerminalShortcuts'
import { loadTerminalFonts, remeasureTerminal } from '../composables/useTerminalMetrics'

const emit = defineEmits<{
  (e: 'input', data: string): void
  (e: 'font-size-delta', delta: number): void
}>()

const props = withDefaults(defineProps<{
  fontSize?: number
  autoFocus?: boolean
}>(), {
  fontSize: 14,
  autoFocus: true,
})

const containerRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let resizeFrame: number | null = null

const {
  isSearchOpen,
  searchQuery,
  handleTerminalKey,
  handleKeydownCapture,
  attach: attachSearch,
  closeSearch,
  searchNext,
  searchPrevious,
  searchLive,
} = useTerminalShortcuts({
  getTerminal: () => terminal,
  getContainer: () => containerRef.value,
  onPaste: (text) => emit('input', text),
  onFontSizeDelta: (delta) => emit('font-size-delta', delta),
})

function scheduleFit(): void {
  if (resizeFrame !== null) return
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = null
    try {
      fitAddon?.fit()
      if (terminal !== null && terminal.rows > 0) terminal.refresh(0, terminal.rows - 1)
    } catch {
      // 容器隐藏或可视视口切换中时，下一次观察会重新测量。
    }
  })
}

function write(data: string): void {
  terminal?.write(data)
}

function focus(): void {
  terminal?.focus()
}

watch(
  () => props.fontSize,
  (fontSize) => {
    if (terminal === null) return
    terminal.options.fontSize = fontSize
    scheduleFit()
  },
)

watch(
  () => props.autoFocus,
  (autoFocus) => {
    if (autoFocus) focus()
  },
  { flush: 'post' },
)

watch(isSearchOpen, (open) => {
  if (open) void nextTick(() => searchInputRef.value?.focus())
})

onMounted(() => {
  const container = containerRef.value
  if (container === null) return

  const terminalFontFamily =
    getComputedStyle(document.documentElement).getPropertyValue('--font-terminal').trim() ||
    '"Sarasa Term SC", "CaskaydiaCove Nerd Font Mono", "JetBrains Mono", "Noto Sans SC Variable", monospace'

  terminal = new Terminal({
    fontFamily: terminalFontFamily,
    fontSize: props.fontSize,
    fontWeight: 400,
    fontWeightBold: 600,
    lineHeight: 1.34,
    letterSpacing: 0,
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback: 5000,
    convertEol: false,
    minimumContrastRatio: 4.5,
    rescaleOverlappingGlyphs: true,
    theme: {
      background: '#090d10',
      foreground: '#dce3e1',
      cursor: '#83e1de',
      cursorAccent: '#090d10',
      selectionBackground: '#244946',
      black: '#090d10',
      blue: '#78a9e3',
      cyan: '#6bd5d2',
      green: '#7fce96',
      magenta: '#bc97d8',
      red: '#e17982',
      white: '#dce3e1',
      yellow: '#dfb968',
      brightBlack: '#71807d',
      brightBlue: '#94bdf0',
      brightCyan: '#83e1de',
      brightGreen: '#9adeac',
      brightMagenta: '#d1abe9',
      brightRed: '#ee979e',
      brightWhite: '#f4f7f6',
      brightYellow: '#efca80',
    },
  })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  attachSearch(terminal)
  terminal.open(container)
  scheduleFit()

  terminal.attachCustomKeyEventHandler(handleTerminalKey)

  terminal.onData((data) => emit('input', data))
  if (props.autoFocus) terminal.focus()
  container.addEventListener('click', focus)
  window.addEventListener('keydown', handleKeydownCapture, true)

  resizeObserver = new ResizeObserver(scheduleFit)
  resizeObserver.observe(container)
  window.addEventListener('resize', scheduleFit, { passive: true })
  window.visualViewport?.addEventListener('resize', scheduleFit, { passive: true })
  // 字体是异步加载的，而 xterm 只在 open() 时量一次单元格宽度、且没有任何字体加载监听。
  // 必须等字体真正就绪后强制重量一次，否则网格会一直按系统兜底等宽字体的宽度排版，
  // 而字形按 Sarasa 的宽度绘制，选区/光标就会逐列偏移并盖住文字。
  void loadTerminalFonts(terminalFontFamily, props.fontSize)
    .then(() => document.fonts?.ready)
    .then(() => {
      if (terminal === null) return
      remeasureTerminal(terminal)
      scheduleFit()
    })
    .catch(() => undefined)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleFit)
  window.visualViewport?.removeEventListener('resize', scheduleFit)
  window.removeEventListener('keydown', handleKeydownCapture, true)
  if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame)
  resizeFrame = null
  resizeObserver?.disconnect()
  resizeObserver = null
  terminal?.dispose()
  terminal = null
  fitAddon = null
})

defineExpose({ write, focus })
</script>

<template>
  <div class="lab-terminal">
    <div v-if="isSearchOpen" class="terminal-search" role="search">
      <input
        ref="searchInputRef"
        v-model="searchQuery"
        type="text"
        placeholder="搜索终端输出…"
        autocomplete="off"
        spellcheck="false"
        @input="searchLive"
        @keydown.enter.prevent="searchNext"
        @keydown.shift.enter.prevent="searchPrevious"
        @keydown.esc.prevent="closeSearch"
      />
      <button type="button" class="search-btn" aria-label="上一个匹配" @click="searchPrevious">↑</button>
      <button type="button" class="search-btn" aria-label="下一个匹配" @click="searchNext">↓</button>
      <button type="button" class="search-btn" aria-label="关闭搜索" @click="closeSearch">×</button>
    </div>
    <div ref="containerRef" class="terminal-viewport" aria-label="Linux 终端" />
  </div>
</template>

<style scoped>
.lab-terminal {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: clamp(18px, 2vw, 28px);
  background: #090d0f;
  overflow: hidden;
  contain: layout paint;
  touch-action: pan-y;
}

.terminal-search {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: #0f1517;
  border: 1px solid #2a3639;
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
}

.terminal-search input {
  width: 220px;
  min-width: 120px;
  padding: 4px 8px;
  color: #dce3e1;
  font: 12px/1.4 var(--font-mono);
  background: transparent;
  border: 0;
  outline: 0;
}

.terminal-search input::placeholder {
  color: #71807d;
}

.search-btn {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  color: #9db0ad;
  font-size: 13px;
  background: transparent;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}

.search-btn:hover {
  color: #dce3e1;
  background: #1b2427;
}

.terminal-viewport {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.terminal-viewport :deep(.xterm) {
  height: 100%;
}

.terminal-viewport :deep(.xterm-viewport) {
  scrollbar-color: #3a474b transparent;
}
</style>
