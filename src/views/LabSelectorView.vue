<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { useLabPreferences } from '../composables/useLabPreferences'
import { useLabProgress } from '../composables/useLabProgress'
import { createSafeStorage } from '../services/progress-store'
import { MODULES, type ModuleId, type ModuleSummary } from '../modules/catalog'
import { PUBLISHED_PWNHUB_LAB_IDS } from '../modules/pwnhub/published-labs'

const router = useRouter()
const progress = useLabProgress()
const appearanceStorage = createSafeStorage()
const preferences = useLabPreferences()
const publishedPwnHubIds = new Set<string>(PUBLISHED_PWNHUB_LAB_IDS)
function applyAppearance(): void {
  document.documentElement.dataset.theme =
    appearanceStorage.getItem('hashteam-theme-v1') === 'dark' ? 'dark' : 'light'
  document.documentElement.dataset.accent = preferences.state.accent
  document.documentElement.style.setProperty(
    '--custom-accent-light',
    preferences.state.customAccent.light,
  )
  document.documentElement.style.setProperty(
    '--custom-accent-dark',
    preferences.state.customAccent.dark,
  )
}

applyAppearance()

const completedByModule = computed<Record<ModuleId, number>>(() => ({
  seclab: Math.min(progress.state.completedLevels.length, 10),
  pwnhub: progress.state.completedLabIds.filter((labId) => publishedPwnHubIds.has(labId)).length,
}))

const pwnHubReadiness = computed(() => {
  const completed = completedByModule.value.seclab
  if (completed === 0) return 'PwnHub 假设你已熟悉基本 Shell；仍可直接进入。'
  if (completed < 10) return `已完成 ${completed}/10 个基础实验；建议继续完成 SecLab，也可直接进入。`
  return '基础训练已完成，推荐进入 PwnHub。'
})

function progressLabel(module: ModuleSummary): string {
  return `${completedByModule.value[module.moduleId]} / ${module.publishedCount}`
}

function enterModule(module: ModuleSummary): void {
  void router.push(module.route)
}
</script>

<template>
  <main class="selector-shell">
    <header class="brand-header">
      <div class="brand-mark" aria-hidden="true"><AppIcon name="hash" :size="26" /></div>
      <div>
        <p class="eyebrow">HASHTEAM</p>
        <h1>Security Lab</h1>
        <p class="brand-summary">选择学习路径。实验环境只会在进入工作台后启动。</p>
      </div>
    </header>

    <section class="module-grid" aria-label="实验模块">
      <article
        v-for="module in MODULES"
        :key="module.moduleId"
        class="module-card"
        :class="`module-${module.moduleId}`"
      >
        <div class="card-heading">
          <span class="module-icon" aria-hidden="true">
            <AppIcon :name="module.moduleId === 'seclab' ? 'terminal' : 'server'" :size="22" />
          </span>
          <div>
            <p class="module-kicker">{{ module.moduleId === 'seclab' ? 'SecLab' : 'PwnHub' }}</p>
            <h2>{{ module.title }}</h2>
          </div>
          <span v-if="module.moduleId === 'pwnhub'" class="wip-badge">建设中</span>
        </div>

        <p class="module-description">{{ module.description }}</p>

        <div class="module-progress">
          <div class="progress-copy">
            <span>已完成</span>
            <strong>{{ progressLabel(module) }}</strong>
          </div>
          <div
            class="progress-track"
            role="progressbar"
            :aria-label="`${module.title} 完成度`"
            :aria-valuenow="completedByModule[module.moduleId]"
            :aria-valuemin="0"
            :aria-valuemax="module.publishedCount"
          >
            <span
              :style="{ width: `${completedByModule[module.moduleId] / module.publishedCount * 100}%` }"
            />
          </div>
          <p v-if="module.plannedCount > module.publishedCount" class="release-note">
            当前开放 {{ module.publishedCount }} 个实验，共规划 {{ module.plannedCount }} 个。
          </p>
        </div>

        <p v-if="module.moduleId === 'pwnhub'" class="readiness-note">
          <AppIcon name="info" :size="15" />
          <span>{{ pwnHubReadiness }}</span>
        </p>

        <p v-if="module.moduleId === 'pwnhub'" class="wip-note">
          <AppIcon name="layers" :size="15" />
          <span>模块仍在建设中：后续会持续改进新手引导并开放更多关卡，已有进度会保留。</span>
        </p>

        <button type="button" class="enter-button" @click="enterModule(module)">
          <span>{{ completedByModule[module.moduleId] > 0 ? '继续学习' : '进入实验' }}</span>
          <AppIcon name="chevron-right" :size="17" />
        </button>
      </article>
    </section>
  </main>
</template>

<style scoped>
.selector-shell {
  min-height: 100dvh;
  padding: clamp(32px, 8vw, 88px) max(24px, calc((100vw - 1080px) / 2));
  color: var(--text-primary);
  background:
    radial-gradient(circle at 18% 10%, var(--accent-cyan-soft), transparent 34rem),
    linear-gradient(180deg, var(--bg-canvas-top), var(--bg-canvas));
}

.brand-header {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  max-width: 720px;
  margin-bottom: clamp(34px, 6vw, 64px);
}

.brand-mark,
.module-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  color: var(--accent-cyan);
  background: var(--accent-cyan-soft);
  border: 1px solid var(--accent-cyan-border);
}

.brand-mark {
  width: 54px;
  height: 54px;
  border-radius: 17px;
}

.eyebrow,
.module-kicker {
  margin: 0;
  color: var(--accent-cyan);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 9px;
  font-family: var(--font-display);
  font-size: clamp(32px, 5vw, 52px);
  line-height: 1;
  letter-spacing: -0.035em;
}

.brand-summary,
.module-description,
.release-note {
  color: var(--text-muted);
}

.brand-summary {
  margin-bottom: 0;
  font-size: 16px;
  line-height: 1.65;
}

.module-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}

.module-card {
  display: flex;
  min-height: 410px;
  flex-direction: column;
  padding: clamp(24px, 4vw, 34px);
  background: color-mix(in srgb, var(--surface-raised) 94%, transparent);
  border: 1px solid var(--border-subtle);
  border-radius: 24px;
  box-shadow: var(--shadow-panel);
}

.module-pwnhub {
  border-color: color-mix(in srgb, var(--accent-violet) 32%, var(--border-subtle));
}

.card-heading {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 24px;
}

.module-icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
}

h2 {
  margin-bottom: 0;
  font-size: clamp(22px, 3vw, 30px);
  letter-spacing: -0.025em;
}

.module-description {
  min-height: 52px;
  margin-bottom: 26px;
  line-height: 1.7;
}

.module-progress {
  padding: 17px;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: 15px;
}

.progress-copy {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
  color: var(--text-secondary);
  font-size: 13px;
}

.progress-copy strong {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 14px;
}

.progress-track {
  height: 6px;
  overflow: hidden;
  background: var(--surface-3);
  border-radius: 999px;
}

.progress-track span {
  display: block;
  height: 100%;
  background: var(--accent-cyan);
  border-radius: inherit;
  transition: width var(--duration-normal) var(--ease-out);
}

.release-note {
  margin: 11px 0 0;
  font-size: 12px;
  line-height: 1.5;
}

.readiness-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 18px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.readiness-note svg {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--accent-amber);
}

.wip-badge {
  flex: 0 0 auto;
  margin-left: auto;
  padding: 3px 9px;
  color: var(--accent-violet);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  background: color-mix(in srgb, var(--accent-violet) 12%, transparent);
  border: var(--hairline) solid color-mix(in srgb, var(--accent-violet) 40%, transparent);
  border-radius: 999px;
}

.wip-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.wip-note svg {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--accent-violet);
}

.enter-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 48px;
  margin-top: auto;
  padding: 0 17px;
  color: var(--accent-cyan-contrast);
  font: inherit;
  font-weight: 700;
  background: var(--accent-cyan);
  border: 0;
  border-radius: 13px;
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out), background var(--duration-fast);
}

.enter-button:hover {
  background: var(--accent-cyan-hover);
  transform: translateY(-1px);
}

.enter-button:focus-visible {
  outline: 3px solid var(--accent-cyan-border);
  outline-offset: 3px;
}

@media (max-width: 720px) {
  .selector-shell {
    padding-top: 28px;
  }

  .module-grid {
    grid-template-columns: 1fr;
  }

  .module-card {
    min-height: 380px;
  }
}
</style>
