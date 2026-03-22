<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps<{
  content: string
}>()

const containerRef = ref<HTMLElement | null>(null)

// 自定义渲染器 - 为代码块添加语言类名
const renderer = new marked.Renderer()
renderer.code = function({ text, lang }: { text: string; lang?: string }) {
  const langClass = lang ? `language-${lang}` : ''
  const langLabel = lang === 'bash' ? '<div class="code-lang-label">bash</div>' : ''
  return `<pre class="${langClass}"><code>${escapeHtml(text)}</code>${langLabel}</pre>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
  renderer
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
    ADD_ATTR: ['controls', 'src', 'allow', 'allowfullscreen', 'class', 'style']
  })
})

// 内容变化时滚动代码块到底部
watch(() => props.content, () => {
  nextTick(() => {
    if (containerRef.value) {
      const preBlocks = containerRef.value.querySelectorAll('pre')
      preBlocks.forEach((pre) => {
        pre.scrollTop = pre.scrollHeight
      })
    }
  })
})
</script>

<template>
  <div class="markdown-content" ref="containerRef" v-html="htmlContent"></div>
</template>

<style>
.markdown-content {
  line-height: 1.6;
  width: 100%;
}

.markdown-content pre {
  background: #1e1e1e;
  color: #f5f5f5;
  padding: 12px;
  border-radius: 6px;
  overflow: auto;
  margin: 8px 0;
  max-height: 300px;
  position: relative;
}

.markdown-content pre.language-bash {
  background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
  border-left: 3px solid #48bb78;
}

.markdown-content pre.language-bash code {
  color: #68d391;
}

.markdown-content .code-lang-label {
  position: absolute;
  top: 4px;
  right: 8px;
  font-size: 0.7rem;
  color: #718096;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.markdown-content pre code {
  display: block;
  white-space: pre;
}

.markdown-content code {
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 0.9em;
}

.markdown-content code:not(pre code) {
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
}

.markdown-content h1 {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 16px 0 8px 0;
  border-bottom: 1px solid #e5e5e5;
  padding-bottom: 4px;
}

.markdown-content h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 14px 0 7px 0;
  border-bottom: 1px solid #e5e5e5;
  padding-bottom: 3px;
}

.markdown-content h3 {
  font-size: 1.3rem;
  font-weight: 600;
  margin: 12px 0 6px 0;
}

.markdown-content h4 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 10px 0 5px 0;
}

.markdown-content p {
  margin: 8px 0;
}

.markdown-content ul,
.markdown-content ol {
  margin: 8px 0;
  padding-left: 24px;
}

.markdown-content li {
  margin: 4px 0;
}

.markdown-content strong {
  font-weight: 600;
}

.markdown-content a {
  color: #0f766e;
  text-decoration: none;
}

.markdown-content a:hover {
  text-decoration: underline;
}

.markdown-content blockquote {
  border-left: 4px solid #e5e5e5;
  padding-left: 12px;
  margin: 8px 0;
  color: #666;
}

.markdown-content table {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
}

.markdown-content th,
.markdown-content td {
  border: 1px solid #e5e5e5;
  padding: 8px;
  text-align: left;
}

.markdown-content video {
  max-width: 100%;
  border-radius: 8px;
  background: #000;
}

.markdown-content audio {
  width: 100%;
  margin: 8px 0;
}

.markdown-content img {
  max-width: 100%;
  border-radius: 8px;
}
</style>