<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '../types'
import { escapeHtml } from '../utils'

const props = defineProps<{
  message: Message
  isStreaming: boolean
  streamStatus: string
  thinkingContent: string
}>()

const isAssistant = computed(() => props.message.role === 'assistant')
const formattedContent = computed(() => {
  return formatContent(props.message.content)
})

function formatContent(content: string): string {
  if (!content) return ''
  // Simple markdown-like formatting
  let result = escapeHtml(content)
  // Code blocks
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code-block"><code>$2</code></pre>')
  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
  // Line breaks
  result = result.replace(/\n/g, '<br>')
  return result
}
</script>

<template>
  <div class="message" :class="{ assistant: isAssistant, user: !isAssistant }">
    <div class="role">{{ isAssistant ? 'AI' : 'You' }}</div>
    <div class="content" v-html="formattedContent"></div>
    <span v-if="isStreaming" class="stream-status">{{ streamStatus }}</span>
  </div>
</template>

<style scoped>
.message {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 14px 18px;
  box-shadow: 0 8px 20px rgba(18, 18, 18, 0.06);
  display: flex;
  flex-direction: column;
}

.message.user {
  background: #f3f0ea;
  margin-left: auto;
  max-width: 80%;
}

.message.assistant {
  margin-right: auto;
  max-width: 100%;
}

.role {
  font-size: 0.7rem;
  color: var(--muted);
  margin-bottom: 6px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.content {
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.95rem;
}

.stream-status {
  color: var(--accent);
  font-size: 0.85rem;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.code-block {
  background: #11120f;
  color: #f5f1ea;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  overflow-x: auto;
  margin: 8px 0;
  font-size: 0.85rem;
  font-family: var(--mono);
}

.inline-code {
  background: rgba(0,0,0,0.06);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--mono);
  font-size: 0.9em;
}
</style>
