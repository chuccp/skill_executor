<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import Sidebar from './components/Sidebar.vue'
import ChatContainer from './components/ChatContainer.vue'
import InputArea from './components/InputArea.vue'
import ConfigModal from './components/ConfigModal.vue'
import SkillModal from './components/SkillModal.vue'
import NotifyContainer from './components/NotifyContainer.vue'
import { useStore } from './stores/app'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

const { state, actions } = useStore()
let unlistenFileDrop: UnlistenFn | null = null

onMounted(async () => {
  // 初始化 WebSocket（不阻塞其他加载）
  actions.initWebSocket().catch(console.error)

  await Promise.all([
    actions.loadPresets(),
    actions.loadConversations(),
    actions.loadSkills()
  ])

  const lastId = localStorage.getItem('lastConversationId')
  if (lastId && state.conversations.find(c => c.id === lastId)) {
    await actions.selectConversation(lastId)
  } else if (state.conversations.length > 0) {
    await actions.selectConversation(state.conversations[0].id)
  } else {
    await actions.createConversation()
  }

  // 监听 Tauri 文件拖放事件
  unlistenFileDrop = await listen<string[]>('file-drop', (event) => {
    const paths = event.payload
    if (paths && paths.length > 0) {
      const input = document.querySelector('#user-input') as HTMLTextAreaElement
      if (input) {
        // 添加 @ 前缀，多个文件用空格分隔
        const pathRefs = paths.map(p => '@' + p).join(' ')
        const currentValue = input.value.trim()
        input.value = currentValue ? currentValue + ' ' + pathRefs : pathRefs
        // 触发 input 事件以更新高度
        input.dispatchEvent(new Event('input', { bubbles: true }))
        // 聚焦输入框
        input.focus()
      }
    }
  })

  // 同时保留 DOM 拖放事件（用于非 Tauri 环境）
  document.addEventListener('dragover', (e) => e.preventDefault())
  document.addEventListener('drop', (e) => {
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (files?.length) {
      const paths: string[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        // @ts-ignore
        if (file.path) paths.push((file as any).path)
      }
      if (paths.length) {
        const input = document.querySelector('#user-input') as HTMLTextAreaElement
        if (input) {
          const pathRefs = paths.map(p => '@' + p).join(' ')
          const currentValue = input.value.trim()
          input.value = currentValue ? currentValue + ' ' + pathRefs : pathRefs
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.focus()
        }
      }
    }
  })
})

onUnmounted(() => {
  if (unlistenFileDrop) {
    unlistenFileDrop()
  }
  // 断开 WebSocket 连接
  actions.disconnectWebSocket()
})
</script>

<template>
  <div class="app">
    <Sidebar />
    <main class="main">
      <ChatContainer />
      <InputArea />
    </main>
    <ConfigModal v-if="state.showConfigModal" />
    <SkillModal v-if="state.showSkillModal" />
    <NotifyContainer />
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --bg: #f6f3ee;
  --panel: #ffffff;
  --text: #161616;
  --muted: #6f6a63;
  --border: #e6e0d6;
  --accent: #0f766e;
  --accent-strong: #0b5f59;
  --accent-weak: #e6f4f1;
  --radius-lg: 16px;
  --radius-md: 12px;
  --radius-sm: 8px;
  --shadow: 0 12px 28px rgba(19, 24, 28, 0.08);
  --mono: 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace;
  --sans: 'IBM Plex Sans', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

body {
  font-family: var(--sans);
  background: radial-gradient(1200px 800px at 10% -10%, #fff7eb 0%, transparent 60%),
    radial-gradient(900px 600px at 95% 10%, #e9f5f3 0%, transparent 55%),
    var(--bg);
  color: var(--text);
  height: 100vh;
  overflow: hidden;
}

.app {
  display: flex;
  height: 100vh;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;
}

/* Buttons */
.btn {
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.btn:hover {
  background: #f5f2ec;
  border-color: #d4cfc5;
}

.btn-primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.btn-primary:hover {
  background: var(--accent-strong);
}

.btn-icon {
  padding: 6px 10px;
  background: transparent;
  border: 1px solid var(--border);
}

.btn-small {
  padding: 4px 8px;
  font-size: 0.75rem;
}

/* Form elements */
select, input, textarea {
  font-family: inherit;
  font-size: 0.9rem;
}

.full-select {
  width: 100%;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--panel);
}

/* Animations */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideIn {
  from { opacity: 0; transform: translateX(-10px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* Code block */
.code-block {
  background: #11120f;
  color: #f5f1ea;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  overflow-x: auto;
  margin: 8px 0;
  font-size: 0.85rem;
  font-family: var(--mono);
}

.code-block code {
  font-family: inherit;
}

.inline-code {
  background: rgba(0,0,0,0.06);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--mono);
  font-size: 0.9em;
}

/* Notify */
.notify {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 12px 20px;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  z-index: 2000;
  animation: slideIn 0.2s ease;
}

.notify-info {
  background: var(--accent-weak);
  color: var(--accent);
  border: 1px solid var(--accent);
}

.notify-error {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}
</style>