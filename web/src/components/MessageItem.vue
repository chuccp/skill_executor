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
  streamingBlocks?: Array<{type: 'thinking' | 'text', content: string}>
}>()

import { useStore } from '../stores/app'
const { state } = useStore()

const isAssistant = computed(() => props.message.role === 'assistant')
const isSystem = computed(() => props.message.role === 'system')
const isUser = computed(() => props.message.role === 'user')
const showThinking = ref(true)
const thinkingRef = ref<HTMLElement | null>(null)

// Use stored thinking or streaming thinking
const thinkingContent = computed(() => {
  return props.message.thinking || props.streamingThinking || ''
})

// Streaming blocks - ordered as they were generated
const streamingBlocks = computed(() => {
  return props.isStreaming ? state.streamingBlocks : []
})

// Auto-scroll thinking content to bottom when streaming
watch(() => streamingBlocks.value.length, () => {
  if (props.isStreaming) {
    nextTick(() => {
      if (containerRef.value) {
        containerRef.value.scrollTop = containerRef.value.scrollHeight
      }
    })
  }
})

// Auto-scroll thinking panel to bottom when streaming new thinking
watch(() => state.thinkingContent, () => {
  if (props.isStreaming && thinkingRef.value) {
    nextTick(() => {
      thinkingRef.value.scrollTop = thinkingRef.value.scrollHeight
    })
  }
})

// Use stored tool results or streaming tool results
const toolResults = computed(() => {
  if (props.message.toolResults && props.message.toolResults.length > 0) {
    return props.message.toolResults
  }
  return props.streamingToolResults || []
})

// Separate media and non-media tool results
const mediaResults = computed(() => {
  return toolResults.value.filter(r => r.type === 'media')
})

const nonMediaToolResults = computed(() => {
  return toolResults.value.filter(r => r.type !== 'media')
})

// Use stored todos from message or streaming todos for the current streaming message
const todos = computed(() => {
  if (props.message.todos && props.message.todos.length > 0) {
    return props.message.todos
  }
  return props.streamingTodos || []
})
const progressText = computed(() => props.streamingProgress || '')

const formattedContent = computed(() => {
  return formatContent(props.message.content)
})

// Content with media placeholders replaced by actual players
const contentWithMedia = computed(() => {
  let html = formattedContent.value
  if (!html) return ''
  
  // Only replace placeholders if content actually has them
  if (!hasMediaPlaceholders.value) return html

  // Replace MEDIA_PLACEHOLDER markers with actual media players
  html = html.replace(/<!-- MEDIA_PLACEHOLDER:(\d+) -->/g, (match, index) => {
    return renderMediaPlayer(parseInt(index))
  })

  return html
})

// Check if content has media placeholders
const hasMediaPlaceholders = computed(() => {
  if (!props.message.content) return false
  return /<!--\s*media:\d+\s*-->|\[media:\d+\]/.test(props.message.content)
})

const roleLabel = computed(() => {
  if (isSystem.value) return '系统'
  return isAssistant.value ? 'AI' : 'You'
})

const containerRef = ref<HTMLElement | null>(null)

function formatBlockContent(content: string): string {
  return formatContent(content)
}

// Parse content and insert media players at placeholder positions
function parseContentWithMedia(content: string): string {
  if (!content) return ''
  
  let result = escapeHtml(content)
  
  // Replace code blocks first
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code-block"><code>$2</code></pre>')
  result = result.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
  
  // Replace media placeholders with special markers
  // Format: <!-- media:0 --> or [media:0]
  result = result.replace(/<!--\s*media:(\d+)\s*-->/g, '<!-- MEDIA_PLACEHOLDER:$1 -->')
  result = result.replace(/\[media:(\d+)\]/g, '<!-- MEDIA_PLACEHOLDER:$1 -->')
  
  // Replace newlines with <br>
  result = result.replace(/\n/g, '<br>')
  
  return result
}

function formatContent(content: string): string {
  return parseContentWithMedia(content)
}

// Render media player HTML
function renderMediaPlayer(index: number): string {
  if (index < 0 || index >= mediaResults.value.length) return ''
  
  const result = mediaResults.value[index]
  if (!result || !result.data) return ''
  
  const { type, name, url } = result.data
  const exportBtn = `<button class="btn btn-small" onclick="exportMediaFromContent('${url}', '${name}')">导出</button>`
  
  if (type === 'image') {
    return `<div class="media-inline"><div class="media-header"><span class="media-label">🖼️ ${name}</span>${exportBtn}</div><div class="media-wrapper"><img src="${url}" class="media-thumb" alt="image" style="width:100%;max-width:100%;height:auto" /></div></div>`
  } else if (type === 'audio') {
    return `<div class="media-inline"><div class="media-header"><span class="media-label">🎵 ${name}</span>${exportBtn}</div><div class="media-wrapper"><audio controls src="${url}" style="width:100%;max-width:100%"></audio></div></div>`
  } else if (type === 'video') {
    return `<div class="media-inline"><div class="media-header"><span class="media-label">🎬 ${name}</span>${exportBtn}</div><div class="media-wrapper"><video controls playsinline webkit-playsinline src="${url}" class="media-video" style="width:100%;max-width:100%;max-height:400px"></video></div></div>`
  }
  return ''
}

// Export for inline media
;(window as any).exportMediaFromContent = (url: string, name: string) => {
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
  <div class="message" :class="{ assistant: isAssistant, user: isUser, system: isSystem }" ref="containerRef">
    <div class="role">{{ roleLabel }}</div>

    <!-- Thinking process first - always after role, before content -->
    <div v-if="isAssistant && thinkingContent" class="thinking-panel" :class="{ visible: true, collapsed: !showThinking }">
      <div class="thinking-header" @click="showThinking = !showThinking">
        <span class="thinking-icon">💭</span>
        <span class="thinking-title">思考过程</span>
        <button class="thinking-toggle">{{ !showThinking ? '▶' : '▼' }}</button>
      </div>
      <div v-show="showThinking" ref="thinkingRef" class="thinking-content">{{ thinkingContent }}</div>
    </div>

    <!-- Content after thinking (with media placeholders replaced) -->
    <div v-if="props.message.content" class="content" v-html="contentWithMedia"></div>

    <!-- Media results (only shown if no placeholders were used in content) -->
    <div v-if="isAssistant && mediaResults.length && !hasMediaPlaceholders" class="media-results-inline">
      <div v-for="(result, idx) in mediaResults" :key="idx">
        <div v-if="result.data.type === 'image'">
          <div class="media-header">
            <span class="media-label">🖼️ {{ result.data.name }}</span>
            <button class="btn btn-small" @click="exportMedia(result.data.url, result.data.name)">导出</button>
          </div>
          <img :src="result.data.url" class="media-thumb" alt="image" />
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

    <!-- Tool results (non-media) -->
    <div v-if="isAssistant && nonMediaToolResults.length" class="tool-results">
      <div v-for="(result, idx) in nonMediaToolResults" :key="idx">
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
      </div>
    </div>

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
  order: 3;
  width: 100%;
  max-width: 100%;
  overflow-wrap: break-word;
  min-width: 0;
  overflow: hidden;
  display: block;
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
  order: 20;
  background: #f0f7ff;
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  margin-top: 10px;
  margin-bottom: 0;
}

.progress-text {
  font-size: 0.85rem;
  color: #0369a1;
}

/* Tool results */
.tool-results {
  order: 40;
  margin-top: 10px;
  margin-bottom: 0;
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

.media-result {
  background: #f8f6f2;
  border-radius: var(--radius-sm);
  padding: 10px;
}

/* Media results inline (shown right after content) */
.media-results-inline {
  order: 4;
  margin-top: 10px;
  margin-bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 100%;
  overflow: hidden;
}

/* Media inline (when inserted via placeholder in content) */
.media-inline {
  margin: 10px 0;
  padding: 10px;
  background: #f8f6f2;
  border-radius: var(--radius-sm);
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;
  min-width: 0;
  display: block;
}

.media-inline .media-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 100%;
}

/* Media wrapper to constrain media elements */
.media-wrapper {
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  position: relative;
}

.media-wrapper video,
.media-wrapper audio,
.media-wrapper img {
  width: 100%;
  max-width: 100%;
  height: auto;
  display: block;
}

.media-inline .media-label {
  font-size: 0.85rem;
  word-break: break-word;
  max-width: calc(100% - 60px);
}

.media-inline .media-thumb {
  max-width: 100%;
  max-height: 200px;
  border-radius: 8px;
  cursor: pointer;
}

.media-inline .media-video {
  border-radius: 8px;
  background: #000;
  outline: none;
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
  order: 30;
  background: #f8f6f2;
  border-radius: var(--radius-sm);
  padding: 10px;
  margin-top: 10px;
  margin-bottom: 0;
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
