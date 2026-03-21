<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { useStore } from '../stores/app'
import { wsService } from '../services/websocket'

const { state, actions } = useStore()
const inputText = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)
const askQuestion = ref('')
const askOptions = ref<any[]>([])
const askId = ref('')
const showAskDialog = ref(false)

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
  askId.value = data.askId
  askQuestion.value = data.question
  askOptions.value = data.options || []
  showAskDialog.value = true
}

const handleDone = () => {
  actions.setProgress('')
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

  // 通过 WebSocket 发送聊天消息
  wsService.sendChat(state.currentConversationId, content, state.selectedSkill || undefined)
}

// Send ask response
const sendAskResponse = async (value: any) => {
  if (!askId.value || !state.currentConversationId) return

  showAskDialog.value = false

  // Add user message with answer
  const option = askOptions.value.find(o => o.value === value)
  const answerText = option ? option.label : String(value)
  actions.addMessage('user', `[选择] ${answerText}`)
  actions.addMessage('assistant', '')
  actions.startStream()

  // 通过 WebSocket 发送用户选择
  wsService.sendChat(state.currentConversationId, `[用户选择] ${value}`, state.selectedSkill || undefined)

  // 同时发送 ask_response 用于服务器端确认
  wsService.sendAskResponse(askId.value, { value, label: answerText })
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
    <!-- Ask Dialog -->
    <div v-if="showAskDialog" class="ask-overlay">
      <div class="ask-dialog">
        <div class="ask-header">{{ askOptions[0]?.label ? '请选择' : '问题' }}</div>
        <div class="ask-question">{{ askQuestion }}</div>
        <div class="ask-options">
          <button
            v-for="(option, index) in askOptions"
            :key="index"
            class="ask-option"
            @click="sendAskResponse(option.value)"
          >
            <div class="option-label">{{ option.label }}</div>
            <div class="option-desc">{{ option.description }}</div>
          </button>
        </div>
      </div>
    </div>

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
  position: relative;
}

/* Ask Dialog */
.ask-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.ask-dialog {
  background: var(--bg);
  border-radius: var(--radius-lg);
  padding: 24px;
  max-width: 500px;
  width: 90%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.ask-header {
  font-size: 1.2rem;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text);
}

.ask-question {
  font-size: 1rem;
  color: var(--text-secondary);
  margin-bottom: 20px;
  line-height: 1.6;
}

.ask-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ask-option {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
}

.ask-option:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.option-label {
  font-weight: 600;
  font-size: 1rem;
  margin-bottom: 4px;
}

.option-desc {
  font-size: 0.85rem;
  opacity: 0.8;
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
  max-height: 200px;
  overflow-y: auto;
}

.input-row textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.input-row textarea:disabled {
  background: #f5f2ec;
}

.input-row .btn {
  padding: 12px 20px;
  min-width: 80px;
}

.btn-stop {
  background: #dc2626;
  color: white;
  border-color: var(--border);
}

.btn-stop:hover {
  background: #b91c1c;
}
</style>
