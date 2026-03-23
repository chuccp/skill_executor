<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { exportMedia, isTauri } from '../services/tauri'

const props = defineProps<{
  content: string
}>()

const containerRef = ref<HTMLElement | null>(null)
const exportStatus = ref<string | null>(null)

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

// 导出媒体文件
async function handleExport(url: string, name: string) {
  if (!isTauri()) {
    // 浏览器环境直接下载
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    return
  }

  exportStatus.value = '导出中...'
  const result = await exportMedia(url, name)
  if (result.success) {
    exportStatus.value = '导出成功'
    setTimeout(() => { exportStatus.value = null }, 2000)
  } else {
    exportStatus.value = result.error || '导出失败'
    setTimeout(() => { exportStatus.value = null }, 3000)
  }
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
    .replace(/!\[video:\s*([^\]]*)\]\(([^)]+)\)/g, (_match, name, url) => {
      return `<div class="media-container video-container" data-media-url="${url}" data-media-name="${name || 'video'}.mp4"><video controls src="${url}" style="max-width:100%;border-radius:8px;"></video><button class="media-export-btn" title="导出">⬇</button></div>`
    })
    .replace(/!\[audio:\s*([^\]]*)\]\(([^)]+)\)/g, (_match, name, url) => {
      return `<div class="media-container audio-container" data-media-url="${url}" data-media-name="${name || 'audio'}.mp3"><audio controls src="${url}" style="width:100%;"></audio><button class="media-export-btn" title="导出">⬇</button></div>`
    })

  // 解析 markdown
  const html = marked.parse(processed) as string

  // 清理 XSS
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['video', 'audio', 'iframe', 'button'],
    ADD_ATTR: ['controls', 'src', 'allow', 'allowfullscreen', 'class', 'style', 'title', 'data-media-url', 'data-media-name']
  })
})

// 为导出按钮添加点击事件和滚动代码块
watch(() => props.content, () => {
  nextTick(() => {
    if (containerRef.value) {
      // 代码块滚动
      const preBlocks = containerRef.value.querySelectorAll('pre')
      preBlocks.forEach((pre) => {
        pre.scrollTop = pre.scrollHeight
      })

      // 导出按钮点击
      const exportBtns = containerRef.value.querySelectorAll('.media-export-btn')
      exportBtns.forEach((btn) => {
        btn.removeEventListener('click', handleExportClick)
        btn.addEventListener('click', handleExportClick)
      })
    }
  })
}, { immediate: true })

function handleExportClick(e: Event) {
  const btn = e.currentTarget as HTMLElement
  const container = btn.closest('.media-container') as HTMLElement
  if (container) {
    const url = container.dataset.mediaUrl || ''
    const name = container.dataset.mediaName || 'media'
    handleExport(url, name)
  }
}
</script>

<template>
  <div class="markdown-wrapper">
    <div class="markdown-content" ref="containerRef" v-html="htmlContent"></div>
    <div v-if="exportStatus" class="export-status">{{ exportStatus }}</div>
  </div>
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

/* Media container styles */
.markdown-content .media-container {
  position: relative;
  display: inline-block;
  max-width: 100%;
}

.markdown-content .media-export-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.markdown-content .media-container:hover .media-export-btn {
  opacity: 1;
}

.markdown-content .media-export-btn:hover {
  background: rgba(0, 0, 0, 0.8);
}

.audio-container .media-export-btn {
  top: 50%;
  transform: translateY(-50%);
  right: 8px;
}

/* Export status */
.export-status {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.85rem;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

.markdown-wrapper {
  width: 100%;
}
</style>