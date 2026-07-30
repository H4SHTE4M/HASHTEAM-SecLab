<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  AccentName,
  CustomAccent,
  PresetAccentName,
  ThemeName,
} from '../types/lab'
import AppIcon from './AppIcon.vue'

defineProps<{
  theme: ThemeName
  accent: AccentName
  customAccent: CustomAccent
}>()

const emit = defineEmits<{
  (e: 'change-theme', theme: ThemeName): void
  (e: 'change-accent', accent: AccentName): void
  (e: 'change-custom-accent', source: string): void
}>()

const accentOptions: Array<{
  name: PresetAccentName
  label: string
  light: string
  dark: string
}> = [
  { name: 'forest', label: '林地', light: '#357a50', dark: '#71c78a' },
  { name: 'ocean', label: '海湾', light: '#176b87', dark: '#63c5e3' },
  { name: 'indigo', label: '靛蓝', light: '#5b5fa3', dark: '#aeb8ff' },
  { name: 'rose', label: '莓红', light: '#9b4a69', dark: '#ec9bb4' },
]

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const closeRef = ref<HTMLButtonElement | null>(null)

function toggle(): void {
  open.value = !open.value
  if (open.value) void nextTick(() => closeRef.value?.focus())
}

function close(restoreFocus = false): void {
  if (!open.value) return
  open.value = false
  if (restoreFocus) void nextTick(() => triggerRef.value?.focus())
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!open.value || rootRef.value?.contains(event.target as Node)) return
  close()
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (!open.value || event.key !== 'Escape') return
  event.preventDefault()
  close(true)
}

function handleCustomColor(event: Event): void {
  const input = event.currentTarget
  if (input instanceof HTMLInputElement) emit('change-custom-accent', input.value)
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
  <div ref="rootRef" class="appearance-picker">
    <button
      ref="triggerRef"
      type="button"
      class="appearance-trigger"
      aria-label="界面配色"
      aria-haspopup="dialog"
      :aria-expanded="open"
      aria-controls="appearance-panel"
      :data-tooltip="open ? undefined : '界面配色'"
      data-tooltip-placement="bottom-end"
      @click="toggle"
    >
      <AppIcon name="palette" />
      <span class="active-color" aria-hidden="true" />
    </button>

    <Transition name="picker-popover">
      <section
        v-if="open"
        id="appearance-panel"
        class="appearance-panel"
        role="dialog"
        aria-label="界面配色"
      >
        <header class="appearance-header">
          <strong>界面配色</strong>
          <button ref="closeRef" type="button" aria-label="关闭界面配色" @click="close(true)">
            <AppIcon name="x" :size="16" />
          </button>
        </header>

        <div class="appearance-setting">
          <span id="appearance-mode-label" class="setting-label">明暗模式</span>
          <div class="theme-options" role="group" aria-labelledby="appearance-mode-label">
            <button
              type="button"
              :class="{ selected: theme === 'light' }"
              :aria-pressed="theme === 'light'"
              @click="emit('change-theme', 'light')"
            >
              <AppIcon name="sun" :size="15" />
              <span>浅色</span>
            </button>
            <button
              type="button"
              :class="{ selected: theme === 'dark' }"
              :aria-pressed="theme === 'dark'"
              @click="emit('change-theme', 'dark')"
            >
              <AppIcon name="moon" :size="15" />
              <span>深色</span>
            </button>
          </div>
        </div>

        <fieldset class="appearance-setting palette-fieldset">
          <legend class="setting-label">主题色</legend>
          <div class="palette-options">
            <button
              v-for="option in accentOptions"
              :key="option.name"
              type="button"
              class="palette-option"
              :class="{ selected: accent === option.name }"
              :aria-pressed="accent === option.name"
              @click="emit('change-accent', option.name)"
            >
              <span class="palette-swatch" aria-hidden="true">
                <i :style="{ backgroundColor: option.light }" />
                <i :style="{ backgroundColor: option.dark }" />
              </span>
              <span>{{ option.label }}</span>
              <AppIcon v-if="accent === option.name" name="check" :size="14" />
            </button>
          </div>
          <div class="custom-color-option" :class="{ selected: accent === 'custom' }">
            <button
              type="button"
              class="custom-color-select"
              :aria-pressed="accent === 'custom'"
              @click="emit('change-accent', 'custom')"
            >
              <span class="custom-color-copy">
                <strong>自选颜色</strong>
                <code>{{ customAccent.source.toUpperCase() }}</code>
              </span>
              <AppIcon v-if="accent === 'custom'" name="check" :size="14" />
            </button>
            <input
              class="custom-color-input"
              type="color"
              :value="customAccent.source"
              aria-label="打开填色盘选择自定义主题色"
              title="打开填色盘"
              @input="handleCustomColor"
            />
          </div>
        </fieldset>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.appearance-picker {
  position: relative;
}

.appearance-trigger,
.appearance-header button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-faint);
  background: var(--floating-surface);
  border: var(--hairline) solid var(--border-subtle);
  cursor: pointer;
}

.appearance-trigger {
  position: relative;
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 8px;
  box-shadow: var(--shadow-control);
}

.appearance-trigger:hover,
.appearance-trigger[aria-expanded='true'] {
  color: var(--text-primary);
  background: var(--surface-3);
  box-shadow: none;
}

.active-color {
  position: absolute;
  right: 7px;
  bottom: 7px;
  width: 7px;
  height: 7px;
  background: var(--accent-cyan);
  border: 1.5px solid var(--floating-surface);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--accent-cyan-border);
}

.appearance-panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 40;
  width: 286px;
  max-height: calc(100dvh - 84px - var(--safe-bottom));
  overflow-y: auto;
  padding: 14px;
  color: var(--text-secondary);
  background: var(--surface-raised);
  border: var(--hairline) solid var(--border-strong);
  border-radius: 8px;
  box-shadow: var(--shadow-dialog);
}

.appearance-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.appearance-header strong {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
}

.appearance-header button {
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border-color: transparent;
  border-radius: 6px;
}

.appearance-header button:hover {
  color: var(--text-primary);
  background: var(--surface-3);
  border-color: var(--border-subtle);
}

.appearance-setting {
  margin: 0;
  padding: 0;
  border: 0;
}

.appearance-setting + .appearance-setting {
  margin-top: 16px;
}

.setting-label {
  display: block;
  margin: 0 0 7px;
  color: var(--text-faint);
  font-size: 11px;
  font-weight: 650;
}

.theme-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 3px;
  background: var(--surface-2);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 7px;
}

.theme-options button,
.palette-option,
.custom-color-select {
  min-height: 40px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 620;
  background: transparent;
  border: var(--hairline) solid transparent;
  border-radius: 5px;
  cursor: pointer;
}

.theme-options button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.theme-options button:hover,
.palette-option:hover,
.custom-color-select:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.theme-options button.selected {
  color: var(--accent-cyan-contrast);
  background: var(--accent-cyan);
  border-color: var(--accent-cyan);
}

.palette-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.palette-option {
  min-width: 0;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 14px;
  align-items: center;
  gap: 7px;
  padding: 4px 8px 4px 5px;
  text-align: left;
}

.palette-option.selected {
  color: var(--text-primary);
  background: var(--accent-cyan-soft);
  border-color: var(--accent-cyan-border);
}

.palette-option > svg {
  color: var(--accent-cyan);
}

.palette-swatch {
  width: 28px;
  height: 28px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  overflow: hidden;
  border: 2px solid var(--surface-raised);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--border-strong);
}

.palette-swatch i {
  display: block;
}

.custom-color-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  gap: 6px;
  margin-top: 8px;
}

.custom-color-select {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 14px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  text-align: left;
}

.custom-color-option.selected .custom-color-select {
  color: var(--text-primary);
  background: var(--accent-cyan-soft);
  border-color: var(--accent-cyan-border);
}

.custom-color-select > svg {
  color: var(--accent-cyan);
}

.custom-color-copy {
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.custom-color-copy strong {
  overflow: hidden;
  color: inherit;
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.custom-color-copy code {
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 540;
  white-space: nowrap;
}

.custom-color-input {
  width: 44px;
  height: 44px;
  padding: 4px;
  background: var(--surface-2);
  border: var(--hairline) solid var(--border-strong);
  border-radius: 6px;
  cursor: pointer;
}

.custom-color-input:hover {
  background: var(--surface-hover);
  border-color: var(--accent-cyan-border);
}

.custom-color-input:focus-visible {
  outline: 3px solid var(--accent-cyan-border);
  outline-offset: 2px;
}

.custom-color-input::-webkit-color-swatch-wrapper {
  padding: 0;
}

.custom-color-input::-webkit-color-swatch,
.custom-color-input::-moz-color-swatch {
  border: 0;
  border-radius: 3px;
}

.picker-popover-enter-active,
.picker-popover-leave-active {
  transition: opacity 160ms ease, transform 180ms var(--ease-out);
  transform-origin: top right;
}

.picker-popover-enter-from,
.picker-popover-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

@media (max-width: 430px) {
  .appearance-panel {
    width: min(286px, calc(100vw - 24px - var(--safe-left) - var(--safe-right)));
  }
}

@media (prefers-reduced-motion: reduce) {
  .picker-popover-enter-active,
  .picker-popover-leave-active {
    transition: none;
  }
}
</style>
