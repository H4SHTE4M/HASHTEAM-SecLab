<script setup lang="ts">
import { CTF_POSITIONING, LAB_DIRECTIONS } from '../data/levels'

const emit = defineEmits<{
  (e: 'restart'): void
}>()
</script>

<template>
  <main class="completion-page">
    <div class="completion-inner">
      <p class="congrats-badge">🎉 全部关卡完成</p>
      <h1 class="title">欢迎加入 HASHTEAM 的世界</h1>
      <p class="intro">
        你已经在真实的 Linux 终端里完成了身份确认、文件探索、日志分析、
        编码还原、Web 信息收集和配置修复——这正是安全工作的日常缩影。
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
        重新开始体验
      </button>
    </div>
  </main>
</template>

<style scoped>
.completion-page {
  flex: 1;
  overflow-y: auto;
  padding: 48px 24px;
}

.completion-inner {
  max-width: 860px;
  margin: 0 auto;
  text-align: center;
}

.congrats-badge {
  display: inline-block;
  font-size: 14px;
  color: #7fdba7;
  background: rgba(127, 219, 167, 0.1);
  border: 1px solid rgba(127, 219, 167, 0.35);
  padding: 6px 18px;
  border-radius: 999px;
  margin: 0 0 20px;
}

.title {
  margin: 0 0 16px;
  font-size: 34px;
  color: #eef3fc;
}

.intro {
  margin: 0 auto 40px;
  max-width: 640px;
  font-size: 15px;
  line-height: 1.9;
  color: #b8c5dd;
}

.directions h2,
.ctf-note h2 {
  font-size: 15px;
  color: #93a5c6;
  letter-spacing: 0.08em;
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
  background: #0f1830;
  border: 1px solid #22314f;
  border-radius: 10px;
  padding: 18px 20px;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.direction-card:hover {
  border-color: #38bdf8;
  transform: translateY(-2px);
}

.direction-card h3 {
  margin: 0 0 8px;
  font-size: 16px;
  color: #38bdf8;
}

.direction-card p {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: #b8c5dd;
}

.ctf-note {
  max-width: 680px;
  margin: 0 auto 40px;
  padding: 20px 24px;
  background: rgba(56, 189, 248, 0.06);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 10px;
}

.ctf-note p {
  margin: 0;
  font-size: 14px;
  line-height: 1.9;
  color: #c7d3e8;
  text-align: left;
}

.btn-restart {
  padding: 12px 36px;
  font-size: 15px;
  font-weight: 600;
  color: #06121f;
  background: #38bdf8;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.btn-restart:hover {
  background: #5ccbf9;
}
</style>
