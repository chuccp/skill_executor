<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useStore } from '../stores/app'
import ContextBar from './ContextBar.vue'
import MessageItem from './MessageItem.vue'

const { state, actions } = useStore()
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
watch(() => state.thinkingContent, scrollToBottom, { deep: true })
watch(() => state.currentToolResults, scrollToBottom, { deep: true })
watch(() => state.progressText, scrollToBottom)
watch(() => state.todos, scrollToBottom, { deep: true })
watch(() => state.askQuestion, scrollToBottom)

// Also scroll on streaming status changes
watch(() => state.isStreaming, scrollToBottom)

// Send ask response
const sendAskResponse = async (value: any) => {
  const option = state.askOptions.find(o => o.value === value)
  const answerText = option ? option.label : String(value)
  actions.addMessage('user', `[选择] ${answerText}`)
  actions.addMessage('assistant', '')
  actions.startStream()

  // 通过 WebSocket 发送用户选择
  const { wsService } = await import('../services/websocket')
  wsService.sendChat(state.currentConversationId!, `[用户选择] ${value}`, state.selectedSkill || undefined)
  wsService.sendAskResponse(state.askId, { value, label: answerText })

  // 清空询问状态
  state.askQuestion = ''
  state.askOptions = []
  state.askId = ''
}
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
          :streamingBlocks="state.isStreaming && idx === state.messages.length - 1 ? state.streamingBlocks : []"
        />
        
        <!-- Ask Dialog - 显示在 AI 对话框下方 -->
        <div v-if="state.askQuestion" class="ask-message">
          <div class="ask-bubble">
            <div class="ask-icon">❓</div>
            <div class="ask-content">
              <div class="ask-question">{{ state.askQuestion }}</div>
              <div v-if="state.askOptions.length > 0" class="ask-options">
                <button
                  v-for="(option, index) in state.askOptions"
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
  border-radius: 16px;
  padding: 16px;
  display: flex;
  gap: 12px;
  max-width: 90%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.ask-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.ask-content {
  flex: 1;
  min-width: 0;
}

.ask-question {
  font-size: 0.95rem;
  color: var(--text);
  margin-bottom: 12px;
  line-height: 1.5;
}

.ask-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ask-option-btn {
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 100px;
  flex: 1;
  max-width: 200px;
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
  font-size: 0.9rem;
}

.option-desc {
  font-size: 0.75rem;
  opacity: 0.8;
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