<script setup lang="ts">
import { CTF_POSITIONING, LAB_DIRECTIONS } from '../data/levels'
import AppIcon from './AppIcon.vue'

const emit = defineEmits<{
  (e: 'restart'): void
}>()
</script>

<template>
  <main class="completion-page">
    <div class="completion-inner">
      <p class="congrats-badge"><AppIcon name="trophy" :size="16" /> 全部关卡完成</p>
      <h1 class="title">欢迎加入 HASHTEAM 的世界</h1>
      <p class="intro">
        你已经在真实的 Linux 终端里完成了身份确认、文件整理、隐藏信息探索、
        权限收紧、日志分析、编码还原、进程排查、Web 信息收集和配置修复——
        这正是安全工作的日常缩影。
      </p>

      <section class="directions">
        <h2>实验室在做什么</h2>
        <div class="direction-grid">
          <article v-for="d in LAB_DIRECTIONS" :key="d.name" class="direction-card">
            <h3>{{ d.name }}</h3>
            <p>{{ d.description }}</p>
          </article>
        </div>
      </section>

      <section class="ctf-note">
        <h2>关于 CTF</h2>
        <p>{{ CTF_POSITIONING }}</p>
      </section>

      <button type="button" class="btn-restart" @click="emit('restart')">
        <AppIcon name="rotate-ccw" :size="17" />
        重新开始体验
      </button>
    </div>
  </main>
</template>

<style scoped>
.completion-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: calc(48px + var(--safe-top)) calc(24px + var(--safe-right)) calc(48px + var(--safe-bottom)) calc(24px + var(--safe-left));
  background: var(--bg-canvas);
}

.completion-inner {
  max-width: 860px;
  margin: 0 auto;
  text-align: center;
  animation: completion-page-in 420ms var(--ease-out) both;
}

.congrats-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  color: var(--accent-green);
  background: var(--accent-green-soft);
  border: var(--hairline) solid var(--accent-green-border);
  padding: 6px 18px;
  border-radius: 6px;
  margin: 0 0 20px;
}

.title {
  margin: 0 0 16px;
  font-family: var(--font-display);
  font-size: 38px;
  font-weight: 760;
  line-height: 1.22;
  color: var(--text-primary);
}

.intro {
  margin: 0 auto 40px;
  max-width: 640px;
  font-size: 16px;
  line-height: 1.85;
  color: var(--text-secondary);
}

.directions h2,
.ctf-note h2 {
  font-size: 14px;
  font-weight: 720;
  color: var(--text-muted);
  margin: 0 0 18px;
}

.direction-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 14px;
  margin-bottom: 40px;
  text-align: left;
}

.direction-card {
  background: var(--surface-1);
  border: var(--hairline) solid var(--border-subtle);
  border-radius: 8px;
  padding: 20px 22px;
  transition: transform var(--duration-normal) var(--ease-out), border-color var(--duration-normal) ease, background-color var(--duration-normal) ease, box-shadow var(--duration-normal) ease;
}

.direction-card:hover {
  background: var(--surface-2);
  border-color: var(--border-strong);
  box-shadow: var(--shadow-control);
  transform: translateY(-2px);
}

.direction-card h3 {
  margin: 0 0 8px;
  font-family: var(--font-display);
  font-size: 17px;
  color: var(--accent-cyan);
}

.direction-card p {
  margin: 0;
  font-size: 14px;
  line-height: 1.78;
  color: var(--text-secondary);
}

.ctf-note {
  max-width: 680px;
  margin: 0 auto 40px;
  padding: 20px 24px;
  background: var(--surface-1);
  border-left: 3px solid var(--accent-coral);
  border-radius: 0 8px 8px 0;
}

.ctf-note p {
  margin: 0;
  font-size: 14px;
  line-height: 1.9;
  color: var(--text-secondary);
  text-align: left;
}

.btn-restart {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 28px;
  font-size: 15px;
  font-weight: 720;
  color: var(--accent-cyan-contrast);
  background: var(--accent-cyan);
  border: none;
  border-radius: 7px;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(101, 212, 206, 0.14), inset 0 1px rgba(255, 255, 255, 0.24);
}

.btn-restart:hover {
  background: var(--accent-cyan-hover);
  box-shadow: 0 10px 28px rgba(101, 212, 206, 0.2), inset 0 1px rgba(255, 255, 255, 0.28);
  transform: translateY(-1px);
}

@keyframes completion-page-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 640px) {
  .completion-page {
    padding: calc(28px + var(--safe-top)) calc(16px + var(--safe-right)) calc(28px + var(--safe-bottom)) calc(16px + var(--safe-left));
  }

  .title {
    font-size: 28px;
  }

  .intro {
    margin-bottom: 30px;
    font-size: 14px;
  }

  .direction-grid {
    grid-template-columns: minmax(0, 1fr);
    margin-bottom: 30px;
  }

  .ctf-note {
    margin-bottom: 30px;
    padding: 16px 18px;
  }
}

@media (max-width: 360px) {
  .completion-page {
    padding-inline: calc(12px + var(--safe-left)) calc(12px + var(--safe-right));
  }

  .congrats-badge {
    padding-inline: 12px;
  }
}
</style>
