import { describe, expect, it } from 'vitest'
import {
  MIN_ACCENT_CONTRAST,
  colorContrastRatio,
  createCustomAccent,
  normalizeHexColor,
} from '../src/services/accent-color'

describe('custom UI accent colors', () => {
  it('normalizes six-digit hex colors and rejects malformed values', () => {
    expect(normalizeHexColor('#F4D03F')).toBe('#f4d03f')
    expect(normalizeHexColor('#fff')).toBeNull()
    expect(normalizeHexColor('f4d03f')).toBeNull()
    expect(normalizeHexColor(null)).toBeNull()
  })

  it('keeps arbitrary colors legible on both interface themes', () => {
    for (const source of ['#ffffff', '#000000', '#ff0000', '#f4d03f', '#19e6c1']) {
      const accent = createCustomAccent(source)!
      expect(accent.source).toBe(source)
      expect(colorContrastRatio(accent.light, '#ffffff')).toBeGreaterThanOrEqual(
        MIN_ACCENT_CONTRAST,
      )
      expect(colorContrastRatio(accent.dark, '#25302a')).toBeGreaterThanOrEqual(
        MIN_ACCENT_CONTRAST,
      )
    }
  })

  it('preserves a source color when it already meets the target contrast', () => {
    expect(createCustomAccent('#357a50')?.light).toBe('#357a50')
    expect(createCustomAccent('#ffffff')?.dark).toBe('#ffffff')
  })
})
