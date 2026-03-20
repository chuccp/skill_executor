<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useStore } from '../stores/app'
import { api } from '../services/api'

const { state, actions } = useStore()
const inputText = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)

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
          case 'tool_result':
            handleToolResult(data)
            break
          case 'todo':
            actions.setTodos(data)
            break
          case 'progress':
            actions.setProgress(data)
            break
          case 'done':
            actions.setProgress('')
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

// Build media URL from file path - always use API proxy for better compatibility
const buildMediaUrl = (filePath: string): string => {
  if (!filePath) return ''
  // Always use API proxy to read files
  return '/api/file?path=' + encodeURIComponent(filePath)
}

// Handle tool results
const handleToolResult = (data: { name: string; result: string }) => {
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
    const match = result.match(/写入文件成功: (.+)/)
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
    const match = result.match(/命令: (.+)\n([\s\S]*)/)
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
  border-color: #dc2626;
}

.btn-stop:hover {
  background: #b91c1c;
}
</style>