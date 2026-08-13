import { createApp } from 'vue'
import CompanionApp from './CompanionApp.vue'
import { createSafeStorage } from './services/progress-store'
import { loadUiPreferences } from './services/ui-preferences-store'
import './assets/fonts/noto-sans-sc/index.css'
import './styles/fonts.css'
import './styles/global.css'

try {
  document.documentElement.dataset.theme = localStorage.getItem('hashteam-theme-v1') === 'dark' ? 'dark' : 'light'
} catch {
  document.documentElement.dataset.theme = 'light'
}
const preferences = loadUiPreferences(createSafeStorage())
document.documentElement.dataset.accent = preferences.accent
document.documentElement.style.setProperty('--custom-accent-light', preferences.customAccent.light)
document.documentElement.style.setProperty('--custom-accent-dark', preferences.customAccent.dark)

const app = createApp(CompanionApp)
app.config.errorHandler = (error, instance, info) => {
  console.error('[hashteam:companion] Vue 运行时错误', { error, component: instance?.$options.name, info })
}
app.mount('#app')
