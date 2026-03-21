<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, computed } from 'vue'
import { useStore } from '../stores/app'
import { wsService } from '../services/websocket'

const { state, actions } = useStore()
const inputText = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)

// WebSocket 事件处理器
const handleText = (data: any) => {
  actions.appendStreamText(data.content)
}

const handleThinking = (data: any) => {
  actions.appendThinking(data.content)
}

const handleToolResult = (data: any) => {
  handleToolResultData(data)
}

const handleTodo = (data: any) => {
  actions.setTodos(data.todos || data)
}

const handleProgress = (data: any) => {
  actions.setProgress(data.content || data)
}

const handleAskUser = (data: any) => {
  // 当AI暂停等待用户回答时，先把当前已有的思考、工具结果、任务列表保存到消息对象，防止后续清空后丢失
  const lastMsg = state.messages[state.messages.length - 1]
  if (lastMsg && lastMsg.role === 'assistant') {
    if (state.thinkingContent) {
      lastMsg.thinking = state.thinkingContent
    }
    if (state.currentToolResults.length) {
      lastMsg.toolResults = state.currentToolResults
    }
    if (state.todos.length) {
      lastMsg.todos = state.todos
    }
  }
  state.askId = data.askId
  state.askQuestion = data.question
  state.askOptions = data.options || []
}

const handleDone = () => {
  actions.setProgress('')
  state.askQuestion = ''
  state.askOptions = []
  state.askId = ''
  actions.finishStream()
  actions.loadConversations()
}

const handleError = (data: any) => {
  console.error('Stream error:', data.content)
  actions.finishStream()
}

// 注册 WebSocket 事件处理器
onMounted(() => {
  wsService.on('text', handleText)
  wsService.on('thinking', handleThinking)
  wsService.on('tool_result', handleToolResult)
  wsService.on('todo_updated', handleTodo)
  wsService.on('todo', handleTodo)
  wsService.on('progress', handleProgress)
  wsService.on('ask_user', handleAskUser)
  wsService.on('done', handleDone)
  wsService.on('error', handleError)
})

// 清理事件处理器
onUnmounted(() => {
  wsService.off('text', handleText)
  wsService.off('thinking', handleThinking)
  wsService.off('tool_result', handleToolResult)
  wsService.off('todo_updated', handleTodo)
  wsService.off('todo', handleTodo)
  wsService.off('progress', handleProgress)
  wsService.off('ask_user', handleAskUser)
  wsService.off('done', handleDone)
  wsService.off('error', handleError)
})

const canSend = computed(() => {
  // When waiting for answer to a question, allow sending even if streaming is active
  if (state.askQuestion && state.askId) {
    return state.selectedModel && inputText.value.trim()
  }
  return state.selectedModel && (!state.isStreaming || inputText.value.trim())
})

// Stop button should always be enabled when streaming
const canStop = computed(() => {
  return state.selectedModel && state.isStreaming && !state.askQuestion
})

const sendMessage = async () => {
  if (!canSend.value) return

  if (state.isStreaming) {
    actions.stopStream()
    return
  }

  const content = inputText.value.trim()
  if (!content || !state.currentConversationId) return

  // 如果正在等待用户提问回答，将输入作为回答发送
  if (state.askQuestion && state.askId) {
    const askId = state.askId
    const answerText = content
    actions.addMessage('user', `[回答] ${answerText}`)
    actions.startStream()
    wsService.sendAskResponse(askId, { value: content, label: answerText })
    // 清空询问状态
    state.askQuestion = ''
    state.askOptions = []
    state.askId = ''
    inputText.value = ''
    return
  }

  // 正常发送聊天消息
  inputText.value = ''
  actions.addMessage('user', content)
  actions.addMessage('assistant', '')
  actions.startStream()

  // 通过 WebSocket 发送聊天消息
  wsService.sendChat(state.currentConversationId, content, state.selectedSkill || undefined)
}

// Build media URL from file path - always use API proxy for better compatibility
const buildMediaUrl = (filePath: string): string => {
  if (!filePath) return ''
  // Always use API proxy to read files
  return '/api/file?path=' + encodeURIComponent(filePath)
}

// Handle tool results
const handleToolResultData = (data: { name: string; result: string }) => {
  const { name, result } = data

  // Check for MEDIA_INFO format
  if (result.startsWith('MEDIA_INFO:')) {
    try {
      const mediaInfo = JSON.parse(result.substring(11))
      // Build URL from path
      const url = buildMediaUrl(mediaInfo.path)
      actions.addToolResult({
        type: 'media',
        data: {
          type: mediaInfo.type,
          name: mediaInfo.name,
          path: mediaInfo.path,
          url: url,
          size: mediaInfo.size
        }
      })
    } catch (e) {}
    return
  }

  if (name === 'read_file') {
    const match = result.match(/文件内容 \((.+?)\):/)
    const filePath = match ? match[1] : ''
    const contentMatch = result.match(/```\n?([\s\S]*?)\n?```/)
    const content = contentMatch ? contentMatch[1] : result
    if (filePath && content) {
      actions.addToolResult({ type: 'file', data: { filePath, content } })
    }
  } else if (name === 'get_files' || name === 'list_directory') {
    const match = result.match(/中的文件 \((\d+) 个\):\n([\s\S]*)/)
    if (match) {
      const files = match[2].trim().split('\n')
      actions.addToolResult({ type: 'files', data: { files, total: parseInt(match[1]) } })
    }
  } else if (name === 'glob') {
    const match = result.match(/找到 (\d+) 个文件匹配 "([^"]+)":\n([\s\S]+)/)
    if (match) {
      const files = match[3].trim().split('\n')
      actions.addToolResult({ type: 'search', data: { query: match[2], files, total: parseInt(match[1]) } })
    }
  } else if (name === 'grep') {
    const match = result.match(/找到 (\d+) 个匹配:\n([\s\S]+)/)
    if (match) {
      const lines = match[2].trim().split('\n')
      actions.addToolResult({ type: 'search', data: { query: '内容搜索', files: lines, total: parseInt(match[1]) } })
    }
  } else if (name === 'write_file') {
    const match = result.match(/写入文件成功：(.+)/)
    if (match) {
      const filePath = match[1]
      const ext = filePath.split('.').pop()?.toLowerCase() || ''

      // Check if it's a media file
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']
      const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac']
      const videoExts = ['mp4', 'webm', 'avi', 'mov', 'mkv']

      if (imageExts.includes(ext)) {
        actions.addToolResult({
          type: 'media',
          data: {
            type: 'image',
            name: filePath.split(/[\\/]/).pop(),
            path: filePath,
            url: buildMediaUrl(filePath)
          }
        })
      } else if (audioExts.includes(ext)) {
        actions.addToolResult({
          type: 'media',
          data: {
            type: 'audio',
            name: filePath.split(/[\\/]/).pop(),
            path: filePath,
            url: buildMediaUrl(filePath)
          }
        })
      } else if (videoExts.includes(ext)) {
        actions.addToolResult({
          type: 'media',
          data: {
            type: 'video',
            name: filePath.split(/[\\/]/).pop(),
            path: filePath,
            url: buildMediaUrl(filePath)
          }
        })
      } else {
        actions.addToolResult({ type: 'write', data: { path: filePath } })
      }
    }
  } else if (name === 'bash') {
    const match = result.match(/命令：(.+)\n([\s\S]*)/)
    if (match) {
      actions.addToolResult({ type: 'bash', data: { command: match[1], output: match[2].trim() } })
    }
  }
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
          :disabled="!state.selectedModel"
          class="input-textarea"
        ></textarea>
        <button
          v-if="state.isStreaming && !state.askQuestion"
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
