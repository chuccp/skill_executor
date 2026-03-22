<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ContentBlock } from '../../types'
import MarkdownRenderer from '../MarkdownRenderer.vue'

const props = defineProps<{
  blocks: ContentBlock[]
  isStreaming: boolean
}>()

// Media item interface
interface MediaItem {
  type: 'video' | 'audio' | 'image'
  url: string
  name: string
}

// Parse content and extract media patterns
function parseMediaContent(content: string): { segments: Array<{ type: 'text' | 'media'; content?: string; media?: MediaItem }> } {
  if (!content) return { segments: [] }

  // Match patterns: ![video: name](url), ![audio: name](url), ![name](url)
  const mediaRegex = /!\[(?:(video|audio):\s*)?([^\]]*)\]\(([^)]+)\)/g

  const segments: Array<{ type: 'text' | 'media'; content?: string; media?: MediaItem }> = []
  let lastIndex = 0
  let match

  while ((match = mediaRegex.exec(content)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      const textContent = content.slice(lastIndex, match.index).trim()
      if (textContent) {
        segments.push({ type: 'text', content: textContent })
      }
    }

    // Determine media type
    const mediaType = (match[1] as 'video' | 'audio') || 'image'
    const mediaName = match[2] || 'media'
    const mediaUrl = match[3]

    segments.push({
      type: 'media',
      media: {
        type: mediaType,
        url: mediaUrl,
        name: mediaName
      }
    })

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const remainingContent = content.slice(lastIndex).trim()
    if (remainingContent) {
      segments.push({ type: 'text', content: remainingContent })
    }
  }

  return { segments }
}

// Filter blocks to show (只显示 thinking 和 text)
const visibleBlocks = computed(() => {
  return props.blocks.filter(block => {
    if (block.type === 'thinking') {
      return block.thinkingContent && block.thinkingContent.trim()
    }
    if (block.type === 'text') {
      return block.content && block.content.trim()
    }
    return false
  })
})

// Parse each text block into segments
const parsedBlocks = computed(() => {
  return visibleBlocks.value.map(block => {
    if (block.type === 'thinking') {
      return { block, segments: null }
    }
    return {
      block,
      segments: parseMediaContent(block.content || '').segments
    }
  })
})

// Thinking panel state (expanded/collapsed) - default to expanded
const thinkingExpanded = ref<Record<string, boolean>>({})

const isThinkingExpanded = (id: string) => {
  return thinkingExpanded.value[id] !== false
}

const toggleThinking = (id: string) => {
  thinkingExpanded.value[id] = !isThinkingExpanded(id)
}
</script>

<template>
  <div class="content-blocks">
    <template v-for="parsed in parsedBlocks" :key="parsed.block.id">
      <!-- Thinking block -->
      <div v-if="parsed.block.type === 'thinking'" class="thinking-block" :class="{ collapsed: !isThinkingExpanded(parsed.block.id) }">
        <div class="thinking-header" @click="toggleThinking(parsed.block.id)">
          <span class="thinking-icon">💭</span>
          <span class="thinking-title">思考过程</span>
          <button class="thinking-toggle">{{ isThinkingExpanded(parsed.block.id) ? '▼' : '▶' }}</button>
        </div>
        <div
          v-show="isThinkingExpanded(parsed.block.id)"
          class="thinking-content"
        >{{ parsed.block.thinkingContent || '' }}</div>
      </div>

      <!-- Text block with media support -->
      <template v-else-if="parsed.segments">
        <template v-for="(segment, idx) in parsed.segments" :key="idx">
          <!-- Media segment -->
          <div v-if="segment.type === 'media' && segment.media" class="media-container">
            <!-- Video -->
            <video
              v-if="segment.media.type === 'video'"
              controls
              class="media-player video-player"
              :src="segment.media.url"
            >
              您的浏览器不支持视频播放
            </video>
            <!-- Audio -->
            <audio
              v-else-if="segment.media.type === 'audio'"
              controls
              class="media-player audio-player"
              :src="segment.media.url"
            >
              您的浏览器不支持音频播放
            </audio>
            <!-- Image - use markdown for images -->
            <MarkdownRenderer
              v-else
              class="text-content"
              :content="`![${segment.media.name}](${segment.media.url})`"
            />
          </div>
          <!-- Text segment -->
          <MarkdownRenderer
            v-else-if="segment.type === 'text' && segment.content"
            class="text-content"
            :content="segment.content"
          />
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.content-blocks {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

/* Thinking block styles */
.thinking-block {
  background: linear-gradient(135deg, #fef7ed 0%, #fff7f0 100%);
  border: 1px solid #f5e6d8;
  border-radius: 8px;
  max-height: 150px;
  display: flex;
  flex-direction: column;
  font-size: 0.75rem;
  color: #8b6914;
  overflow: hidden;
}

.thinking-block.collapsed {
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

.thinking-block.collapsed .thinking-header {
  border-bottom: none;
}

.thinking-icon {
  font-size: 0.85rem;
}

.thinking-title {
  font-weight: 500;
}

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
  max-height: 120px;
}

/* Media styles */
.media-container {
  width: 100%;
  margin: 8px 0;
}

.media-player {
  max-width: 100%;
  border-radius: 8px;
  background: #000;
}

.video-player {
  width: 100%;
  max-height: 400px;
}

.audio-player {
  width: 100%;
  height: 40px;
}

.text-content {
  display: block;
  line-height: 1.6;
  width: 100%;
}

/* Markdown styles */
.text-content :deep(pre) {
  background: #1e1e1e;
  color: #f5f5f5;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
}

.text-content :deep(code) {
  font-family: var(--mono);
}

.text-content :deep(code:not(pre code)) {
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
}

.text-content :deep(h1) {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 16px 0 8px 0;
  border-bottom: 1px solid var(--border);
  padding-bottom: 4px;
}

.text-content :deep(h2) {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 14px 0 7px 0;
  border-bottom: 1px solid var(--border);
  padding-bottom: 3px;
}

.text-content :deep(h3) {
  font-size: 1.3rem;
  font-weight: 600;
  margin: 12px 0 6px 0;
}

.text-content :deep(h4) {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 10px 0 5px 0;
}

.text-content :deep(ul),
.text-content :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.text-content :deep(li) {
  margin: 4px 0;
}

.text-content :deep(strong) {
  font-weight: 600;
}

.text-content :deep(a) {
  color: var(--accent);
  text-decoration: none;
}

.text-content :deep(a:hover) {
  text-decoration: underline;
}
</style>