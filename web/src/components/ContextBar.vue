<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from '../stores/app'

const { state } = useStore()

const modelName = computed(() => state.selectedModel || '未选择')
const skillName = computed(() => state.selectedSkill || '无')
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
</style>