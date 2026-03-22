<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import Sidebar from './components/Sidebar.vue'
import ChatContainer from './components/ChatContainer.vue'
import InputArea from './components/InputArea.vue'
import ConfigModal from './components/ConfigModal.vue'
import SkillModal from './components/SkillModal.vue'
import NotifyContainer from './components/NotifyContainer.vue'
import { useConversationsStore } from './stores/conversations'
import { useConfigStore } from './stores/config'
import { useWebSocketHandler } from './composables'
import { wsService } from './services/websocket'
import { api } from './services/api'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

const conversationsStore = useConversationsStore()
const configStore = useConfigStore()
const { registerHandlers, unregisterHandlers } = useWebSocketHandler()

let unlistenFileDrop: UnlistenFn | null = null

onMounted(async () => {
  // Connect WebSocket
  try {
    await wsService.connect()
    registerHandlers()
  } catch (error) {
    console.error('[App] Failed to connect WebSocket:', error)
  }

  // Load data
  await Promise.all([configStore.actions.loadPresets(), configStore.actions.loadSkills()])

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

  // Tauri file drop
  unlistenFileDrop = await listen<string[]>('file-drop', (event) => {
    const paths = event.payload
    if (paths && paths.length > 0) {
      const input = document.querySelector('#user-input') as HTMLTextAreaElement
      if (input) {
        const pathRefs = paths.map((p) => '@' + p).join(' ')
        const currentValue = input.value.trim()
        input.value = currentValue ? currentValue + ' ' + pathRefs : pathRefs
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.focus()
      }
    }
  })

  // DOM drop (for non-Tauri)
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
          const pathRefs = paths.map((p) => '@' + p).join(' ')
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
  unregisterHandlers()
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
    radial-gradient(900px 600px at 95% 10%, #e9f5f3 0%, transparent 55%), var(--bg);
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