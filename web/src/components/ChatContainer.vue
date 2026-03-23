<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useConversationsStore } from '../stores/conversations'
import { useConfigStore } from '../stores/config'
import ContextBar from './ContextBar.vue'
import MessageItem from './MessageItem.vue'

const conversationsStore = useConversationsStore()
const configStore = useConfigStore()

const containerRef = ref<HTMLDivElement | null>(null)

const scrollToBottom = () => {
  nextTick(() => {
    if (containerRef.value) {
      containerRef.value.scrollTop = containerRef.value.scrollHeight
    }
  })
}

// 获取当前流式状态 - computed to get reactive updates
const streaming = computed(() => conversationsStore.currentStreaming)

// 找到最后一条 AI 消息的索引（流式内容应该显示在 AI 消息上）
const lastAssistantIndex = computed(() => {
  const messages = conversationsStore.currentMessages
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      return i
    }
  }
  return -1
})

// 只在流式输出时滚动到底部
const scrollToBottomIfStreaming = () => {
  if (streaming.value?.isStreaming) {
    scrollToBottom()
  }
}

// Watch for various changes that should trigger scroll
watch(() => conversationsStore.currentMessages.length, scrollToBottomIfStreaming)
watch(() => conversationsStore.currentMessages[conversationsStore.currentMessages.length - 1]?.content, scrollToBottomIfStreaming, { deep: true })
watch(() => streaming.value?.thinkingContent, scrollToBottomIfStreaming)
watch(() => streaming.value?.toolResults, scrollToBottomIfStreaming, { deep: true })
watch(() => streaming.value?.contentBlocks, scrollToBottomIfStreaming, { deep: true })
// askQuestion 显示时始终滚动（用于显示问题）
watch(() => configStore.state.askQuestion, (newVal) => {
  if (newVal) scrollToBottom()
})

// Send ask response - 发送用户回答给后端
const sendAskResponse = async (value: any) => {
  const askId = configStore.state.askId

  // 发送 ask_response 给后端，resolve 工具调用的 Promise
  const { wsService } = await import('../services/websocket')
  if (askId) {
    wsService.sendAskResponse(askId, value)
  }

  // 清空询问状态
  configStore.actions.clearAskUser()
}
</script>

<template>
  <div class="chat-wrapper">
    <ContextBar />
    <div class="chat-container" ref="containerRef">
      <div class="messages">
        <MessageItem
          v-for="(msg, idx) in conversationsStore.currentMessages"
          :key="idx"
          :message="msg"
          :isStreaming="!!(streaming?.isStreaming && idx === lastAssistantIndex)"
          :streamStatus="streaming?.progressText || ''"
          :streamingThinking="streaming?.isStreaming && idx === lastAssistantIndex ? streaming.thinkingContent : ''"
          :streamingTodos="streaming?.todos || []"
          :contentBlocks="streaming?.isStreaming && idx === lastAssistantIndex ? streaming.contentBlocks : []"
        />

        <!-- Ask Dialog - 显示在 AI 对话框下方 -->
        <div v-if="configStore.state.askQuestion" class="ask-message">
          <div class="ask-bubble">
            <div class="ask-icon">❓</div>
            <div class="ask-content">
              <div class="ask-question">{{ configStore.state.askQuestion }}</div>
              <div v-if="configStore.state.askOptions.length > 0" class="ask-options">
                <button
                  v-for="(option, index) in configStore.state.askOptions"
                  :key="index"
                  class="ask-option-btn"
                  @click="sendAskResponse(option.value)"
                >
                  <span class="option-label">{{ option.label }}</span>
                  <span class="option-desc">{{ option.description }}</span>
                </button>
              </div>
              <div v-else class="ask-hint">
                <span class="hint-text">请在下方输入框回答后发送</span>
              </div>
            </div>
          </div>
        </div>
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

/* Ask Message - 显示在对话流中 */
.ask-message {
  display: flex;
  justify-content: flex-start;
  animation: fadeIn 0.3s ease;
}

.ask-bubble {
  background: linear-gradient(135deg, #fef3c7 0%, #fef9e7 100%);
  border: 1px solid #fde68a;
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  gap: 8px;
  max-width: 85%;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.ask-icon {
  font-size: 1.2rem;
  flex-shrink: 0;
}

.ask-content {
  flex: 1;
  min-width: 0;
}

.ask-question {
  font-size: 0.85rem;
  color: var(--text);
  margin-bottom: 8px;
  line-height: 1.4;
}

.ask-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ask-option-btn {
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 10px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 80px;
  flex: 1;
  max-width: 160px;
}

.ask-option-btn:hover {
  background: linear-gradient(135deg, #0f766e 0%, #115e59 100%);
  border-color: #0f766e;
  color: white;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(15, 118, 110, 0.3);
}

.option-label {
  font-weight: 600;
  font-size: 0.8rem;
}

.option-desc {
  font-size: 0.65rem;
  opacity: 0.7;
}

/* Custom input when no options */
.ask-custom-input {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.custom-textarea {
  width: 100%;
  min-height: 80px;
  padding: 10px 12px;
  border: 1px solid #fde68a;
  border-radius: 8px;
  background: white;
  font-size: 0.9rem;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
  outline: none;
}

.custom-textarea:focus {
  box-shadow: 0 0 0 3px rgba(253, 230, 138, 0.3);
}

.custom-submit-btn {
  align-self: flex-end;
  padding: 8px 20px;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.custom-submit-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(217, 119, 6, 0.3);
}

.custom-submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>