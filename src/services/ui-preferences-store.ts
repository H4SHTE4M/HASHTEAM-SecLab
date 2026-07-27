import type { LabMode, LabUiPreferences } from '../types/lab'
import type { StorageLike } from './progress-store'

export const UI_PREFERENCES_STORAGE_KEY = 'hashteam-lab-ui-v1'

export function createDefaultUiPreferences(): LabUiPreferences {
  return {
    mode: null,
    onboardingComplete: false,
  }
}

function isLabMode(value: unknown): value is LabMode {
  return value === 'guided' || value === 'challenge'
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
    return {
      mode: value.mode,
      onboardingComplete: value.onboardingComplete,
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
