<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import type { Message, ToolResultDisplay } from '../types'
import { escapeHtml } from '../utils'

const props = defineProps<{
  message: Message
  isStreaming: boolean
  streamStatus: string
  // Streaming state (only for current streaming message)
  streamingThinking?: string
  streamingToolResults?: ToolResultDisplay[]
  streamingTodos?: any[]
  streamingProgress?: string
}>()

const isAssistant = computed(() => props.message.role === 'assistant')
const isSystem = computed(() => props.message.role === 'system')
const isUser = computed(() => props.message.role === 'user')
const showThinking = ref(false)
const thinkingRef = ref<HTMLElement | null>(null)

// Use stored thinking or streaming thinking
const thinkingContent = computed(() => {
  return props.message.thinking || props.streamingThinking || ''
})

// Auto-scroll thinking content to bottom when streaming
watch(thinkingContent, () => {
  if (props.isStreaming) {
    nextTick(() => {
      if (thinkingRef.value) {
        thinkingRef.value.scrollTop = thinkingRef.value.scrollHeight
      }
    })
  }
})

// Use stored tool results or streaming tool results
const toolResults = computed(() => {
  return props.message.toolResults || props.streamingToolResults || []
})

// Only streaming has todos and progress
const todos = computed(() => props.streamingTodos || [])
const progressText = computed(() => props.streamingProgress || '')

const formattedContent = computed(() => {
  return formatContent(props.message.content)
})

const roleLabel = computed(() => {
  if (isSystem.value) return '系统'
  return isAssistant.value ? 'AI' : 'You'
})

function formatContent(content: string): string {
  if (!content) return ''
  let result = escapeHtml(content)
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code-block"><code>$2</code></pre>')
  result = result.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
  result = result.replace(/\n/g, '<br>')
  return result
}

// Export media file
const exportMedia = (url: string, name: string) => {
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.target = '_blank'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<template>
  <div class="message" :class="{ assistant: isAssistant, user: isUser, system: isSystem }">
    <div class="role">{{ roleLabel }}</div>

    <!-- Thinking panel -->
    <div v-if="isAssistant && thinkingContent" class="thinking-panel" :class="{ visible: true, collapsed: !showThinking && !isStreaming }">
      <div class="thinking-header" @click="showThinking = !showThinking">
        <span class="thinking-icon">💭</span>
        <span class="thinking-title">思考过程</span>
        <button class="thinking-toggle">{{ showThinking || isStreaming ? '▼' : '▶' }}</button>
      </div>
      <div v-show="showThinking || isStreaming" ref="thinkingRef" class="thinking-content">{{ thinkingContent }}</div>
    </div>

    <!-- Progress -->
    <div v-if="isAssistant && progressText && isStreaming" class="progress-panel">
      <span class="progress-text">⏳ {{ progressText }}</span>
    </div>

    <!-- Todos -->
    <div v-if="isAssistant && todos && todos.length" class="todo-panel">
      <div class="todo-header">📝 任务列表</div>
      <div class="todo-items">
        <div v-for="(todo, idx) in todos" :key="idx" class="todo-item" :class="todo.status">
          <span class="todo-checkbox">{{ todo.status === 'completed' ? '✅' : todo.status === 'in_progress' ? '🔄' : '⬜' }}</span>
          <span class="todo-content">{{ todo.task }}</span>
        </div>
      </div>
    </div>

    <!-- Tool results -->
    <div v-if="isAssistant && toolResults && toolResults.length" class="tool-results">
      <div v-for="(result, idx) in toolResults" :key="idx">
        <!-- File content -->
        <div v-if="result.type === 'file'" class="file-preview">
          <div class="fp-header">
            <span class="fp-name">📄 {{ result.data.filePath.split(/[\\/]/).pop() }}</span>
          </div>
          <pre class="fp-content">{{ result.data.content.slice(0, 500) }}{{ result.data.content.length > 500 ? '...' : '' }}</pre>
        </div>

        <!-- Files list -->
        <div v-else-if="result.type === 'files'" class="files-result">
          <div class="sr-title">📁 文件列表 ({{ result.data.total }} 个)</div>
          <div class="sr-items">
            <div v-for="file in result.data.files.slice(0, 10)" :key="file" class="sr-item">
              {{ file.startsWith('[DIR]') ? '📁' : '📄' }} {{ file.replace(/\[DIR\]|\[FILE\]/g, '').trim() }}
            </div>
            <div v-if="result.data.files.length > 10" class="sr-more">+ 还有 {{ result.data.files.length - 10 }} 个</div>
          </div>
        </div>

        <!-- Search result -->
        <div v-else-if="result.type === 'search'" class="search-result">
          <div class="sr-title">🔍 {{ result.data.query }}</div>
          <div class="sr-items">
            <div v-for="item in result.data.files.slice(0, 5)" :key="item" class="sr-item">{{ item.split(/[\\/]/).pop() }}</div>
            <div v-if="result.data.total > 5" class="sr-more">+ 共 {{ result.data.total }} 个结果</div>
          </div>
        </div>

        <!-- Write result -->
        <div v-else-if="result.type === 'write'" class="write-result">
          ✅ 已写入: <code>{{ result.data.path.split(/[\\/]/).pop() }}</code>
        </div>

        <!-- Bash result -->
        <div v-else-if="result.type === 'bash'" class="bash-result">
          <div class="bash-header">
            <span class="bash-icon">$</span>
            <code class="bash-cmd">{{ result.data.command }}</code>
          </div>
          <pre class="bash-output">{{ result.data.output.slice(0, 300) }}{{ result.data.output.length > 300 ? '\n...' : '' }}</pre>
        </div>

        <!-- Media result -->
        <div v-else-if="result.type === 'media'" class="media-result">
          <div v-if="result.data.type === 'image'">
            <div class="media-header">
              <span class="media-label">🖼️ {{ result.data.name }}</span>
              <button class="btn btn-small" @click="exportMedia(result.data.url, result.data.name)">导出</button>
            </div>
            <img :src="result.data.url" class="media-thumb" />
          </div>
          <div v-else-if="result.data.type === 'audio'">
            <div class="media-header">
              <span class="media-label">🎵 {{ result.data.name }}</span>
              <button class="btn btn-small" @click="exportMedia(result.data.url, result.data.name)">导出</button>
            </div>
            <audio controls :src="result.data.url"></audio>
          </div>
          <div v-else-if="result.data.type === 'video'">
            <div class="media-header">
              <span class="media-label">🎬 {{ result.data.name }}</span>
              <button class="btn btn-small" @click="exportMedia(result.data.url, result.data.name)">导出</button>
            </div>
            <video controls playsinline webkit-playsinline :src="result.data.url" @click.stop.prevent class="media-video"></video>
          </div>
        </div>
      </div>
    </div>

    <div class="content" v-html="formattedContent"></div>

    <!-- Stream status -->
    <span v-if="isStreaming" class="stream-status">{{ streamStatus }}</span>
  </div>
</template>

<style scoped>
.message {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 14px 18px;
  box-shadow: 0 8px 20px rgba(18, 18, 18, 0.06);
  animation: fadeIn 0.15s ease;
  display: flex;
  flex-direction: column;
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
  margin-bottom: 6px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  order: 1;
}

.content {
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.95rem;
  order: 2;
}

.stream-status {
  color: var(--accent);
  font-size: 0.85rem;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
  animation: pulse 1.5s infinite;
  order: 99;
}

/* Thinking panel */
.thinking-panel {
  background: linear-gradient(135deg, #fef7ed 0%, #fff7f0 100%);
  border: 1px solid #f5e6d8;
  border-radius: 8px;
  margin: 0 0 10px 0;
  max-height: 120px;
  display: flex;
  flex-direction: column;
  font-size: 0.75rem;
  color: #8b6914;
  overflow: hidden;
  order: 2;
}

.thinking-panel.collapsed {
  max-height: 28px;
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: #fef3e2;
  border-bottom: 1px solid #f5e6d8;
  cursor: pointer;
  user-select: none;
}

.thinking-panel.collapsed .thinking-header {
  border-bottom: none;
}

.thinking-icon { font-size: 0.85rem; }
.thinking-title { font-weight: 500; }
.thinking-toggle {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.7rem;
}

.thinking-content {
  flex: 1;
  overflow-y: auto;
  padding: 6px 10px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: #a16207;
  max-height: 90px;
}

/* Progress */
.progress-panel {
  order: 2;
  background: #f0f7ff;
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  margin-bottom: 10px;
}

.progress-text {
  font-size: 0.85rem;
  color: #0369a1;
}

/* Tool results */
.tool-results {
  order: 2;
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-preview {
  background: #f8f6f2;
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.fp-header {
  padding: 8px 10px;
  background: #f0ede6;
  font-size: 0.85rem;
  font-weight: 500;
}

.fp-content {
  padding: 10px;
  margin: 0;
  font-size: 0.8rem;
  overflow-x: auto;
  font-family: var(--mono);
  max-height: 150px;
  overflow-y: auto;
}

.files-result, .search-result {
  background: #f8f6f2;
  border-radius: var(--radius-sm);
  padding: 10px;
}

.sr-title {
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 8px;
}

.sr-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sr-item {
  font-size: 0.8rem;
  padding: 4px 6px;
  background: rgba(255,255,255,0.5);
  border-radius: 4px;
}

.sr-more {
  font-size: 0.75rem;
  color: var(--muted);
  margin-top: 4px;
}

.write-result {
  background: #f0fdf4;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
}

.write-result code {
  background: rgba(0,0,0,0.05);
  padding: 2px 6px;
  border-radius: 4px;
}

.bash-result {
  background: #1e1e1e;
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.bash-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #2d2d2d;
}

.bash-icon { color: #4ade80; }
.bash-cmd {
  color: #f5f5f5;
  font-size: 0.8rem;
  font-family: var(--mono);
}

.bash-output {
  margin: 0;
  padding: 10px;
  color: #a3a3a3;
  font-size: 0.8rem;
  max-height: 100px;
  overflow-y: auto;
  font-family: var(--mono);
}

.media-result {
  background: #f8f6f2;
  border-radius: var(--radius-sm);
  padding: 10px;
}

.media-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.media-label {
  font-size: 0.85rem;
}

.media-thumb {
  max-width: 100%;
  max-height: 200px;
  border-radius: 8px;
  cursor: pointer;
}

.media-video {
  max-width: 100%;
  border-radius: 8px;
  background: #000;
  outline: none;
}

/* Todos */
.todo-panel {
  order: 2;
  background: #f8f6f2;
  border-radius: var(--radius-sm);
  padding: 10px;
  margin-bottom: 10px;
}

.todo-header {
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 8px;
}

.todo-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.85rem;
}

.todo-item.completed {
  text-decoration: line-through;
  color: var(--muted);
}

.todo-item.in_progress {
  color: var(--accent);
}

.todo-checkbox {
  font-size: 0.8rem;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
