import { reactive } from 'vue'
import type { LabMode, LabUiPreferences } from '../types/lab'
import { createSafeStorage } from '../services/progress-store'
import {
  loadUiPreferences,
  saveUiPreferences,
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

  return {
    state,
    setMode,
    completeOnboarding,
  }
}
