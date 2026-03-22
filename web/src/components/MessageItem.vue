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
  return props.isStreaming ? (props.streamingBlocks || []) : []
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
watch(() => thinkingContent.value, () => {
  if (props.isStreaming && thinkingRef.value) {
    nextTick(() => {
      thinkingRef.value!.scrollTop = thinkingRef.value!.scrollHeight
    })
  }
})

// Separate media and non-media tool results
// Use refs to cache media results and prevent re-rendering on every text update
const mediaResultsRef = ref<any[]>([])
const nonMediaToolResultsRef = ref<any[]>([])

// Watch for changes in tool results and update media cache only when media actually changes
watch(() => [props.message.toolResults, props.streamingToolResults], () => {
  const msgResults = props.message.toolResults || []
  const streamResults = props.streamingToolResults || []

  // Merge results
  const merged = [...msgResults]
  for (const streamResult of streamResults) {
    // Only deduplicate media results
    if (streamResult.type === 'media') {
      const exists = merged.some(r => r.type === streamResult.type && r.data?.url === streamResult.data?.url)
      if (!exists) {
        merged.push(streamResult)
      }
    } else {
      // Non-media results always get added - no need to deduplicate
      merged.push(streamResult)
    }
  }

  const media = merged.filter(r => r.type === 'media')
  const nonMedia = merged.filter(r => r.type !== 'media')

  // Use path as stable identifier (more stable than URL which may have query params)
  const oldIds = mediaResultsRef.value.map(r => r._stableId)
  const newIds = media.map((r, idx) => {
    // Prefer path over URL for stability
    return (r.data?.path || r.data?.url || `media-${idx}`)
  })

  const hasChanged = oldIds.length !== newIds.length ||
                     oldIds.some((id, i) => id !== newIds[i])

  if (hasChanged) {
    mediaResultsRef.value = media.map((r, idx) => ({
      ...r,
      _stableId: r.data?.path || r.data?.url || `media-${idx}`
    }))
    console.log('[MessageItem] Media results changed, updated cache:', mediaResultsRef.value.length)
  } else {
    console.log('[MessageItem] Media results unchanged, using cache:', mediaResultsRef.value.length)
  }

  nonMediaToolResultsRef.value = nonMedia
}, { immediate: true })

const nonMediaToolResults = computed(() => nonMediaToolResultsRef.value)

// Stable key for media results - only changes when media actually changes
const mediaResultsKey = computed(() => {
  return mediaResultsRef.value.map(r => r._stableId).join(',')
})

// Use stored todos from message or streaming todos for the current streaming message
const todos = computed(() => {
  if (props.message.todos && props.message.todos.length > 0) {
    return props.message.todos
  }
  return props.streamingTodos || []
})
const progressText = computed(() => props.streamingProgress || '')

// Check if content has media placeholders
const hasMediaPlaceholders = computed(() => {
  if (!props.message.content) return false
  return /\[media:\d+\]/.test(props.message.content)
})

// Render content - text only, media rendered separately after content
const contentHtml = computed(() => {
  const content = props.message.content || ''
  if (!content) return ''

  // Remove media placeholders and format the text content
  const textOnly = content.replace(/\[media:\d+\]/g, '')

  return formatContent(textOnly)
})

const roleLabel = computed(() => {
  if (isSystem.value) return '系统'
  return isAssistant.value ? 'AI' : 'You'
})

const containerRef = ref<HTMLElement | null>(null)

function formatContent(content: string): string {
  if (!content) return ''

  let result = escapeHtml(content)
  // Handle markdown images: ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
    // Check for special types: ![audio: alt](url) or ![video: alt](url)
    if (alt.startsWith('audio:')) {
      const audioAlt = alt.slice(6).trim()
      return `<div class="media-inline">
  <div class="media-header">
    <span class="media-label">🎵 ${audioAlt || '音频'}</span>
  </div>
  <audio controls src="${url}" style="width:100%;max-width:100%"></audio>
</div>`
    } else if (alt.startsWith('video:')) {
      const videoAlt = alt.slice(6).trim()
      return `<div class="media-inline">
  <div class="media-header">
    <span class="media-label">🎬 ${videoAlt || '视频'}</span>
  </div>
  <video controls playsinline webkit-playsinline src="${url}" style="width:100%;max-width:100%;max-height:400px;border-radius:8px;background:#000"></video>
</div>`
    } else {
      // Default is image
      return `<div class="media-inline"><img src="${url}" alt="${alt}" class="media-thumb" style="width:100%;max-width:100%;height:auto;border-radius:8px" /></div>`
    }
  })
  // Handle headings
  result = result.replace(/^###### (.*)$/gm, '<h6>$1</h6>')
  result = result.replace(/^##### (.*)$/gm, '<h5>$1</h5>')
  result = result.replace(/^#### (.*)$/gm, '<h4>$1</h4>')
  result = result.replace(/^### (.*)$/gm, '<h3>$1</h3>')
  result = result.replace(/^## (.*)$/gm, '<h2>$1</h2>')
  result = result.replace(/^# (.*)$/gm, '<h1>$1</h1>')
  // Handle bold **text**
  result = result.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  // Handle italic *text*
  result = result.replace(/\*(.*?)\*/g, '<em>$1</em>')
  // Handle unordered lists - bullets
  result = result.replace(/^- (.*)$/gm, '<ul><li>$1</li></ul>')
  result = result.replace(/^\* (.*)$/gm, '<ul><li>$1</li></ul>')
  // Merge adjacent ul elements
  result = result.replace(/<\/ul>\s*<ul>/g, '')
  // Handle ordered lists
  result = result.replace(/^\d+\. (.*)$/gm, '<ol><li>$1</li></ol>')
  result = result.replace(/<\/ol>\s*<ol>/g, '')
  // Handle horizontal rules
  result = result.replace(/^---$/gm, '<hr>')
  // Handle regular links [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code-block"><code>$2</code></pre>')
  result = result.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
  result = result.replace(/\n/g, '<br>')

  return result
}

async function exportMedia(url: string, filename: string) {
  try {
    // Fetch the file as blob
    const response = await fetch(url)
    const blob = await response.blob()
    
    // Create download link
    const downloadUrl = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(downloadUrl)
  } catch (error) {
    console.error('Failed to export media:', error)
    // Fallback: open in new tab
    window.open(url, '_blank')
  }
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

    <!-- Content after thinking - text content only, media rendered separately -->
    <div v-if="props.message.content" class="content">
      <!-- Render text content with v-html (media placeholders removed) -->
      <span class="text-content" v-html="contentHtml"></span>
      
      <!-- Media elements rendered in a separate container after text -->
      <!-- Only re-render when media results actually change (using v-memo for caching) -->
      <div v-if="mediaResultsRef.length > 0 && hasMediaPlaceholders" class="media-container" v-memo="[mediaResultsKey]">
        <div v-for="result in mediaResultsRef" :key="result._stableId" class="media-slot">
          <div v-if="result.data?.type === 'image'" class="media-inline">
            <div class="media-header">
              <span class="media-label">🖼️ {{ result.data.name }}</span>
              <button class="btn btn-small" @click="exportMedia(result.data.url, result.data.name)">导出</button>
            </div>
            <img :src="result.data.url" :alt="result.data.name" class="media-thumb" style="width:100%;max-width:100%;height:auto" />
          </div>

          <div v-else-if="result.data?.type === 'audio'" class="media-inline">
            <div class="media-header">
              <span class="media-label">🎵 {{ result.data.name }}</span>
              <button class="btn btn-small" @click="exportMedia(result.data.url, result.data.name)">导出</button>
            </div>
            <audio controls :src="result.data.url" style="width:100%;max-width:100%"></audio>
          </div>

          <div v-else-if="result.data?.type === 'video'" class="media-inline">
            <div class="media-header">
              <span class="media-label">🎬 {{ result.data.name }}</span>
              <button class="btn btn-small" @click="exportMedia(result.data.url, result.data.name)">导出</button>
            </div>
            <video controls playsinline webkit-playsinline :src="result.data.url" class="media-video" :key="`video-${result._stableId}`" style="width:100%;max-width:100%;max-height:400px"></video>
          </div>
        </div>
      </div>
    </div>

    <!-- Media results fallback (only shown if no placeholders were used in content) -->
    <div v-if="isAssistant && mediaResultsRef.length && !hasMediaPlaceholders" class="media-results-inline" v-memo="[mediaResultsKey]">
      <div v-for="result in mediaResultsRef" :key="result._stableId">
        <div v-if="result.data.type === 'image'">
          <div class="media-header">
            <span class="media-label">🖼️ {{ result.data.name }}</span>
            <button class="btn btn-small" @click="exportMedia(result.data.url, result.data.name)">导出</button>
          </div>
          <img :src="result.data.url" class="media-thumb" alt="image" style="width:100%;max-width:100%;height:auto" />
        </div>
        <div v-else-if="result.data.type === 'audio'">
          <div class="media-header">
            <span class="media-label">🎵 {{ result.data.name }}</span>
            <button class="btn btn-small" @click="exportMedia(result.data.url, result.data.name)">导出</button>
          </div>
          <audio controls :src="result.data.url" style="width:100%;max-width:100%"></audio>
        </div>
        <div v-else-if="result.data.type === 'video'">
          <div class="media-header">
            <span class="media-label">🎬 {{ result.data.name }}</span>
            <button class="btn btn-small" @click="exportMedia(result.data.url, result.data.name)">导出</button>
          </div>
          <video controls playsinline webkit-playsinline :src="result.data.url" @click.stop.prevent class="media-video" :key="`video-${result._stableId}`" style="width:100%;max-width:100%;max-height:400px"></video>
        </div>
      </div>
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
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Text content rendered with v-html */
.text-content {
  display: block;
  line-height: 1.6;
}

.text-content :deep(pre.code-block) {
  background: #1e1e1e;
  color: #f5f5f5;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
}

.text-content :deep(code.inline-code) {
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--mono);
}

/* Media container - holds media elements in order */
.media-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  margin-top: 8px;
}

.media-slot {
  width: 100%;
}

/* Inline media in content */
.content .media-inline {
  margin: 10px 0;
  width: 100%;
}

.content .media-inline video {
  width: 100%;
  max-width: 100%;
  max-height: 400px;
  border-radius: 8px;
  background: #000;
  outline: none;
  display: block;
}

.content .media-inline img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

.content .media-inline audio {
  width: 100%;
  max-width: 100%;
}

.media-slot-container {
  width: 100%;
}

.media-slot-container .media-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 4px;
}

.media-slot-container .media-label {
  font-size: 0.85rem;
  word-break: break-word;
}

.media-slot-container .media-thumb {
  max-width: 100%;
  max-height: 200px;
  border-radius: 8px;
  cursor: pointer;
}

.media-slot-container .media-video {
  width: 100%;
  max-width: 100%;
  max-height: 400px;
  border-radius: 8px;
  background: #000;
  outline: none;
}

/* Placeholder slot marker in content */
.media-slot {
  display: inline-block;
  width: 100%;
  height: 0;
  padding-bottom: 56.25%; /* 16:9 aspect ratio placeholder */
  background: rgba(0,0,0,0.05);
  border: 2px dashed var(--border);
  border-radius: var(--radius-sm);
  margin: 10px 0;
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
  order: 5;
  margin-top: 10px;
  margin-bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 100%;
}

.media-results-inline .media-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 4px;
}

.media-results-inline .media-label {
  font-size: 0.85rem;
  word-break: break-word;
}

.media-results-inline .media-thumb {
  max-width: 100%;
  max-height: 200px;
  border-radius: 8px;
  cursor: pointer;
}

.media-results-inline .media-video {
  width: 100%;
  max-width: 100%;
  max-height: 400px;
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

/* Markdown basic styles */
.text-content h1 {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 16px 0 8px 0;
  border-bottom: 1px solid var(--border);
  padding-bottom: 4px;
}
.text-content h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 14px 0 7px 0;
  border-bottom: 1px solid var(--border);
  padding-bottom: 3px;
}
.text-content h3 {
  font-size: 1.3rem;
  font-weight: 600;
  margin: 12px 0 6px 0;
}
.text-content h4 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 10px 0 5px 0;
}
.text-content h5 {
  font-size: 1rem;
  font-weight: 600;
  margin: 8px 0 4px 0;
}
.text-content h6 {
  font-size: 0.9rem;
  font-weight: 600;
  margin: 8px 0 4px 0;
  color: var(--muted);
}
.text-content ul, .text-content ol {
  margin: 8px 0;
  padding-left: 24px;
}
.text-content li {
  margin: 4px 0;
}
.text-content hr {
  border: none;
  border-top: 2px solid var(--border);
  margin: 16px 0;
}
.text-content strong {
  font-weight: 600;
}
.text-content em {
  font-style: italic;
}
.text-content a {
  color: var(--accent);
  text-decoration: none;
}
.text-content a:hover {
  text-decoration: underline;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
