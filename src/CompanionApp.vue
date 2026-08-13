<script setup lang="ts">
import { computed } from 'vue'
import ExternalToolCompanion from './components/ExternalToolCompanion.vue'
import { loadCompanionDefinition } from './services/companion'

const labId = new URLSearchParams(window.location.search).get('lab') ?? ''
const definition = computed(() => (labId ? loadCompanionDefinition(labId) : null))

function closeWindow(): void {
  window.close()
}
</script>

<template>
  <main class="companion-page">
    <header>
      <div><span>HASHTEAM</span><strong>PwnHub Companion</strong></div>
      <button type="button" @click="closeWindow">关闭窗口</button>
    </header>
    <ExternalToolCompanion v-if="definition" :definition="definition" standalone />
    <section v-else class="missing-session" role="alert">
      <h1>没有可恢复的伴侣会话</h1>
      <p>请从主实验窗口的外部工具步骤重新打开伴侣窗口。</p>
    </section>
  </main>
</template>

<style scoped>
.companion-page { min-height: 100dvh; padding: 16px max(16px, env(safe-area-inset-right)) 28px max(16px, env(safe-area-inset-left)); background: var(--bg-canvas); }
.companion-page > header { width: min(960px, 100%); min-height: 54px; display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 0 auto 12px; }
.companion-page > header div { display: flex; align-items: baseline; gap: 8px; }
.companion-page > header span { color: var(--accent-cyan); font-size: 10px; font-weight: 800; }
.companion-page > header strong { color: var(--text-primary); font-size: 15px; }
.companion-page > header button { min-height: 36px; padding: 6px 10px; color: var(--text-muted); background: var(--surface-1); border: var(--hairline) solid var(--border-subtle); border-radius: 6px; cursor: pointer; }
.missing-session { width: min(620px, 100%); margin: 14vh auto 0; padding: 28px; text-align: center; background: var(--surface-1); border: var(--hairline) solid var(--border-subtle); border-radius: 8px; }
.missing-session h1 { margin: 0; color: var(--text-primary); font-size: 20px; }
.missing-session p { margin: 8px 0 0; color: var(--text-muted); font-size: 13px; }
</style>
