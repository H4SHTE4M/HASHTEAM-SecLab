// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { useTerminalShortcuts } from '../src/composables/useTerminalShortcuts'

interface FakeTerminal {
  hasSelection: () => boolean
  getSelection: () => string
  clear: () => void
  focus: () => void
  loadAddon: (addon: unknown) => void
}

function makeEvent(
  key: string,
  { ctrl = false, shift = false, alt = false, meta = false } = {},
): KeyboardEvent {
  return {
    type: 'keydown',
    key,
    ctrlKey: ctrl,
    shiftKey: shift,
    altKey: alt,
    metaKey: meta,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  } as unknown as KeyboardEvent
}

function makeTerminal(overrides: Partial<FakeTerminal> = {}): FakeTerminal {
  return {
    hasSelection: () => false,
    getSelection: () => '',
    clear: vi.fn(),
    focus: vi.fn(),
    loadAddon: vi.fn(),
    ...overrides,
  }
}

describe('useTerminalShortcuts', () => {
  it('字体快捷键触发 onFontSizeDelta 并消费按键', () => {
    const onFontSizeDelta = vi.fn()
    const shortcuts = useTerminalShortcuts({
      getTerminal: () => makeTerminal() as never,
      getContainer: () => null,
      onPaste: vi.fn(),
      onFontSizeDelta,
    })

    expect(shortcuts.handleTerminalKey(makeEvent('+', { ctrl: true }))).toBe(false)
    expect(onFontSizeDelta).toHaveBeenCalledWith(1)

    expect(shortcuts.handleTerminalKey(makeEvent('=', { ctrl: true }))).toBe(false)
    expect(onFontSizeDelta).toHaveBeenLastCalledWith(1)

    expect(shortcuts.handleTerminalKey(makeEvent('-', { ctrl: true }))).toBe(false)
    expect(onFontSizeDelta).toHaveBeenLastCalledWith(-1)

    expect(shortcuts.handleTerminalKey(makeEvent('0', { ctrl: true }))).toBe(false)
    expect(onFontSizeDelta).toHaveBeenLastCalledWith(0)
  })

  it('Ctrl+L 清屏并消费按键', () => {
    const terminal = makeTerminal()
    const shortcuts = useTerminalShortcuts({
      getTerminal: () => terminal as never,
      getContainer: () => null,
      onPaste: vi.fn(),
      onFontSizeDelta: vi.fn(),
    })

    expect(shortcuts.handleTerminalKey(makeEvent('l', { ctrl: true }))).toBe(false)
    expect(terminal.clear).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Shift+F 打开搜索并消费按键', () => {
    const shortcuts = useTerminalShortcuts({
      getTerminal: () => makeTerminal() as never,
      getContainer: () => null,
      onPaste: vi.fn(),
      onFontSizeDelta: vi.fn(),
    })

    expect(shortcuts.handleTerminalKey(makeEvent('F', { ctrl: true, shift: true }))).toBe(false)
    expect(shortcuts.isSearchOpen.value).toBe(true)
  })

  it('普通按键不消费，透传给终端', () => {
    const shortcuts = useTerminalShortcuts({
      getTerminal: () => makeTerminal() as never,
      getContainer: () => null,
      onPaste: vi.fn(),
      onFontSizeDelta: vi.fn(),
    })

    expect(shortcuts.handleTerminalKey(makeEvent('a'))).toBe(true)
    expect(shortcuts.handleTerminalKey(makeEvent('c', { ctrl: true }))).toBe(true)
  })

  it('Ctrl+Shift+V 从剪贴板读取并回调 onPaste', async () => {
    const onPaste = vi.fn()
    const readText = vi.fn().mockResolvedValue('echo hi\n')
    Object.assign(navigator, { clipboard: { readText, writeText: vi.fn().mockResolvedValue(undefined) } })

    const shortcuts = useTerminalShortcuts({
      getTerminal: () => makeTerminal() as never,
      getContainer: () => null,
      onPaste,
      onFontSizeDelta: vi.fn(),
    })

    const event = makeEvent('V', { ctrl: true, shift: true })
    expect(shortcuts.handleTerminalKey(event)).toBe(false)
    await vi.waitFor(() => expect(onPaste).toHaveBeenCalledWith('echo hi\n'))
  })
})
