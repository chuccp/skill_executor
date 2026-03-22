<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import type { ContentBlock } from '../../types'
import MarkdownRenderer from '../MarkdownRenderer.vue'

const props = defineProps<{
  blocks: ContentBlock[]
  isStreaming: boolean
}>()

// 代码块引用，用于自动滚动
const codeRefs = ref<Map<string, HTMLElement | null>>(new Map())

// 显示的块（text 和 code，thinking 由 MessageItem 单独处理）
const visibleBlocks = computed(() => {
  return props.blocks.filter(block => {
    if (block.type === 'text') {
      return block.content && block.content.trim()
    }
    if (block.type === 'code') {
      return block.code && block.code.trim()
    }
    return false
  })
})

// 流式输出时滚动代码块到底部
watch(() => props.blocks, () => {
  nextTick(() => {
    props.blocks.forEach(block => {
      if (block.type === 'code' && block.isStreaming) {
        const el = codeRefs.value.get(block.id)
        if (el) {
          el.scrollTop = el.scrollHeight
        }
      }
    })
  })
}, { deep: true })

// 设置代码块引用
const setCodeRef = (id: string, el: any) => {
  if (el) {
    codeRefs.value.set(id, el as HTMLElement)
  } else {
    codeRefs.value.delete(id)
  }
}
</script>

<template>
  <div class="content-blocks">
    <template v-for="block in visibleBlocks" :key="block.id">
      <!-- 文本块 -->
      <MarkdownRenderer
        v-if="block.type === 'text'"
        class="text-content"
        :content="block.content || ''"
      />

      <!-- 代码块 -->
      <div v-else-if="block.type === 'code'" class="code-block-wrapper">
        <div class="code-header" v-if="block.language">
          <span class="code-lang">{{ block.language }}</span>
        </div>
        <pre
          :ref="(el: any) => setCodeRef(block.id, el)"
          class="code-content"
          :class="[`language-${block.language || 'text'}`, { 'is-streaming': block.isStreaming }]"
        ><code>{{ block.code }}</code></pre>
      </div>
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

.text-content {
  display: block;
  line-height: 1.6;
  width: 100%;
}

.code-block-wrapper {
  width: 100%;
  margin: 8px 0;
  border-radius: 8px;
  overflow: hidden;
  background: #1e1e1e;
}

.code-header {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  background: #2d2d2d;
  border-bottom: 1px solid #3d3d3d;
}

.code-lang {
  font-size: 0.75rem;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.code-content {
  margin: 0;
  padding: 12px;
  overflow: auto;
  max-height: 400px;
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #f5f5f5;
  background: #1e1e1e;
}

.code-content.is-streaming {
  max-height: 300px;
}

.code-content.language-bash {
  background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
  border-left: 3px solid #48bb78;
}

.code-content.language-bash code {
  color: #68d391;
}

.code-content code {
  display: block;
  white-space: pre;
}
</style>