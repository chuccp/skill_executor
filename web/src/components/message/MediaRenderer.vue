<script setup lang="ts">
import type { ToolResultDisplay } from '../../types'

const props = defineProps<{
  results: Array<ToolResultDisplay & { _stableId?: string }>
}>()

async function exportMedia(url: string, filename: string) {
  try {
    const response = await fetch(url)
    const blob = await response.blob()

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
    window.open(url, '_blank')
  }
}
</script>

<template>
  <div v-if="results.length > 0" class="media-results-inline">
    <div v-for="result in results" :key="result._stableId || result.data?.url">
      <!-- Image -->
      <div v-if="result.data?.type === 'image'">
        <div class="media-header">
          <span class="media-label">🖼️ {{ result.data.name }}</span>
          <button class="btn btn-small" @click="exportMedia(result.data.url, result.data.name)">
            导出
          </button>
        </div>
        <img
          :src="result.data.url"
          class="media-thumb"
          alt="image"
        />
      </div>

      <!-- Audio -->
      <div v-else-if="result.data?.type === 'audio'">
        <div class="media-header">
          <span class="media-label">🎵 {{ result.data.name }}</span>
          <button class="btn btn-small" @click="exportMedia(result.data.url, result.data.name)">
            导出
          </button>
        </div>
        <audio controls :src="result.data.url" />
      </div>

      <!-- Video -->
      <div v-else-if="result.data?.type === 'video'">
        <div class="media-header">
          <span class="media-label">🎬 {{ result.data.name }}</span>
          <button class="btn btn-small" @click="exportMedia(result.data.url, result.data.name)">
            导出
          </button>
        </div>
        <video
          controls
          playsinline
          :src="result.data.url"
          class="media-video"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
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

.media-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 4px;
}

.media-label {
  font-size: 0.85rem;
  word-break: break-word;
}

.media-thumb {
  max-width: 100%;
  max-height: 200px;
  border-radius: 8px;
  cursor: pointer;
}

.media-video {
  width: 100%;
  max-width: 100%;
  max-height: 400px;
  border-radius: 8px;
  background: #000;
  outline: none;
}

audio {
  width: 100%;
  max-width: 100%;
}
</style>