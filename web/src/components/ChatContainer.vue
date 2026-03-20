<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useStore } from '../stores/app'
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

watch(() => state.messages.length, scrollToBottom)
watch(() => state.messages[state.messages.length - 1]?.content, scrollToBottom)
</script>

<template>
  <div class="chat-container" ref="containerRef">
    <div class="messages">
      <MessageItem
        v-for="(msg, idx) in state.messages"
        :key="idx"
        :message="msg"
        :isStreaming="state.isStreaming && idx === state.messages.length - 1"
        :streamStatus="state.streamStatus"
        :thinkingContent="state.thinkingContent"
      />
    </div>
  </div>
</template>

<style scoped>
.chat-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: var(--bg);
}

.messages {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
</style>
