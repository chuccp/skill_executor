<script setup lang="ts">
import { computed } from 'vue'
import type { TodoItem } from '../../types'

const props = defineProps<{
  todos: TodoItem[]
}>()

const hasTodos = computed(() => props.todos && props.todos.length > 0)

const pendingCount = computed(() => props.todos?.filter(t => t.status === 'pending').length || 0)
const inProgressCount = computed(() => props.todos?.filter(t => t.status === 'in_progress').length || 0)
const completedCount = computed(() => props.todos?.filter(t => t.status === 'completed').length || 0)

const progress = computed(() => {
  if (!props.todos?.length) return 0
  return Math.round((completedCount.value / props.todos.length) * 100)
})
</script>

<template>
  <div v-if="hasTodos" class="todo-panel">
    <div class="todo-header">
      <span class="todo-icon">📋</span>
      <span class="todo-title">任务进度</span>
      <div class="todo-stats">
        <span v-if="pendingCount" class="stat pending">⏳ {{ pendingCount }}</span>
        <span v-if="inProgressCount" class="stat progress">🔄 {{ inProgressCount }}</span>
        <span v-if="completedCount" class="stat done">✅ {{ completedCount }}</span>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="progress-bar">
      <div class="progress-fill" :style="{ width: progress + '%' }"></div>
    </div>

    <!-- Task list -->
    <div class="todo-items">
      <div
        v-for="(todo, idx) in todos"
        :key="idx"
        class="todo-item"
        :class="todo.status"
      >
        <span class="todo-checkbox">
          <template v-if="todo.status === 'completed'">✅</template>
          <template v-else-if="todo.status === 'in_progress'">
            <span class="spinner"></span>
          </template>
          <template v-else>⬜</template>
        </span>
        <span class="todo-content">{{ todo.task }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.todo-panel {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border: 1px solid #bae6fd;
  border-radius: 8px;
  padding: 10px 12px;
  margin: 0 0 10px 0;
}

.todo-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.todo-icon {
  font-size: 1rem;
}

.todo-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #0369a1;
  flex: 1;
}

.todo-stats {
  display: flex;
  gap: 8px;
}

.stat {
  font-size: 0.75rem;
  padding: 2px 6px;
  border-radius: 4px;
}

.stat.pending {
  background: #fef3c7;
  color: #92400e;
}

.stat.progress {
  background: #dbeafe;
  color: #1d4ed8;
}

.stat.done {
  background: #dcfce7;
  color: #166534;
}

.progress-bar {
  height: 4px;
  background: #e0f2fe;
  border-radius: 2px;
  margin-bottom: 10px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #0ea5e9, #22c55e);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.todo-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.85rem;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 6px;
  transition: all 0.2s ease;
}

.todo-item.in_progress {
  background: #dbeafe;
  border-left: 3px solid #3b82f6;
  font-weight: 500;
}

.todo-item.completed {
  background: #dcfce7;
  text-decoration: line-through;
  color: #166534;
  opacity: 0.8;
}

.todo-checkbox {
  font-size: 0.9rem;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #3b82f6;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.todo-content {
  flex: 1;
  line-height: 1.4;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>