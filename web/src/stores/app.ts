// app.ts - 兼容性封装，推荐使用新的模块化 store
// 新代码请使用：
//   import { useConversationsStore } from './conversations'
//   import { useConfigStore } from './config'

import { reactive, computed } from 'vue'
import type { Conversation, Message, Skill, Preset } from '../types'
import { api } from '../services/api'
import { wsService } from '../services/websocket'

// 导入新的模块化 store
import { useConversationsStore } from './conversations'
import { useConfigStore } from './config'

const conversationsStore = useConversationsStore()
const configStore = useConfigStore()

// 兼容性：旧的状态对象（逐步迁移到新 store）
const state = reactive({
  currentConversationId: null as string | null,
  conversations: [] as Conversation[],
  messages: [] as Message[],
  skills: [] as Skill[],
  presets: [] as Preset[],
  isStreaming: false,
  selectedModel: localStorage.getItem('selectedModel') || '',
  selectedSkill: localStorage.getItem('selectedSkill') || '',
  streamStatus: '',
  abortController: null as AbortController | null,

  // 流式状态（已迁移到 conversationsStore）
  thinkingContent: '',
  currentToolResults: [] as any[],
  todos: [] as any[],
  progressText: '',
  streamingBlocks: [] as Array<{type: 'thinking' | 'text', content: string}>,

  // Ask user 状态（已迁移到 configStore）
  askQuestion: '',
  askOptions: [] as any[],
  askId: '',

  // Modal states（已迁移到 configStore）
  showConfigModal: false,
  showSkillModal: false,
  showConversationModal: false,
  selectedSkillDetail: null as Skill | null
})

// 同步新 store 的状态到旧 state（兼容性）
function syncState() {
  state.currentConversationId = conversationsStore.currentConversationId
  state.messages = conversationsStore.currentMessages
  state.skills = configStore.state.skills
  state.presets = configStore.state.presets
  state.selectedModel = configStore.state.selectedModel
  state.selectedSkill = configStore.state.selectedSkill
  state.showConfigModal = configStore.state.showConfigModal
  state.showSkillModal = configStore.state.showSkillModal
  state.showConversationModal = configStore.state.showConversationModal
  state.selectedSkillDetail = configStore.state.selectedSkillDetail
  state.askQuestion = configStore.state.askQuestion
  state.askOptions = configStore.state.askOptions
  state.askId = configStore.state.askId

  const streaming = conversationsStore.currentStreaming
  if (streaming) {
    state.isStreaming = streaming.isStreaming
    state.thinkingContent = streaming.thinkingContent
    state.streamingBlocks = streaming.streamingBlocks
    state.currentToolResults = streaming.toolResults
    state.todos = streaming.todos
    state.progressText = streaming.progressText
  }
}

// Actions - 包装新 store 的方法
export const actions = {
  async initWebSocket() {
    await wsService.connect()
      .then(() => console.log('[Store] WebSocket 已连接'))
      .catch((error) => console.error('[Store] WebSocket 连接失败:', error))
  },

  async disconnectWebSocket() {
    wsService.disconnect()
  },

  async loadPresets() {
    await configStore.actions.loadPresets()
    syncState()
  },

  async loadConversations() {
    state.conversations = await api.getConversations()
  },

  async loadSkills() {
    await configStore.actions.loadSkills()
    syncState()
  },

  async createConversation() {
    const conv = await api.createConversation()
    if (conv) {
      state.conversations.unshift(conv)
      await this.selectConversation(conv.id)
    }
  },

  async selectConversation(id: string, moveToTop: boolean = false) {
    // 停止当前流式
    if (state.isStreaming) {
      this.stopStream()
    }

    // 使用新 store 的方法
    await conversationsStore.actions.setCurrentConversation(id)

    // 移动会话到列表顶部
    if (moveToTop) {
      const index = state.conversations.findIndex(c => c.id === id)
      if (index > 0) {
        const conv = state.conversations.splice(index, 1)[0]
        state.conversations.unshift(conv)
      }
    }

    syncState()
  },

  async deleteConversation(id: string) {
    const confirmed = await window.confirm('确定要删除这个会话吗？')
    if (!confirmed) return

    const success = await api.deleteConversation(id)
    if (success) {
      state.conversations = state.conversations.filter(c => c.id !== id)
      conversationsStore.actions.removeState(id)

      if (state.currentConversationId === id) {
        if (state.conversations.length > 0) {
          await this.selectConversation(state.conversations[0].id)
        } else {
          await this.createConversation()
        }
      }
    }
  },

  async reloadSkills() {
    await configStore.actions.reloadSkills()
    ;(window as any).showInfo?.('已刷新技能')
    syncState()
  },

  startStream() {
    conversationsStore.actions.startStream()
    syncState()
  },

  stopStream() {
    conversationsStore.actions.stopStream()
    syncState()
  },

  finishStream() {
    conversationsStore.actions.finishStream()
    syncState()
  },

  addMessage(role: 'user' | 'assistant', content: string) {
    conversationsStore.actions.addMessage(role, content)
    syncState()
  },

  appendStreamText(text: string) {
    conversationsStore.actions.appendStreamText(text)
    syncState()
  },

  appendThinking(text: string) {
    conversationsStore.actions.appendThinking(text)
    syncState()
  },

  setStreamStatus(status: string) {
    state.streamStatus = status
  },

  addToolResult(result: any) {
    conversationsStore.actions.addToolResult(result)
    syncState()
  },

  setTodos(todos: any[]) {
    conversationsStore.actions.setTodos(todos)
    syncState()
  },

  setProgress(text: string) {
    conversationsStore.actions.setProgress(text)
    syncState()
  }
}

// Computed
export const currentConversation = computed(() =>
  state.conversations.find(c => c.id === state.currentConversationId)
)

export const currentPreset = computed(() =>
  configStore.currentPreset
)

export { state }

export function useStore() {
  return { state, actions, currentConversation, currentPreset }
}
