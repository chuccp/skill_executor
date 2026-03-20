<script setup lang="ts">
import { ref } from 'vue'
import { useStore } from '../stores/app'
import { api } from '../services/api'

const { state, actions } = useStore()
const inputText = ref('')

const sendMessage = async () => {
  if (state.isStreaming) {
    actions.stopStream()
    return
  }

  const content = inputText.value.trim()
  if (!content || !state.currentConversationId) return

  inputText.value = ''
  actions.addMessage('user', content)
  actions.addMessage('assistant', '')
  actions.startStream()

  try {
    await api.streamChat(
      state.currentConversationId,
      content,
      state.selectedSkill || undefined,
      (event, data) => {
        switch (event) {
          case 'text':
            actions.appendStreamText(data)
            break
          case 'thinking':
            actions.appendThinking(data)
            break
          case 'done':
            break
          case 'error':
            console.error('Stream error:', data)
            break
        }
      },
      state.abortController!.signal
    )
  } catch (error: any) {
    if (error.name === 'AbortError') {
      actions.appendStreamText('\n\n⏹️ 已停止生成')
    } else {
      console.error('Chat error:', error)
    }
  } finally {
    actions.finishStream()
    await actions.loadConversations()
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}
</script>

<template>
  <div class="input-area">
    <div class="input-wrapper">
      <div class="input-row">
        <textarea
          v-model="inputText"
          placeholder="输入消息... (Enter 发送)"
          rows="2"
          @keydown="handleKeydown"
          :disabled="!state.selectedModel"
        ></textarea>
        <button
          class="btn"
          :class="state.isStreaming ? 'btn-stop' : 'btn-primary'"
          @click="sendMessage"
          :disabled="!state.selectedModel || (!state.isStreaming && !inputText.trim())"
        >
          {{ state.isStreaming ? '停止' : '发送' }}
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

.input-row textarea {
  flex: 1;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  resize: none;
  font-size: 0.95rem;
  line-height: 1.5;
  font-family: inherit;
}

.input-row textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.input-row .btn {
  padding: 12px 20px;
  min-width: 80px;
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
