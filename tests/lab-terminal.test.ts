// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LabTerminal from '../src/components/PwnHubLabTerminal.vue'

const xtermMock = vi.hoisted(() => ({
  handler: null as ((event: KeyboardEvent) => boolean) | null,
  hasSelection: true,
  selection: 'selected output',
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    rows = 24
    options: Record<string, unknown> = {}

    loadAddon() {}
    open() {}
    write() {}
    focus() {}
    refresh() {}
    dispose() {}
    onData() {}
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      xtermMock.handler = handler
    }
    hasSelection() {
      return xtermMock.hasSelection
    }
    getSelection() {
      return xtermMock.selection
    }
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}))

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

describe('LabTerminal keyboard shortcuts', () => {
  beforeEach(() => {
    xtermMock.handler = null
    xtermMock.hasSelection = true
    xtermMock.selection = 'selected output'
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('copies the selected text with Ctrl+Shift+C and suppresses the browser shortcut', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const wrapper = mount(LabTerminal)
    const event = new KeyboardEvent('keydown', {
      key: 'C',
      ctrlKey: true,
      shiftKey: true,
      cancelable: true,
    })

    expect(xtermMock.handler?.(event)).toBe(false)
    expect(event.defaultPrevented).toBe(true)
    expect(writeText).toHaveBeenCalledWith('selected output')
    wrapper.unmount()
  })

  it('does not intercept the guest Ctrl+C interrupt shortcut', () => {
    const wrapper = mount(LabTerminal)
    const event = new KeyboardEvent('keydown', {
      key: 'c',
      ctrlKey: true,
      cancelable: true,
    })

    expect(xtermMock.handler?.(event)).toBe(true)
    expect(event.defaultPrevented).toBe(false)
    wrapper.unmount()
  })

  it('suppresses Ctrl+Shift+C even when there is no selection', () => {
    xtermMock.hasSelection = false
    const wrapper = mount(LabTerminal)
    const event = new KeyboardEvent('keydown', {
      key: 'c',
      ctrlKey: true,
      shiftKey: true,
      cancelable: true,
    })

    expect(xtermMock.handler?.(event)).toBe(false)
    expect(event.defaultPrevented).toBe(true)
    wrapper.unmount()
  })
})
