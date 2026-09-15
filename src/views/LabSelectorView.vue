<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import communityQrUrl from '../assets/community-qr.png'
import { useLabPreferences } from '../composables/useLabPreferences'
import { useLabProgress } from '../composables/useLabProgress'
import { loadCryptoLabProgress } from '../services/crypto-lab-progress'
import { createSafeStorage } from '../services/progress-store'
import {
  MODULES,
  resolveDocumentEntryHref,
  type ModuleId,
  type ModuleSummary,
} from '../modules/catalog'
import { PUBLISHED_PWNHUB_LAB_IDS } from '../modules/pwnhub/published-labs'

const props = defineProps<{
  assignDocument?: (href: string) => void
}>()

const router = useRouter()
const progress = useLabProgress()
const appearanceStorage = createSafeStorage()
const preferences = useLabPreferences()
const publishedPwnHubIds = new Set<string>(PUBLISHED_PWNHUB_LAB_IDS)
const cryptoLabCompleted = ref(loadCryptoLabProgress(appearanceStorage).completedCount)
const communityQrLoaded = ref(false)
const communityGroupName = 'SDUCTF 新手村'
const communityGroupNumber = '985019477'

function markCommunityQrLoaded(): void {
  communityQrLoaded.value = true
}

function markCommunityQrUnavailable(): void {
  communityQrLoaded.value = false
}

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

function refreshCryptoLabProgress(): void {
  cryptoLabCompleted.value = loadCryptoLabProgress(appearanceStorage).completedCount
}

onMounted(() => window.addEventListener('pageshow', refreshCryptoLabProgress))
onUnmounted(() => window.removeEventListener('pageshow', refreshCryptoLabProgress))

const completionSources: Record<ModuleId, () => number> = {
  seclab: () => Math.min(progress.state.completedLevels.length, 10),
  pwnhub: () =>
    progress.state.completedLabIds.filter((labId) => publishedPwnHubIds.has(labId)).length,
  cryptolab: () => cryptoLabCompleted.value,
}

const completedByModule = computed<Record<ModuleId, number>>(
  () =>
    Object.fromEntries(
      MODULES.map((module) => [module.moduleId, completionSources[module.moduleId]()] as const),
    ) as Record<ModuleId, number>,
)

interface DisplayNotice {
  kind: 'readiness' | 'wip'
  icon: 'info' | 'layers'
  text: string
}

function noticesFor(module: ModuleSummary): readonly DisplayNotice[] {
  const notices: DisplayNotice[] = []
  if (module.readiness) {
    const completed = completedByModule.value[module.readiness.moduleId]
    const prerequisite = MODULES.find(
      (candidate) => candidate.moduleId === module.readiness?.moduleId,
    )
    const total = prerequisite?.publishedCount ?? 0
    const text =
      completed === 0
        ? module.readiness.empty
        : completed < total
          ? module.readiness.partial
              .replace('{completed}', String(completed))
              .replace('{total}', String(total))
          : module.readiness.complete
    notices.push({ kind: 'readiness', icon: 'info', text })
  }
  notices.push(...(module.notices ?? []))
  return notices
}

function progressLabel(module: ModuleSummary): string {
  return `${completedByModule.value[module.moduleId]} / ${module.publishedCount}`
}

function enterModule(module: ModuleSummary): void {
  if (module.entry.kind === 'router') {
    void router.push(module.entry.route)
    return
  }

  const href = resolveDocumentEntryHref(module.entry, window.location.href)
  if (props.assignDocument) {
    props.assignDocument(href)
    return
  }
  window.location.assign(href)
}

/** WebLab 外链地址：实时读取项目根目录 .env 的 WEBLAB_HOST（vite envPrefix 注入）。 */
const weblabHost = (import.meta.env.WEBLAB_HOST ?? '').trim()
const weblabUrl =
  weblabHost === ''
    ? ''
    : /^https?:\/\//i.test(weblabHost)
      ? weblabHost
      : `http://${weblabHost}`

function enterWebLab(): void {
  if (weblabUrl === '') return
  window.location.assign(weblabUrl)
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
        :class="`module-accent-${module.accent}`"
        :data-module-id="module.moduleId"
      >
        <div class="card-heading">
          <span class="module-icon" aria-hidden="true">
            <AppIcon :name="module.icon" :size="22" />
          </span>
          <div>
            <p class="module-kicker">{{ module.shortTitle }}</p>
            <h2>{{ module.title }}</h2>
          </div>
          <span v-if="module.badge" class="module-badge">{{ module.badge }}</span>
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

        <p
          v-for="notice in noticesFor(module)"
          :key="notice.kind"
          class="module-note"
          :class="`${notice.kind}-note`"
        >
          <AppIcon :name="notice.icon" :size="15" />
          <span>{{ notice.text }}</span>
        </p>

        <button type="button" class="enter-button" @click="enterModule(module)">
          <span>{{ completedByModule[module.moduleId] > 0 ? '继续学习' : '进入实验' }}</span>
          <AppIcon name="chevron-right" :size="17" />
        </button>
      </article>

      <article class="weblab-card" data-module-id="weblab">
        <div class="card-heading">
          <span class="module-icon" aria-hidden="true">
            <AppIcon name="external-link" :size="22" />
          </span>
          <div>
            <p class="module-kicker">WebLab</p>
            <h2>Web 安全实验</h2>
          </div>
          <span class="module-badge">外部链接</span>
        </div>

        <p class="module-description">
          独立部署的 Web 安全靶场：源码与 JS 信息泄露、GET / POST 传参、
          请求头伪造与 JWT 弱密钥共 9 个关卡。
        </p>

        <div class="module-progress">
          <div class="progress-copy">
            <span>访问地址</span>
            <strong class="weblab-host-value">{{ weblabUrl || '未配置' }}</strong>
          </div>
          <p class="release-note">
            {{
              weblabUrl
                ? '地址实时读取自项目根目录 .env 的 WEBLAB_HOST。'
                : '在项目根目录 .env 中设置 WEBLAB_HOST 后即可进入。'
            }}
          </p>
        </div>

        <button
          type="button"
          class="enter-button"
          :disabled="!weblabUrl"
          @click="enterWebLab"
        >
          <span>{{ weblabUrl ? '进入 WebLab' : '未配置 WEBLAB_HOST' }}</span>
          <AppIcon name="external-link" :size="17" />
        </button>
      </article>
    </section>

    <aside class="community-panel" aria-labelledby="community-title">
      <div class="community-copy">
        <p class="community-kicker">QQ群</p>
        <h2 id="community-title">{{ communityGroupName }}</h2>
        <p class="community-group-number">群号 {{ communityGroupNumber }}</p>
        <p class="community-description">和其他学习者交流实验思路、提问与反馈。</p>
      </div>
      <div
        class="qr-placeholder"
        :class="{ 'has-image': communityQrLoaded }"
        role="img"
        aria-label="QQ群二维码"
      >
        <img
          class="qr-image"
          :src="communityQrUrl"
          :alt="communityQrLoaded ? 'QQ群二维码' : ''"
          @load="markCommunityQrLoaded"
          @error="markCommunityQrUnavailable"
        />
        <AppIcon v-if="!communityQrLoaded" name="hash" :size="24" />
      </div>
    </aside>
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
  border: 1px solid;
}

.brand-mark {
  color: var(--accent-cyan);
  background: var(--accent-cyan-soft);
  border-color: var(--accent-cyan-border);
}

.brand-mark {
  width: 54px;
  height: 54px;
  border-radius: 17px;
}

.eyebrow,
.module-kicker {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.eyebrow {
  color: var(--accent-cyan);
}

.module-kicker {
  color: var(--module-accent);
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
  --module-accent: var(--accent-cyan);
  --module-accent-soft: var(--accent-cyan-soft);
  --module-accent-border: var(--accent-cyan-border);

  display: flex;
  min-height: 410px;
  flex-direction: column;
  padding: clamp(24px, 4vw, 34px);
  background: color-mix(in srgb, var(--surface-raised) 94%, transparent);
  border: 1px solid var(--border-subtle);
  border-radius: 24px;
  box-shadow: var(--shadow-panel);
}

.module-accent-violet {
  --module-accent: var(--accent-violet);
  --module-accent-soft: var(--accent-violet-soft);
  --module-accent-border: var(--accent-violet-border);
}

.module-accent-amber {
  --module-accent: var(--accent-amber);
  --module-accent-soft: var(--accent-amber-soft);
  --module-accent-border: var(--accent-amber-border);
}

.module-accent-violet,
.module-accent-amber {
  border-color: color-mix(in srgb, var(--module-accent) 32%, var(--border-subtle));
}

/* WebLab 外链卡片：独立类名避免计入 .module-card（测试断言内置模块数量）。 */
.weblab-card {
  --module-accent: var(--accent-green);
  --module-accent-soft: var(--accent-green-soft);
  --module-accent-border: var(--accent-green-border);

  display: flex;
  min-height: 410px;
  flex-direction: column;
  padding: clamp(24px, 4vw, 34px);
  background: color-mix(in srgb, var(--surface-raised) 94%, transparent);
  border: 1px solid color-mix(in srgb, var(--module-accent) 32%, var(--border-subtle));
  border-radius: 24px;
  box-shadow: var(--shadow-panel);
}

.weblab-host-value {
  max-width: 60%;
  overflow: hidden;
  font-size: 12px;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.enter-button:disabled {
  color: var(--text-faint);
  background: var(--surface-3);
  cursor: not-allowed;
  transform: none;
}

.enter-button:disabled:hover {
  background: var(--surface-3);
  transform: none;
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
  color: var(--module-accent);
  background: var(--module-accent-soft);
  border-color: var(--module-accent-border);
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
  background: var(--module-accent);
  border-radius: inherit;
  transition: width var(--duration-normal) var(--ease-out);
}

.release-note {
  margin: 11px 0 0;
  font-size: 12px;
  line-height: 1.5;
}

.module-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.readiness-note {
  margin: 18px 0 0;
}

.readiness-note svg {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--accent-amber);
}

.module-badge {
  flex: 0 0 auto;
  margin-left: auto;
  padding: 3px 9px;
  color: var(--module-accent);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  background: var(--module-accent-soft);
  border: var(--hairline) solid var(--module-accent-border);
  border-radius: 999px;
}

.wip-note {
  margin: 10px 0 0;
}

.module-note svg {
  flex: 0 0 auto;
  margin-top: 2px;
}

.wip-note svg {
  color: var(--module-accent);
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

.community-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  margin-top: 24px;
  padding: 18px 24px;
  background: color-mix(in srgb, var(--surface-raised) 94%, transparent);
  border: 1px solid var(--border-subtle);
  border-radius: 18px;
  box-shadow: var(--shadow-panel);
}

.community-copy {
  min-width: 0;
}

.community-kicker {
  margin: 0 0 6px;
  color: var(--accent-cyan);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.community-panel h2 {
  margin-bottom: 7px;
  font-size: 26px;
  letter-spacing: 0;
}

.community-group-number {
  margin-bottom: 8px;
  color: var(--text-secondary);
  font: 600 14px/1.4 var(--font-mono);
}

.community-description {
  max-width: 42rem;
  margin-bottom: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.55;
}

.qr-placeholder {
  position: relative;
  display: grid;
  flex: 0 0 auto;
  width: 148px;
  aspect-ratio: 1 / 1;
  place-items: center;
  color: var(--text-faint);
  border: 1px dashed var(--border-subtle);
  border-radius: 8px;
  overflow: hidden;
}

.qr-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-fast) ease;
}

.qr-placeholder.has-image .qr-image {
  opacity: 1;
  pointer-events: auto;
}

@media (max-width: 720px) {
  .selector-shell {
    padding-top: 28px;
  }

  .module-grid {
    grid-template-columns: 1fr;
  }

  .module-card,
  .weblab-card {
    min-height: 380px;
  }

  .community-panel {
    align-items: flex-start;
  }
}

@media (max-width: 520px) {
  .community-panel {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .qr-placeholder {
    align-self: center;
    width: 148px;
  }
}
</style>
