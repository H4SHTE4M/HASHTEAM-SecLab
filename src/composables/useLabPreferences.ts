import { reactive } from 'vue'
import type { AccentName, LabMode, LabUiPreferences } from '../types/lab'
import { createCustomAccent } from '../services/accent-color'
import { createSafeStorage } from '../services/progress-store'
import {
  loadUiPreferences,
  saveUiPreferences,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
} from '../services/ui-preferences-store'

const storage = createSafeStorage()
const state = reactive<LabUiPreferences>(loadUiPreferences(storage))

export function useLabPreferences() {
  function setMode(mode: LabMode): void {
    state.mode = mode
    saveUiPreferences(storage, state)
  }

  function completeOnboarding(): void {
    state.onboardingComplete = true
    saveUiPreferences(storage, state)
  }

  function setTerminalFontSize(fontSize: number): void {
    state.terminalFontSize = Math.min(
      TERMINAL_FONT_SIZE_MAX,
      Math.max(TERMINAL_FONT_SIZE_MIN, Math.round(fontSize)),
    )
    saveUiPreferences(storage, state)
  }

  function setAccent(accent: AccentName): void {
    state.accent = accent
    saveUiPreferences(storage, state)
  }

  function setCustomAccent(source: string): void {
    const customAccent = createCustomAccent(source)
    if (customAccent === null) return
    state.customAccent = customAccent
    state.accent = 'custom'
    saveUiPreferences(storage, state)
  }

  return {
    state,
    setMode,
    completeOnboarding,
    setTerminalFontSize,
    setAccent,
    setCustomAccent,
  }
}
