<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useStore } from '../stores/app'
import ContextBar from './ContextBar.vue'
import MessageItem from './MessageItem.vue'

const { state } = useStore()
const containerRef = ref<HTMLDivElement | null>(null)

const scrollToBottom = () => {
  nextTick(() => {
    if (containerRef.value) {
      containerRef.value.scrollTop = containerRef.value.scrollHeight
    }
  })
}

// Watch for various changes that should trigger scroll
watch(() => state.messages.length, scrollToBottom)
watch(() => state.messages[state.messages.length - 1]?.content, scrollToBottom)
watch(() => state.thinkingContent, scrollToBottom)
watch(() => state.currentToolResults.length, scrollToBottom)
watch(() => state.progressText, scrollToBottom)
watch(() => state.todos.length, scrollToBottom)
</script>

<template>
  <div class="chat-wrapper">
    <ContextBar />
    <div class="chat-container" ref="containerRef">
      <div class="messages">
        <MessageItem
          v-for="(msg, idx) in state.messages"
          :key="idx"
          :message="msg"
          :isStreaming="state.isStreaming && idx === state.messages.length - 1"
          :streamStatus="state.streamStatus"
          :streamingThinking="state.isStreaming && idx === state.messages.length - 1 ? state.thinkingContent : ''"
          :streamingToolResults="state.isStreaming && idx === state.messages.length - 1 ? state.currentToolResults : []"
          :streamingTodos="state.isStreaming && idx === state.messages.length - 1 ? state.todos : []"
          :streamingProgress="state.isStreaming && idx === state.messages.length - 1 ? state.progressText : ''"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.chat-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: var(--bg);
}

.messages {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
</style>