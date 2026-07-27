<script setup lang="ts">
import { computed } from 'vue'
import type { LevelDef } from '../types/lab'

const props = defineProps<{
  level: LevelDef
  completed: boolean
  hintsUsed: number
  isLast: boolean
}>()

const emit = defineEmits<{
  (e: 'next'): void
  (e: 'use-hint', level: number): void
  (e: 'run-command', command: string): void
}>()

const visibleHints = computed(() => props.level.hints.slice(0, props.hintsUsed))
const hasMoreHints = computed(() => props.hintsUsed < props.level.hints.length)
</script>

<template>
  <aside class="mission-panel">
    <div class="panel-scroll">
      <header class="level-header">
        <span class="level-badge">第 {{ level.id }} 关</span>
        <span v-if="completed" class="done-badge">✓ 已完成</span>
      </header>
      <h2 class="level-name">{{ level.name }}</h2>
      <p class="level-tagline">{{ level.tagline }}</p>

      <section class="block">
        <h3>剧情</h3>
        <p class="story">{{ level.story }}</p>
      </section>

      <section class="block">
        <h3>当前目标</h3>
        <ul class="goals">
          <li v-for="goal in level.goals" :key="goal">{{ goal }}</li>
        </ul>
      </section>

      <section class="block">
        <h3>建议命令 <span class="hint-note">点击即可送入终端运行</span></h3>
        <div class="commands">
          <button
            v-for="cmd in level.suggestedCommands"
            :key="cmd"
            type="button"
            class="cmd-chip"
            :title="`在终端中运行：${cmd}`"
            @click="emit('run-command', cmd)"
          >
            {{ cmd }}
          </button>
        </div>
      </section>

      <section class="block">
        <h3>提示</h3>
        <ol v-if="visibleHints.length > 0" class="hints">
          <li v-for="hint in visibleHints" :key="hint">{{ hint }}</li>
        </ol>
        <button
          v-if="hasMoreHints"
          type="button"
          class="btn-hint"
          @click="emit('use-hint', level.id)"
        >
          显示提示（{{ hintsUsed + 1 }} / {{ level.hints.length }}）
        </button>
        <p v-else class="hint-note">提示已全部展开。也可以在终端里输入 hint 随时唤起。</p>
      </section>

      <section class="block">
        <h3>验证</h3>
        <p class="check-usage">
          在终端中运行：<code>{{ level.checkUsage }}</code>
        </p>
      </section>

      <section class="block">
        <h3>你将学到</h3>
        <div class="teaches">
          <span v-for="t in level.teaches" :key="t" class="teach-tag">{{ t }}</span>
        </div>
      </section>

      <footer v-if="completed" class="next-footer">
        <p class="done-text">验证已通过，干得漂亮。</p>
        <button v-if="!isLast" type="button" class="btn-next" @click="emit('next')">
          进入下一关 →
        </button>
        <p v-else class="done-text">这是最后一关，前往查看总结。</p>
      </footer>
    </div>
  </aside>
</template>

<style scoped>
.mission-panel {
  height: 100%;
  background: #0f1830;
  border-left: 1px solid #1c2a44;
  overflow: hidden;
}

.panel-scroll {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  box-sizing: border-box;
}

.level-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.level-badge {
  font-size: 12px;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.35);
  padding: 2px 10px;
  border-radius: 999px;
}

.done-badge {
  font-size: 12px;
  color: #7fdba7;
  background: rgba(127, 219, 167, 0.1);
  border: 1px solid rgba(127, 219, 167, 0.35);
  padding: 2px 10px;
  border-radius: 999px;
}

.level-name {
  margin: 12px 0 4px;
  font-size: 22px;
  color: #eef3fc;
}

.level-tagline {
  margin: 0 0 8px;
  font-size: 13px;
  color: #7d8aa5;
}

.block {
  margin-top: 18px;
}

.block h3 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #93a5c6;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.story {
  margin: 0;
  font-size: 14px;
  line-height: 1.75;
  color: #c7d3e8;
}

.goals {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
  line-height: 1.8;
  color: #c7d3e8;
}

.commands {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}

.cmd-chip {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  color: #a8c7fa;
  background: #111c33;
  border: 1px solid #22314f;
  border-radius: 6px;
  padding: 5px 10px;
  cursor: pointer;
  text-align: left;
  max-width: 100%;
  overflow-x: auto;
  white-space: nowrap;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.cmd-chip:hover {
  border-color: #38bdf8;
  background: #16244a;
}

.hints {
  margin: 0 0 10px;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.75;
  color: #b8c5dd;
}

.btn-hint {
  font-size: 13px;
  color: #ffd580;
  background: rgba(255, 213, 128, 0.08);
  border: 1px solid rgba(255, 213, 128, 0.3);
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}

.btn-hint:hover {
  background: rgba(255, 213, 128, 0.15);
}

.hint-note {
  font-size: 12px;
  color: #66779a;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
}

.check-usage {
  margin: 0;
  font-size: 13px;
  color: #c7d3e8;
}

.check-usage code {
  font-family: 'JetBrains Mono', Consolas, monospace;
  color: #7fdba7;
  background: #111c33;
  padding: 3px 8px;
  border-radius: 4px;
}

.teaches {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.teach-tag {
  font-size: 12px;
  color: #93a5c6;
  background: #111c33;
  border: 1px solid #22314f;
  padding: 3px 10px;
  border-radius: 999px;
}

.next-footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #1c2a44;
}

.done-text {
  margin: 0 0 12px;
  font-size: 13px;
  color: #7fdba7;
}

.btn-next {
  width: 100%;
  padding: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #06121f;
  background: #38bdf8;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-next:hover {
  background: #5ccbf9;
}
</style>
