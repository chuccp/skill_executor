<script setup lang="ts">
import { computed } from 'vue'
import type { Message, ContentBlock } from '../types'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { ThinkingPanel, TodoPanel, ContentBlockRenderer } from './message'
import { useConversationsStore } from '../stores/conversations'

const conversationsStore = useConversationsStore()

const props = defineProps<{
  message: Message
  isStreaming: boolean
  streamStatus: string
  streamingThinking?: string
  streamingTodos?: any[]
  contentBlocks?: ContentBlock[]
}>()

const isAssistant = computed(() => props.message.role === 'assistant')
const isSystem = computed(() => props.message.role === 'system')
const isUser = computed(() => props.message.role === 'user')

// Token 使用量 - 优先显示消息中保存的，否则显示流式中的
const tokenUsage = computed(() => {
  if (props.message.usage && (props.message.usage.inputTokens > 0 || props.message.usage.outputTokens > 0)) {
    return props.message.usage
  }
  if (props.isStreaming) {
    return conversationsStore.currentUsage
  }
  return null
})

// 格式化 token 数量
const formatTokens = (num: number): string => {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

// Thinking content
const thinkingContent = computed(() => {
  return props.message.thinking || props.streamingThinking || ''
})

// Todos - 只在流式过程中显示
const todos = computed(() => {
  if (props.isStreaming && props.streamingTodos && props.streamingTodos.length > 0) {
    return props.streamingTodos
  }
  return []
})

// Markdown content - 直接渲染
const markdownContent = computed(() => {
  return props.message.content || ''
})

// 是否使用内容块渲染（流式时使用）
const useContentBlocks = computed(() => {
  return props.isStreaming && props.contentBlocks && props.contentBlocks.length > 0
})

// Role label
const roleLabel = computed(() => {
  if (isSystem.value) return '系统'
  return isAssistant.value ? 'AI' : 'You'
})
</script>

<template>
  <div class="message" :class="{ assistant: isAssistant, user: isUser, system: isSystem }">
    <div class="role-row">
      <div class="role">{{ roleLabel }}</div>
    </div>

    <!-- Todos - 始终显示在正文之前 -->
    <TodoPanel v-if="isAssistant" :todos="todos" />

    <!-- 流式内容：使用内容块渲染器 -->
    <ContentBlockRenderer
      v-if="isAssistant && useContentBlocks"
      :blocks="contentBlocks || []"
      :is-streaming="isStreaming"
    />

    <!-- 非流式内容 -->
    <template v-else>
      <!-- Thinking Panel -->
      <ThinkingPanel v-if="isAssistant" :content="thinkingContent" />

      <!-- Content - markdown 渲染所有内容 -->
      <div v-if="props.message.content" class="content">
        <MarkdownRenderer class="text-content" :content="markdownContent" />
      </div>
    </template>

    <!-- Stream status and token usage -->
    <div v-if="isStreaming || (isAssistant && tokenUsage && (tokenUsage.inputTokens > 0 || tokenUsage.outputTokens > 0))" class="status-row">
      <span v-if="isStreaming" class="stream-status">{{ streamStatus }}</span>
      <span v-if="isAssistant && tokenUsage && (tokenUsage.inputTokens > 0 || tokenUsage.outputTokens > 0)" class="token-usage">
        {{ formatTokens(tokenUsage.inputTokens) }}/{{ formatTokens(tokenUsage.outputTokens) }}
      </span>
    </div>
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
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.role-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.role-row .role {
  margin-bottom: 0;
}

.content {
  line-height: 1.6;
  font-size: 0.95rem;
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

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
}

.stream-status {
  color: var(--accent);
  font-size: 0.85rem;
  animation: pulse 1.5s infinite;
}

.token-usage {
  font-size: 0.75rem;
  color: var(--muted);
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