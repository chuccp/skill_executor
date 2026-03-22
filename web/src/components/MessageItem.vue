<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Message, ToolResultDisplay } from '../types'
import MarkdownRender from 'markstream-vue'
import { ThinkingPanel, TodoPanel, MediaRenderer, ToolResultPanel } from './message'

const props = defineProps<{
  message: Message
  isStreaming: boolean
  streamStatus: string
  streamingThinking?: string
  streamingToolResults?: ToolResultDisplay[]
  streamingTodos?: any[]
  streamingProgress?: string
  streamingBlocks?: Array<{ type: 'thinking' | 'text'; content: string }>
}>()

const isAssistant = computed(() => props.message.role === 'assistant')
const isSystem = computed(() => props.message.role === 'system')
const isUser = computed(() => props.message.role === 'user')

// Thinking content
const thinkingContent = computed(() => {
  return props.message.thinking || props.streamingThinking || ''
})

// Media and non-media tool results
const mediaResultsRef = ref<any[]>([])
const nonMediaToolResultsRef = ref<any[]>([])

watch(
  () => [props.message.toolResults, props.streamingToolResults],
  () => {
    const msgResults = props.message.toolResults || []
    const streamResults = props.streamingToolResults || []

    const merged = [...msgResults]
    for (const streamResult of streamResults) {
      if (streamResult.type === 'media') {
        const exists = merged.some(
          (r) => r.type === streamResult.type && r.data?.url === streamResult.data?.url
        )
        if (!exists) merged.push(streamResult)
      } else {
        merged.push(streamResult)
      }
    }

    const media = merged.filter((r) => r.type === 'media')
    const nonMedia = merged.filter((r) => r.type !== 'media')

    const oldIds = mediaResultsRef.value.map((r) => r._stableId)
    const newIds = media.map((r, idx) => r.data?.path || r.data?.url || `media-${idx}`)

    const hasChanged =
      oldIds.length !== newIds.length || oldIds.some((id, i) => id !== newIds[i])

    if (hasChanged) {
      mediaResultsRef.value = media.map((r, idx) => ({
        ...r,
        _stableId: r.data?.path || r.data?.url || `media-${idx}`
      }))
    }

    nonMediaToolResultsRef.value = nonMedia
  },
  { immediate: true }
)

// Todos
const todos = computed(() => {
  if (props.message.todos && props.message.todos.length > 0) {
    return props.message.todos
  }
  return props.streamingTodos || []
})

// Media placeholders check
const hasMediaPlaceholders = computed(() => {
  if (!props.message.content) return false
  return /\[media:\d+\]/.test(props.message.content)
})

// Markdown content (remove media placeholders)
const markdownContent = computed(() => {
  const content = props.message.content || ''
  return content.replace(/\[media:\d+\]/g, '')
})

// Role label
const roleLabel = computed(() => {
  if (isSystem.value) return '系统'
  return isAssistant.value ? 'AI' : 'You'
})
</script>

<template>
  <div class="message" :class="{ assistant: isAssistant, user: isUser, system: isSystem }">
    <div class="role">{{ roleLabel }}</div>

    <!-- Thinking Panel -->
    <ThinkingPanel v-if="isAssistant" :content="thinkingContent" />

    <!-- Todos - 显示在正文之前 -->
    <TodoPanel v-if="isAssistant" :todos="todos" />

    <!-- Content -->
    <div v-if="props.message.content" class="content">
      <MarkdownRender class="text-content" :content="markdownContent" />

      <!-- Media with placeholders -->
      <MediaRenderer
        v-if="mediaResultsRef.length > 0 && hasMediaPlaceholders"
        :results="mediaResultsRef"
      />
    </div>

    <!-- Media without placeholders -->
    <MediaRenderer
      v-if="isAssistant && mediaResultsRef.length && !hasMediaPlaceholders"
      :results="mediaResultsRef"
    />

    <!-- Tool results (non-media) -->
    <ToolResultPanel v-if="isAssistant" :results="nonMediaToolResultsRef" />

    <!-- Stream status -->
    <span v-if="isStreaming" class="stream-status">{{ streamStatus }}</span>
  </div>
</template>

<style scoped>
.message {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 18px;
  box-shadow: 0 8px 20px rgba(18, 18, 18, 0.06);
  animation: fadeIn 0.15s ease;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 760px;
}

.message.user {
  background: #f3f0ea;
  margin-left: auto;
  margin-right: 0;
}

.message.assistant {
  margin-right: auto;
  margin-left: 0;
}

.message.system {
  background: #f8f6f2;
  border-style: dashed;
  color: var(--muted);
  margin-left: auto;
  margin-right: auto;
  text-align: center;
}

.message.system .role {
  display: none;
}

.message.system .content {
  font-size: 0.85rem;
}

.role {
  font-size: 0.7rem;
  color: var(--muted);
  margin-bottom: 6px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  order: 1;
}

.content {
  line-height: 1.6;
  font-size: 0.95rem;
  order: 3;
  width: 100%;
  max-width: 100%;
  overflow-wrap: break-word;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.text-content {
  display: block;
  line-height: 1.6;
  width: 100%;
}

/* Markdown styles */
.text-content :deep(pre) {
  background: #1e1e1e;
  color: #f5f5f5;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
}

.text-content :deep(code) {
  font-family: var(--mono);
}

.text-content :deep(code:not(pre code)) {
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
}

.text-content :deep(h1) {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 16px 0 8px 0;
  border-bottom: 1px solid var(--border);
  padding-bottom: 4px;
}

.text-content :deep(h2) {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 14px 0 7px 0;
  border-bottom: 1px solid var(--border);
  padding-bottom: 3px;
}

.text-content :deep(h3) {
  font-size: 1.3rem;
  font-weight: 600;
  margin: 12px 0 6px 0;
}

.text-content :deep(h4) {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 10px 0 5px 0;
}

.text-content :deep(ul),
.text-content :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.text-content :deep(li) {
  margin: 4px 0;
}

.text-content :deep(strong) {
  font-weight: 600;
}

.text-content :deep(a) {
  color: var(--accent);
  text-decoration: none;
}

.text-content :deep(a:hover) {
  text-decoration: underline;
}

.stream-status {
  color: var(--accent);
  font-size: 0.85rem;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
  animation: pulse 1.5s infinite;
  order: 99;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>