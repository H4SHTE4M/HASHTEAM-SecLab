<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const emit = defineEmits<{
  (e: 'input', data: string): void
}>()

const props = withDefaults(defineProps<{
  fontSize?: number
  autoFocus?: boolean
}>(), {
  fontSize: 14,
  autoFocus: true,
})

const containerRef = ref<HTMLElement | null>(null)
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null
let resizeFrame: number | null = null

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

function isCopyShortcut(event: KeyboardEvent): boolean {
  return event.type === 'keydown' &&
    event.ctrlKey &&
    event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    event.key.toLowerCase() === 'c'
}

function copyWithTextArea(text: string): void {
  if (typeof document.execCommand !== 'function') return

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('aria-hidden', 'true')
  textArea.style.position = 'fixed'
  textArea.style.inset = '0 auto auto -9999px'
  document.body.appendChild(textArea)
  textArea.select()
  try {
    document.execCommand('copy')
  } finally {
    textArea.remove()
    terminal?.focus()
  }
}

async function copyTerminalSelection(text: string): Promise<void> {
  try {
    if (navigator.clipboard === undefined) throw new Error('Clipboard API unavailable')
    await navigator.clipboard.writeText(text)
  } catch {
    copyWithTextArea(text)
  }
}

function handleTerminalKey(event: KeyboardEvent): boolean {
  if (!isCopyShortcut(event)) return true

  event.preventDefault()
  event.stopPropagation()
  if (terminal?.hasSelection()) void copyTerminalSelection(terminal.getSelection())
  return false
}

/** Chrome reserves Ctrl+Shift+C for the inspector before xterm receives it.
 *  仅当终端容器拥有焦点时拦截，避免影响页面其他输入和快捷键。 */
function handleCopyShortcutCapture(event: KeyboardEvent): void {
  if (!isCopyShortcut(event)) return
  const container = containerRef.value
  const active = document.activeElement
  // 终端 xterm 内部的 textarea 获得焦点时才拦截；否则放行给页面和 DevTools。
  if (container === null || (active !== null && !container.contains(active))) return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (terminal?.hasSelection()) void copyTerminalSelection(terminal.getSelection())
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

onMounted(() => {
  const container = containerRef.value
  if (container === null) return

  const terminalFontFamily =
    getComputedStyle(document.documentElement).getPropertyValue('--font-terminal').trim() ||
    '"CaskaydiaCove Nerd Font Mono", "JetBrains Mono", "Noto Sans Mono CJK SC", monospace'

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
  terminal.open(container)
  scheduleFit()

  terminal.attachCustomKeyEventHandler(handleTerminalKey)

  terminal.onData((data) => emit('input', data))
  if (props.autoFocus) terminal.focus()
  container.addEventListener('click', focus)
  window.addEventListener('keydown', handleCopyShortcutCapture, true)

  resizeObserver = new ResizeObserver(scheduleFit)
  resizeObserver.observe(container)
  window.addEventListener('resize', scheduleFit, { passive: true })
  window.visualViewport?.addEventListener('resize', scheduleFit, { passive: true })
  document.fonts?.ready.then(scheduleFit).catch(() => undefined)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleFit)
  window.visualViewport?.removeEventListener('resize', scheduleFit)
  window.removeEventListener('keydown', handleCopyShortcutCapture, true)
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
    <div ref="containerRef" class="terminal-viewport" aria-label="Linux 终端" />
  </div>
</template>

<style scoped>
.lab-terminal {
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
