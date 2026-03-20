<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from '../stores/app'

const { state } = useStore()

const modelName = computed(() => state.selectedModel || '未选择')
const skillName = computed(() => state.selectedSkill || '无')
const workdirPath = computed(() => state.workdir.path || '-')

const copyWorkdir = () => {
  if (state.workdir.path) {
    navigator.clipboard.writeText(state.workdir.path)
    ;(window as any).showInfo?.('已复制工作目录')
  }
}
</script>

<template>
  <div class="context-bar">
    <div class="context-item">
      <span class="context-label">模型</span>
      <span class="context-value">{{ modelName }}</span>
    </div>
    <div class="context-item">
      <span class="context-label">技能</span>
      <span class="context-value">{{ skillName }}</span>
    </div>
    <div class="context-item context-workdir">
      <span class="context-label">工作目录</span>
      <span class="context-value">{{ workdirPath }}</span>
      <button class="btn-icon context-copy" title="复制路径" @click="copyWorkdir">⧉</button>
    </div>
  </div>
</template>

<style scoped>
.context-bar {
  display: flex;
  gap: 24px;
  padding: 12px 16px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}

.context-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.context-label {
  color: var(--muted);
}

.context-value {
  color: var(--text);
  font-weight: 500;
}

.context-workdir {
  margin-left: auto;
}

.context-workdir .context-value {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-copy {
  padding: 2px 6px;
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0.6;
}

.context-copy:hover {
  opacity: 1;
}
</style>