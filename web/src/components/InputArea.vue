<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { useConversationsStore } from '../stores/conversations'
import { useConfigStore } from '../stores/config'
import { wsService } from '../services/websocket'

const conversationsStore = useConversationsStore()
const configStore = useConfigStore()

const inputText = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)

// 获取当前流式状态
const streaming = conversationsStore.currentStreaming

const canSend = computed(() => {
  // When waiting for answer to a question, allow sending even if streaming is active
  if (configStore.state.askQuestion && configStore.state.askId) {
    return configStore.state.selectedModel && inputText.value.trim()
  }
  return configStore.state.selectedModel && (!streaming?.isStreaming || inputText.value.trim())
})

// Stop button should always be enabled when streaming
const canStop = computed(() => {
  return configStore.state.selectedModel && streaming?.isStreaming && !configStore.state.askQuestion
})

const sendMessage = async () => {
  if (!canSend.value) return

  if (streaming?.isStreaming) {
    conversationsStore.actions.stopStream()
    return
  }

  const content = inputText.value.trim()
  const convId = conversationsStore.currentConversationId
  if (!content || !convId) return

  // 如果正在等待用户提问回答，将输入作为回答发送
  if (configStore.state.askQuestion && configStore.state.askId) {
    const askId = configStore.state.askId
    const answerText = content
    conversationsStore.actions.addMessage('user', `[回答] ${answerText}`)
    conversationsStore.actions.addMessage('assistant', '')
    conversationsStore.actions.startStream()
    wsService.sendAskResponse(askId, { value: content, label: answerText })
    // 清空询问状态
    configStore.actions.clearAskUser()
    inputText.value = ''
    return
  }

  // 正常发送聊天消息
  inputText.value = ''
  conversationsStore.actions.addMessage('user', content)
  conversationsStore.actions.addMessage('assistant', '')
  conversationsStore.actions.startStream()

  // 通过 WebSocket 发送聊天消息
  wsService.sendChat(convId, content, configStore.state.selectedSkill || undefined)
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

const adjustHeight = () => {
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.style.height = 'auto'
      inputRef.value.style.height = Math.min(inputRef.value.scrollHeight, 200) + 'px'
    }
  })
}
</script>

<template>
  <div class="input-area">
    <div class="input-wrapper">
      <div class="input-row">
        <textarea
          id="user-input"
          ref="inputRef"
          v-model="inputText"
          placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
          rows="2"
          @keydown="handleKeydown"
          @input="adjustHeight"
          :disabled="!configStore.state.selectedModel"
          class="input-textarea"
        ></textarea>
        <button
          v-if="streaming?.isStreaming && !configStore.state.askQuestion"
          class="btn btn-stop"
          @click="sendMessage"
          :disabled="!canStop"
        >
          停止
        </button>
        <button
          v-else
          class="btn btn-primary"
          @click="sendMessage"
          :disabled="!canSend"
        >
          发送
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-area {
  padding: 16px;
  background: var(--panel);
  border-top: 1px solid var(--border);
  position: relative;
}

.input-wrapper {
  max-width: 800px;
  margin: 0 auto;
}

.input-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.input-textarea {
  flex: 1;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  resize: none;
  font-size: 0.95rem;
  line-height: 1.5;
  font-family: inherit;
  max-height: 200px;
  overflow-y: auto;
  transition: all 0.2s;
}

.input-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1);
}

.input-textarea:disabled {
  background: #f5f2ec;
  cursor: not-allowed;
}

.input-row .btn {
  padding: 12px 20px;
  min-width: 80px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-stop {
  background: #dc2626;
  color: white;
  border-color: #dc2626;
}

.btn-stop:hover {
  background: #b91c1c;
}
</style>
