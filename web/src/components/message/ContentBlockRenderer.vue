<script setup lang="ts">
import { computed } from 'vue'
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

// Filter blocks to show (只显示 text，thinking 由 MessageItem 单独处理)
const visibleBlocks = computed(() => {
  return props.blocks.filter(block => {
    if (block.type === 'text') {
      return block.content && block.content.trim()
    }
    return false
  })
})

// Parse each text block into segments
const parsedBlocks = computed(() => {
  return visibleBlocks.value.map(block => {
    return {
      block,
      segments: parseMediaContent(block.content || '').segments
    }
  })
})
</script>

<template>
  <div class="content-blocks">
    <template v-for="parsed in parsedBlocks" :key="parsed.block.id">
      <!-- Text block with media support -->
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
          <!-- Image -->
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
  </div>
</template>

<style scoped>
.content-blocks {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

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
</style>