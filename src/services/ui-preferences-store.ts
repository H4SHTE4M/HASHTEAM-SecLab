import type { AccentName, LabMode, LabUiPreferences } from '../types/lab'
import {
  createCustomAccent,
  DEFAULT_CUSTOM_ACCENT_SOURCE,
} from './accent-color'
import type { StorageLike } from './progress-store'

export const UI_PREFERENCES_STORAGE_KEY = 'hashteam-lab-ui-v1'
export const TERMINAL_FONT_SIZE_MIN = 12
export const TERMINAL_FONT_SIZE_MAX = 20
export const TERMINAL_FONT_SIZE_DEFAULT = 14
const UI_PREFERENCES_SCHEMA_VERSION = 4
const LEGACY_TERMINAL_FONT_SIZE_DEFAULT = 15

interface StoredLabUiPreferences extends Partial<LabUiPreferences> {
  schemaVersion?: unknown
}

export function createDefaultUiPreferences(): LabUiPreferences {
  const customAccent = createCustomAccent(DEFAULT_CUSTOM_ACCENT_SOURCE)!
  return {
    mode: null,
    onboardingComplete: false,
    terminalFontSize: TERMINAL_FONT_SIZE_DEFAULT,
    accent: 'forest',
    customAccent,
  }
}

function isLabMode(value: unknown): value is LabMode {
  return value === 'guided' || value === 'challenge'
}

function isTerminalFontSize(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= TERMINAL_FONT_SIZE_MIN &&
    value <= TERMINAL_FONT_SIZE_MAX
  )
}

function isAccentName(value: unknown): value is AccentName {
  return (
    value === 'forest' ||
    value === 'ocean' ||
    value === 'indigo' ||
    value === 'rose' ||
    value === 'custom'
  )
}

export function loadUiPreferences(storage: StorageLike): LabUiPreferences {
  const raw = storage.getItem(UI_PREFERENCES_STORAGE_KEY)
  if (raw === null) return createDefaultUiPreferences()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return createDefaultUiPreferences()
    const value = parsed as StoredLabUiPreferences
    if (value.mode !== null && !isLabMode(value.mode)) return createDefaultUiPreferences()
    if (typeof value.onboardingComplete !== 'boolean') return createDefaultUiPreferences()
    const storedFontSize = value.terminalFontSize ?? TERMINAL_FONT_SIZE_DEFAULT
    if (!isTerminalFontSize(storedFontSize)) return createDefaultUiPreferences()
    const accent = value.accent ?? 'forest'
    if (!isAccentName(accent)) return createDefaultUiPreferences()
    const storedCustomAccent = value.customAccent
    const customAccent = createCustomAccent(
      storedCustomAccent === undefined
        ? DEFAULT_CUSTOM_ACCENT_SOURCE
        : storedCustomAccent.source,
    )
    if (customAccent === null) return createDefaultUiPreferences()
    const terminalFontSize =
      (typeof value.schemaVersion === 'number' && value.schemaVersion >= 2) ||
      storedFontSize !== LEGACY_TERMINAL_FONT_SIZE_DEFAULT
        ? storedFontSize
        : TERMINAL_FONT_SIZE_DEFAULT
    return {
      mode: value.mode,
      onboardingComplete: value.onboardingComplete,
      terminalFontSize,
      accent,
      customAccent,
    }
  } catch {
    return createDefaultUiPreferences()
  }
}

export function saveUiPreferences(
  storage: StorageLike,
  preferences: LabUiPreferences,
): void {
  storage.setItem(
    UI_PREFERENCES_STORAGE_KEY,
    JSON.stringify({ ...preferences, schemaVersion: UI_PREFERENCES_SCHEMA_VERSION }),
  )
}
