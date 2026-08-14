import { ref } from 'vue'
import type { Terminal } from '@xterm/xterm'
import { SearchAddon } from '@xterm/addon-search'

/**
 * 两个 LabTerminal 共用的终端快捷键与剪贴板逻辑。
 *
 * 覆盖：Ctrl+Shift+C 复制选区、Ctrl+Shift+V 粘贴、Ctrl+L 清屏、
 * Ctrl+Shift+F 终端内搜索、Ctrl+`+`/`-`/`0` 调整字号。
 *
 * 复制需要走 window 捕获阶段监听：Chrome 会在 xterm 收到按键之前保留
 * Ctrl+Shift+C（DevTools 快捷键），普通 custom key handler 拿不到；其余
 * 快捷键走 xterm 的 attachCustomKeyEventHandler，只在终端聚焦时生效。
 */
export interface TerminalShortcutOptions {
  getTerminal: () => Terminal | null
  getContainer: () => HTMLElement | null
  /** 粘贴内容 → 终端输入（等价于用户敲入的字节）。 */
  onPaste: (text: string) => void
  /** 字号调整：1 增大 / -1 减小 / 0 复位默认。 */
  onFontSizeDelta: (delta: number) => void
}

export function useTerminalShortcuts(options: TerminalShortcutOptions) {
  const { getTerminal, getContainer, onPaste, onFontSizeDelta } = options

  const searchAddon = new SearchAddon()
  const isSearchOpen = ref(false)
  const searchQuery = ref('')

  function isCopyShortcut(event: KeyboardEvent): boolean {
    return (
      event.type === 'keydown' &&
      event.ctrlKey &&
      event.shiftKey &&
      !event.altKey &&
      !event.metaKey &&
      event.key.toLowerCase() === 'c'
    )
  }

  function isPasteShortcut(event: KeyboardEvent): boolean {
    return (
      event.type === 'keydown' &&
      event.ctrlKey &&
      event.shiftKey &&
      !event.altKey &&
      !event.metaKey &&
      event.key.toLowerCase() === 'v'
    )
  }

  function isClearShortcut(event: KeyboardEvent): boolean {
    return (
      event.type === 'keydown' &&
      event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      !event.metaKey &&
      event.key.toLowerCase() === 'l'
    )
  }

  function isSearchShortcut(event: KeyboardEvent): boolean {
    return (
      event.type === 'keydown' &&
      event.ctrlKey &&
      event.shiftKey &&
      !event.altKey &&
      !event.metaKey &&
      event.key.toLowerCase() === 'f'
    )
  }

  function isFontIncreaseShortcut(event: KeyboardEvent): boolean {
    return (
      event.type === 'keydown' &&
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      (event.key === '+' || event.key === '=')
    )
  }

  function isFontDecreaseShortcut(event: KeyboardEvent): boolean {
    return (
      event.type === 'keydown' &&
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      event.key === '-'
    )
  }

  function isFontResetShortcut(event: KeyboardEvent): boolean {
    return (
      event.type === 'keydown' &&
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      event.key === '0'
    )
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
      getTerminal()?.focus()
    }
  }

  async function copySelection(): Promise<void> {
    const terminal = getTerminal()
    if (terminal === null || !terminal.hasSelection()) return
    const text = terminal.getSelection()
    try {
      if (navigator.clipboard === undefined) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(text)
    } catch {
      copyWithTextArea(text)
    }
  }

  async function pasteFromClipboard(): Promise<void> {
    try {
      if (navigator.clipboard === undefined) return
      const text = await navigator.clipboard.readText()
      if (text.length > 0) onPaste(text)
    } catch {
      // 剪贴板读取被拒绝：静默忽略，保留浏览器原生粘贴路径。
    }
  }

  function clearTerminal(): void {
    getTerminal()?.clear()
  }

  function openSearch(): void {
    isSearchOpen.value = true
    searchQuery.value = ''
  }

  function closeSearch(): void {
    isSearchOpen.value = false
    searchQuery.value = ''
    searchAddon.clearDecorations()
    getTerminal()?.focus()
  }

  function searchNext(): void {
    if (searchQuery.value === '') return
    searchAddon.findNext(searchQuery.value, { caseSensitive: false })
  }

  function searchPrevious(): void {
    if (searchQuery.value === '') return
    searchAddon.findPrevious(searchQuery.value, { caseSensitive: false })
  }

  function searchLive(): void {
    if (searchQuery.value === '') {
      searchAddon.clearDecorations()
      return
    }
    searchAddon.findNext(searchQuery.value, { caseSensitive: false })
  }

  /** xterm 的 custom key handler：返回 false 表示已消费该按键。 */
  function handleTerminalKey(event: KeyboardEvent): boolean {
    if (isCopyShortcut(event)) {
      event.preventDefault()
      event.stopPropagation()
      void copySelection()
      return false
    }
    if (isPasteShortcut(event)) {
      event.preventDefault()
      event.stopPropagation()
      void pasteFromClipboard()
      return false
    }
    if (isClearShortcut(event)) {
      event.preventDefault()
      event.stopPropagation()
      clearTerminal()
      return false
    }
    if (isSearchShortcut(event)) {
      event.preventDefault()
      event.stopPropagation()
      openSearch()
      return false
    }
    if (isFontIncreaseShortcut(event)) {
      event.preventDefault()
      event.stopPropagation()
      onFontSizeDelta(1)
      return false
    }
    if (isFontDecreaseShortcut(event)) {
      event.preventDefault()
      event.stopPropagation()
      onFontSizeDelta(-1)
      return false
    }
    if (isFontResetShortcut(event)) {
      event.preventDefault()
      event.stopPropagation()
      onFontSizeDelta(0)
      return false
    }
    return true
  }

  /** 捕获阶段监听，仅处理 Chrome 会提前保留的 Ctrl+Shift+C。 */
  function handleKeydownCapture(event: KeyboardEvent): void {
    if (!isCopyShortcut(event)) return
    const container = getContainer()
    const active = document.activeElement
    // 仅当焦点在终端容器内才拦截；否则放行给页面与 DevTools。
    if (container === null || (active !== null && !container.contains(active))) return
    event.preventDefault()
    event.stopImmediatePropagation()
    void copySelection()
  }

  /** 把搜索插件挂到指定终端实例（每个终端组件各持有自己的 addon）。 */
  function attach(terminal: Terminal): void {
    terminal.loadAddon(searchAddon)
  }

  return {
    isSearchOpen,
    searchQuery,
    handleTerminalKey,
    handleKeydownCapture,
    attach,
    openSearch,
    closeSearch,
    searchNext,
    searchPrevious,
    searchLive,
  }
}
