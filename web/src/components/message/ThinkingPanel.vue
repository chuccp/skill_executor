<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  content: string
}>()

const showThinking = ref(true)
</script>

<template>
  <div
    v-if="props.content"
    class="thinking-panel"
    :class="{ visible: true, collapsed: !showThinking }"
  >
    <div class="thinking-header" @click="showThinking = !showThinking">
      <span class="thinking-icon">💭</span>
      <span class="thinking-title">思考过程</span>
      <button class="thinking-toggle">{{ !showThinking ? '▶' : '▼' }}</button>
    </div>
    <div v-show="showThinking" class="thinking-content">{{ props.content }}</div>
  </div>
</template>

<style scoped>
.thinking-panel {
  background: linear-gradient(135deg, #fef7ed 0%, #fff7f0 100%);
  border: 1px solid #f5e6d8;
  border-radius: 8px;
  margin: 0 0 10px 0;
  max-height: 120px;
  display: flex;
  flex-direction: column;
  font-size: 0.75rem;
  color: #8b6914;
  overflow: hidden;
  order: 2;
}

.thinking-panel.collapsed {
  max-height: 28px;
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: #fef3e2;
  border-bottom: 1px solid #f5e6d8;
  cursor: pointer;
  user-select: none;
}

.thinking-panel.collapsed .thinking-header {
  border-bottom: none;
}

.thinking-icon {
  font-size: 0.85rem;
}

.thinking-title {
  font-weight: 500;
}

.thinking-toggle {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.7rem;
}

.thinking-content {
  flex: 1;
  overflow-y: auto;
  padding: 6px 10px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: #a16207;
  max-height: 90px;
}
</style>