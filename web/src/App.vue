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

const conversationsStore = useConversationsStore()
const configStore = useConfigStore()
const { registerHandlers, unregisterHandlers } = useWebSocketHandler()

onMounted(() => {
  console.log('[App] onMounted start')

  // WebSocket 连接
  wsService.connect().then(() => {
    registerHandlers()
    console.log('[App] WebSocket connected')
  }).catch(console.error)

  // 加载数据
  configStore.actions.loadPresets().catch(console.error)
  configStore.actions.loadSkills().catch(console.error)
  api.getConversations().then(async (convs) => {
    const lastId = localStorage.getItem('lastConversationId')
    if (lastId) {
      const convExists = await api.getConversation(lastId).catch(() => null)
      if (convExists) {
        await conversationsStore.actions.setCurrentConversation(lastId)
        return
      }
    }
    if (convs.length > 0) {
      await conversationsStore.actions.setCurrentConversation(convs[0].id)
    }
  }).catch(console.error)
})

onUnmounted(() => {
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
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: radial-gradient(1200px 800px at 10% -10%, #fff7eb 0%, transparent 60%),
    radial-gradient(900px 600px at 95% 10%, #e9f5f3 0%, transparent 55%), #faf9f6;
  color: #333;
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