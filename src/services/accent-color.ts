import type { CustomAccent } from '../types/lab'

export const DEFAULT_CUSTOM_ACCENT_SOURCE = '#357a50'
export const MIN_ACCENT_CONTRAST = 4.5

const LIGHT_SURFACE = '#ffffff'
const DARK_SURFACE = '#25302a'
const LIGHT_ADJUST_TARGET = '#111a14'
const DARK_ADJUST_TARGET = '#ffffff'

interface RgbColor {
  r: number
  g: number
  b: number
}

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return null
  return value.toLowerCase()
}

function hexToRgb(hex: string): RgbColor {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

function rgbToHex(color: RgbColor): string {
  const channel = (value: number) => Math.round(value).toString(16).padStart(2, '0')
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`
}

function relativeLuminance(color: RgbColor): number {
  const [r, g, b] = [color.r, color.g, color.b]
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function colorContrastRatio(foreground: string, background: string): number {
  const foregroundColor = normalizeHexColor(foreground)
  const backgroundColor = normalizeHexColor(background)
  if (foregroundColor === null || backgroundColor === null) return 0

  const foregroundLuminance = relativeLuminance(hexToRgb(foregroundColor))
  const backgroundLuminance = relativeLuminance(hexToRgb(backgroundColor))
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

function mixColors(source: RgbColor, target: RgbColor, amount: number): RgbColor {
  return {
    r: source.r + (target.r - source.r) * amount,
    g: source.g + (target.g - source.g) * amount,
    b: source.b + (target.b - source.b) * amount,
  }
}

function ensureContrast(source: string, surface: string, target: string): string {
  if (colorContrastRatio(source, surface) >= MIN_ACCENT_CONTRAST) return source

  const sourceRgb = hexToRgb(source)
  const targetRgb = hexToRgb(target)
  for (let step = 1; step <= 100; step += 1) {
    const candidate = rgbToHex(mixColors(sourceRgb, targetRgb, step / 100))
    if (colorContrastRatio(candidate, surface) >= MIN_ACCENT_CONTRAST) return candidate
  }
  return target
}

export function createCustomAccent(value: unknown): CustomAccent | null {
  const source = normalizeHexColor(value)
  if (source === null) return null
  return {
    source,
    light: ensureContrast(source, LIGHT_SURFACE, LIGHT_ADJUST_TARGET),
    dark: ensureContrast(source, DARK_SURFACE, DARK_ADJUST_TARGET),
  }
}
