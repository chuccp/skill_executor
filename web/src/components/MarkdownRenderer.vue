<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps<{
  content: string
}>()

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true
})

// 渲染 markdown
const htmlContent = computed(() => {
  if (!props.content) return ''

  // 处理媒体语法：![video: name](url), ![audio: name](url)
  let processed = props.content
    .replace(/!\[video:\s*([^\]]*)\]\(([^)]+)\)/g, '<video controls src="$2" style="max-width:100%;border-radius:8px;"></video>')
    .replace(/!\[audio:\s*([^\]]*)\]\(([^)]+)\)/g, '<audio controls src="$2" style="width:100%;"></audio>')

  // 解析 markdown
  const html = marked.parse(processed) as string

  // 清理 XSS
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['video', 'audio', 'iframe'],
    ADD_ATTR: ['controls', 'src', 'allow', 'allowfullscreen']
  })
})
</script>

<template>
  <div class="markdown-content" v-html="htmlContent"></div>
</template>

<style>
.markdown-content {
  line-height: 1.6;
  width: 100%;
}

.markdown-content :deep(pre) {
  background: #1e1e1e;
  color: #f5f5f5;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
}

.markdown-content :deep(code) {
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 0.9em;
}

.markdown-content :deep(code:not(pre code)) {
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
}

.markdown-content :deep(h1) {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 16px 0 8px 0;
  border-bottom: 1px solid #e5e5e5;
  padding-bottom: 4px;
}

.markdown-content :deep(h2) {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 14px 0 7px 0;
  border-bottom: 1px solid #e5e5e5;
  padding-bottom: 3px;
}

.markdown-content :deep(h3) {
  font-size: 1.3rem;
  font-weight: 600;
  margin: 12px 0 6px 0;
}

.markdown-content :deep(h4) {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 10px 0 5px 0;
}

.markdown-content :deep(p) {
  margin: 8px 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.markdown-content :deep(li) {
  margin: 4px 0;
}

.markdown-content :deep(strong) {
  font-weight: 600;
}

.markdown-content :deep(a) {
  color: #0f766e;
  text-decoration: none;
}

.markdown-content :deep(a:hover) {
  text-decoration: underline;
}

.markdown-content :deep(blockquote) {
  border-left: 4px solid #e5e5e5;
  padding-left: 12px;
  margin: 8px 0;
  color: #666;
}

.markdown-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid #e5e5e5;
  padding: 8px;
  text-align: left;
}

.markdown-content :deep(video) {
  max-width: 100%;
  border-radius: 8px;
  background: #000;
}

.markdown-content :deep(audio) {
  width: 100%;
  margin: 8px 0;
}

.markdown-content :deep(img) {
  max-width: 100%;
  border-radius: 8px;
}
</style>