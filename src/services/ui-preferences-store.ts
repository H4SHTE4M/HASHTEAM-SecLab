import type { LabMode, LabUiPreferences } from '../types/lab'
import type { StorageLike } from './progress-store'

export const UI_PREFERENCES_STORAGE_KEY = 'hashteam-lab-ui-v1'
export const TERMINAL_FONT_SIZE_MIN = 12
export const TERMINAL_FONT_SIZE_MAX = 20
export const TERMINAL_FONT_SIZE_DEFAULT = 15

export function createDefaultUiPreferences(): LabUiPreferences {
  return {
    mode: null,
    onboardingComplete: false,
    terminalFontSize: TERMINAL_FONT_SIZE_DEFAULT,
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

export function loadUiPreferences(storage: StorageLike): LabUiPreferences {
  const raw = storage.getItem(UI_PREFERENCES_STORAGE_KEY)
  if (raw === null) return createDefaultUiPreferences()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return createDefaultUiPreferences()
    const value = parsed as Partial<LabUiPreferences>
    if (value.mode !== null && !isLabMode(value.mode)) return createDefaultUiPreferences()
    if (typeof value.onboardingComplete !== 'boolean') return createDefaultUiPreferences()
    const terminalFontSize = value.terminalFontSize ?? TERMINAL_FONT_SIZE_DEFAULT
    if (!isTerminalFontSize(terminalFontSize)) return createDefaultUiPreferences()
    return {
      mode: value.mode,
      onboardingComplete: value.onboardingComplete,
      terminalFontSize,
    }
  } catch {
    return createDefaultUiPreferences()
  }
}

export function saveUiPreferences(
  storage: StorageLike,
  preferences: LabUiPreferences,
): void {
  storage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
}
