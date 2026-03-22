<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { WSServerMessage } from './types'
import Sidebar from './components/Sidebar.vue'
import ChatContainer from './components/ChatContainer.vue'
import InputArea from './components/InputArea.vue'
import ConfigModal from './components/ConfigModal.vue'
import SkillModal from './components/SkillModal.vue'
import NotifyContainer from './components/NotifyContainer.vue'
import { useConversationsStore } from './stores/conversations'
import { useConfigStore } from './stores/config'
import { wsService } from './services/websocket'
import { api } from './services/api'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

const conversationsStore = useConversationsStore()
const configStore = useConfigStore()
let unlistenFileDrop: UnlistenFn | null = null

// === WebSocket 事件处理集中在 App.vue ===

// 处理文本增量（流式输出）
function handleText(data: WSServerMessage) {
  conversationsStore.actions.appendStreamText(data.content || '')
}

// 处理 thinking 增量
function handleThinking(data: WSServerMessage) {
  if (data.content) {
    conversationsStore.actions.appendThinking(data.content)
  }
}

// 处理工具调用开始
function handleToolUse(data: WSServerMessage) {
  if (data.content) {
    conversationsStore.actions.setProgress(data.content)
  }
}

// 处理工具结果
function handleToolResult(msg: WSServerMessage) {
  if (msg.data && msg.data.display) {
    conversationsStore.actions.addToolResult(msg.data.display)
  }
}

// 处理命令确认请求
function handleCommandConfirm(data: WSServerMessage) {
  // 这个事件保持现状，由 UI 处理
  if (data.confirmId && data.command) {
    // Store the confirm request somewhere if needed
    // For now, just let the existing UI handle it through events
  }
}

// 处理询问用户请求
function handleAskUser(data: WSServerMessage) {
  if (data.askId && data.question !== undefined) {
    configStore.actions.setAskUser(data.question, data.options || [], data.askId)
  }
}

// 处理完成事件
function handleDone(_data: WSServerMessage) {
  conversationsStore.actions.finishStream()
}

// 处理错误
function handleError(data: WSServerMessage) {
  console.error('[WebSocket] Server error:', data.content)
  conversationsStore.actions.stopStream()
}

// 注册所有 WebSocket 事件处理器
function registerEventHandlers() {
  wsService.on('text', handleText)
  wsService.on('thinking', handleThinking)
  wsService.on('tool_use', handleToolUse)
  wsService.on('tool_result', handleToolResult)
  wsService.on('command_confirm', handleCommandConfirm)
  wsService.on('ask_user', handleAskUser)
  wsService.on('done', handleDone)
  wsService.on('error', handleError)
}

// 移除所有 WebSocket 事件处理器
function unregisterEventHandlers() {
  wsService.off('text', handleText)
  wsService.off('thinking', handleThinking)
  wsService.off('tool_use', handleToolUse)
  wsService.off('tool_result', handleToolResult)
  wsService.off('command_confirm', handleCommandConfirm)
  wsService.off('ask_user', handleAskUser)
  wsService.off('done', handleDone)
  wsService.off('error', handleError)
}

onMounted(async () => {
  // 连接 WebSocket
  try {
    await wsService.connect()
    registerEventHandlers()
  } catch (error) {
    console.error('[App] Failed to connect WebSocket:', error)
  }

  // 加载数据
  await Promise.all([
    configStore.actions.loadPresets(),
    configStore.actions.loadSkills()
  ])

  const convs = await api.getConversations()

  const lastId = localStorage.getItem('lastConversationId')
  if (lastId) {
    const convExists = await api.getConversation(lastId).catch(() => null)
    if (convExists) {
      await conversationsStore.actions.setCurrentConversation(lastId)
    } else if (convs.length > 0) {
      await conversationsStore.actions.setCurrentConversation(convs[0].id)
    }
  } else if (convs.length > 0) {
    await conversationsStore.actions.setCurrentConversation(convs[0].id)
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
  unregisterEventHandlers()
  wsService.disconnect()
})
</script>

<template>
  <div class="app">
    <Sidebar />
    <main class="main">
      <ChatContainer />
      <InputArea />
    </main>
    <ConfigModal v-if="configStore.state.showConfigModal" />
    <SkillModal v-if="configStore.state.showSkillModal" />
    <NotifyContainer />
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
@import './styles/variables.css';
@import './styles/mixins.css';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
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
</style>