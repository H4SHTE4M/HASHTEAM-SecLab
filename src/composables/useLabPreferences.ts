import { reactive } from 'vue'
import type { LabMode, LabUiPreferences } from '../types/lab'
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

  return {
    state,
    setMode,
    completeOnboarding,
    setTerminalFontSize,
  }
}
