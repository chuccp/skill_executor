<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  command: string
  output?: string
  stream?: 'stdout' | 'stderr'
  success?: boolean
  isStreaming?: boolean
}>()

const outputRef = ref<HTMLElement | null>(null)

// Auto-scroll when output changes
watch(
  () => props.output,
  () => {
    nextTick(() => {
      if (outputRef.value) {
        outputRef.value.scrollTop = outputRef.value.scrollHeight
      }
    })
  }
)
</script>

<template>
  <div class="bash-result" :class="{ streaming: isStreaming, error: success === false }">
    <div class="bash-header">
      <span class="bash-icon">$</span>
      <code class="bash-cmd">{{ command }}</code>
      <span v-if="isStreaming" class="bash-status">执行中...</span>
    </div>
    <pre ref="outputRef" class="bash-output">{{ output || '(等待输出...)' }}</pre>
  </div>
</template>

<style scoped>
.bash-result {
  background: #1e1e1e;
  border-radius: 6px;
  overflow: hidden;
}

.bash-result.streaming {
  border: 1px solid #4ade80;
  animation: pulse 1s infinite;
}

.bash-result.error {
  border-color: #ef4444;
}

.bash-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #2d2d2d;
  flex-wrap: wrap;
}

.bash-icon {
  color: #4ade80;
}

.bash-cmd {
  color: #f5f5f5;
  font-size: 0.8rem;
  font-family: var(--mono);
  flex: 1;
}

.bash-status {
  color: #4ade80;
  font-size: 0.75rem;
  animation: blink 1s infinite;
}

.bash-output {
  margin: 0;
  padding: 10px;
  color: #a3a3a3;
  font-size: 0.8rem;
  max-height: 200px;
  overflow-y: auto;
  font-family: var(--mono);
  white-space: pre-wrap;
  word-break: break-all;
}

@keyframes pulse {
  0%,
  100% {
    border-color: #4ade80;
  }
  50% {
    border-color: #22c55e;
  }
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>