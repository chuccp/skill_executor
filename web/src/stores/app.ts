import { reactive, computed } from 'vue'
import type { Conversation, Message, Skill, Preset, Workdir } from '../types'
import { api } from '../services/api'

const state = reactive({
  currentConversationId: null as string | null,
  conversations: [] as Conversation[],
  messages: [] as Message[],
  skills: [] as Skill[],
  presets: [] as Preset[],
  workdir: { path: '', items: [] } as Workdir,
  isStreaming: false,
  selectedModel: localStorage.getItem('selectedModel') || '',
  selectedSkill: '',
  streamStatus: '',
  thinkingContent: '',
  abortController: null as AbortController | null,

  // Modal states
  showConfigModal: false,
  showSkillModal: false,
  showConversationModal: false,
  configFormStep: 1,
  editingPreset: null as Preset | null,
  selectedTemplate: '',
  selectedProvider: null as { id: string; name: string; baseUrl: string; models: string[] } | null,
  selectedSkillDetail: null as Skill | null
})

// Status messages for streaming
const statusMessages = [
  '思考中...',
  '让子弹飞一会儿...',
  '脑细胞正在努力...',
  '正在召唤AI之力...',
  '码字中...',
  '正在搬运知识...',
  '灵感加载中...',
  '正在施展魔法...',
  '冥想中...',
  '正在调取记忆...',
  '大脑飞速运转...',
  '正在编织答案...'
]

let statusTimer: number | null = null
let lastStatusIndex = -1

function randomStatusMessage() {
  let index
  do {
    index = Math.floor(Math.random() * statusMessages.length)
  } while (index === lastStatusIndex && statusMessages.length > 1)
  lastStatusIndex = index
  state.streamStatus = statusMessages[index]
}

// Actions
export const actions = {
  async loadPresets() {
    state.presets = await api.getPresets()
    if (state.presets.length > 0 && !state.selectedModel) {
      state.selectedModel = state.presets[0].name
    }
  },

  async loadConversations() {
    state.conversations = await api.getConversations()
  },

  async loadSkills() {
    state.skills = await api.getSkills()
  },

  async loadWorkdir() {
    const data = await api.getWorkdir()
    if (data.path) {
      state.workdir = data
    }
  },

  async setWorkdir(path: string) {
    const data = await api.setWorkdir(path)
    state.workdir = data
  },

  async listWorkdir(path: string) {
    const data = await api.listWorkdir(path)
    state.workdir = data
  },

  async createConversation() {
    const conv = await api.createConversation()
    if (conv) {
      state.conversations.unshift(conv)
      await this.selectConversation(conv.id)
    }
  },

  async selectConversation(id: string) {
    state.currentConversationId = id
    localStorage.setItem('lastConversationId', id)
    state.messages = await api.getConversation(id)
  },

  async deleteConversation(id: string) {
    if (!confirm('确定要删除这个会话吗？')) return
    const success = await api.deleteConversation(id)
    if (success) {
      state.conversations = state.conversations.filter(c => c.id !== id)
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
    await api.reloadSkills()
    await this.loadSkills()
  },

  startStream() {
    state.isStreaming = true
    state.thinkingContent = ''
    state.abortController = new AbortController()
    randomStatusMessage()
    statusTimer = window.setInterval(randomStatusMessage, 2000)
  },

  stopStream() {
    if (state.abortController) {
      state.abortController.abort()
      state.abortController = null
    }
    state.isStreaming = false
    if (statusTimer) {
      clearInterval(statusTimer)
      statusTimer = null
    }
  },

  finishStream() {
    state.isStreaming = false
    state.abortController = null
    if (statusTimer) {
      clearInterval(statusTimer)
      statusTimer = null
    }
  },

  addMessage(role: 'user' | 'assistant', content: string) {
    state.messages.push({ role, content })
  },

  appendStreamText(text: string) {
    const lastMsg = state.messages[state.messages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      lastMsg.content += text
    }
  },

  appendThinking(text: string) {
    state.thinkingContent += text
  },

  setStreamStatus(status: string) {
    state.streamStatus = status
  }
}

// Computed
export const currentConversation = computed(() =>
  state.conversations.find(c => c.id === state.currentConversationId)
)

export const currentPreset = computed(() =>
  state.presets.find(p => p.name === state.selectedModel)
)

export { state }

export function useStore() {
  return { state, actions, currentConversation, currentPreset }
}