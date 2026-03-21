<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useStore } from '../stores/app'
import { wsService } from '../services/websocket'

const { state } = useStore()

const modelName = computed(() => state.selectedModel || '未选择')
const skillName = computed(() => state.selectedSkill || '无')
const wsConnected = ref(wsService.isConnected())

// WebSocket 连接状态监听
const updateWsStatus = () => {
  wsConnected.value = wsService.isConnected()
}

onMounted(() => {
  const checkConnection = setInterval(updateWsStatus, 1000)
  onUnmounted(() => clearInterval(checkConnection))
})
</script>

<template>
  <div class="context-bar">
    <div class="context-left">
      <div class="context-item">
        <span class="context-label">模型</span>
        <span class="context-value">{{ modelName }}</span>
      </div>
      <div class="context-item">
        <span class="context-label">技能</span>
        <span class="context-value">{{ skillName }}</span>
      </div>
    </div>
    <div class="context-right">
      <div class="context-item">
        <span class="context-label">连接</span>
        <span class="context-value" :class="wsConnected ? 'connected' : 'disconnected'">
          <span class="status-dot" :class="wsConnected ? 'on' : 'off'"></span>
          {{ wsConnected ? '已连接' : '未连接' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.context-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}

.context-left {
  display: flex;
  gap: 24px;
}

.context-right {
  display: flex;
  gap: 24px;
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
  display: flex;
  align-items: center;
  gap: 6px;
}

.context-value.connected {
  color: #059669;
}

.context-value.disconnected {
  color: #dc2626;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.status-dot.on {
  background: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
}

.status-dot.off {
  background: #ef4444;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>