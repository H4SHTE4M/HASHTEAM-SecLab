<script setup lang="ts">
import { CTF_POSITIONING, LAB_DIRECTIONS } from '../data/levels'

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal-card" role="dialog" aria-label="关于实验室">
      <header class="modal-header">
        <h2>关于 HASHTEAM 安全实验室</h2>
        <button type="button" class="btn-close" aria-label="关闭" @click="emit('close')">×</button>
      </header>
      <div class="modal-body">
        <p>
          HASHTEAM 是一个由在校学生组成的网络安全实验室。这个「新手村」里的 Linux
          环境完全运行在你的浏览器本地（基于 WebAssembly 的 x86 虚拟化），
          不经过任何服务器，也不会对外发起网络请求。
        </p>
        <h3>实验室方向</h3>
        <ul>
          <li v-for="d in LAB_DIRECTIONS" :key="d.name">
            <strong>{{ d.name }}</strong>——{{ d.description }}
          </li>
        </ul>
        <h3>关于 CTF</h3>
        <p>{{ CTF_POSITIONING }}</p>
        <h3>安全说明</h3>
        <p>
          本环境仅用于教学体验：所有实验都作用于随网页提供的隔离虚拟机。
          客户端关卡可以被分析和修改，因此它不适合作为有奖金或正式排名的比赛系统。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(7, 11, 20, 0.7);
}

.modal-card {
  width: min(620px, 92vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #0f1830;
  border: 1px solid #22314f;
  border-radius: 12px;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #1c2a44;
}

.modal-header h2 {
  margin: 0;
  font-size: 17px;
  color: #eef3fc;
}

.btn-close {
  font-size: 22px;
  line-height: 1;
  color: #7d8aa5;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 4px;
}

.btn-close:hover {
  color: #e8eef9;
}

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
}

.modal-body h3 {
  margin: 18px 0 8px;
  font-size: 14px;
  color: #38bdf8;
}

.modal-body p,
.modal-body li {
  font-size: 14px;
  line-height: 1.85;
  color: #c7d3e8;
}

.modal-body ul {
  margin: 0;
  padding-left: 20px;
}
</style>
