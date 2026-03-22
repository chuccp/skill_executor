<script setup lang="ts">
import type { ToolResultDisplay } from '../../types'
import BashResult from './BashResult.vue'

const props = defineProps<{
  results: ToolResultDisplay[]
  isStreaming?: boolean
}>()
</script>

<template>
  <div v-if="results.length" class="tool-results">
    <!-- 显示已完成的工具结果 -->
    <div v-for="(result, idx) in results" :key="idx">
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
          <div v-if="result.data.files.length > 10" class="sr-more">
            + 还有 {{ result.data.files.length - 10 }} 个
          </div>
        </div>
      </div>

      <!-- Search result -->
      <div v-else-if="result.type === 'search'" class="search-result">
        <div class="sr-title">🔍 {{ result.data.query }}</div>
        <div class="sr-items">
          <div v-for="item in result.data.files.slice(0, 5)" :key="item" class="sr-item">
            {{ item.split(/[\\/]/).pop() }}
          </div>
          <div v-if="result.data.total > 5" class="sr-more">+ 共 {{ result.data.total }} 个结果</div>
        </div>
      </div>

      <!-- Write result -->
      <div v-else-if="result.type === 'write'" class="write-result">
        ✅ 已写入: <code>{{ result.data.path.split(/[\\/]/).pop() }}</code>
      </div>

      <!-- Bash result (completed) -->
      <BashResult
        v-else-if="result.type === 'bash'"
        :command="result.data.command"
        :output="result.data.output"
        :success="true"
        :is-streaming="false"
      />
    </div>
  </div>
</template>

<style scoped>
.tool-results {
  margin-top: 10px;
  margin-bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-preview {
  background: #f8f6f2;
  border-radius: 6px;
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

.files-result,
.search-result {
  background: #f8f6f2;
  border-radius: 6px;
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
  background: rgba(255, 255, 255, 0.5);
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
  border-radius: 6px;
  font-size: 0.85rem;
}

.write-result code {
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
}
</style>