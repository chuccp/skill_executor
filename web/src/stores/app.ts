import { reactive, computed } from 'vue'
import type { Conversation, Message, Skill, Preset } from '../types'
import { api } from '../services/api'
import { wsService } from '../services/websocket'

// Tool result type
interface ToolResultDisplay {
  type: 'file' | 'files' | 'search' | 'bash' | 'media' | 'write'
  data: any
}

// Todo item type
interface TodoItem {
  id?: string
  task: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  priority?: 'high' | 'medium' | 'low'
}

const state = reactive({
  currentConversationId: null as string | null,
  conversations: [] as Conversation[],
  messages: [] as Message[],
  skills: [] as Skill[],
  presets: [] as Preset[],
  isStreaming: false,
  selectedModel: localStorage.getItem('selectedModel') || '',
  selectedSkill: '',
  streamStatus: '',
  abortController: null as AbortController | null,

  // Current streaming state (cleared after each message)
  thinkingContent: '',
  currentToolResults: [] as ToolResultDisplay[],
  todos: [] as TodoItem[],
  progressText: '',

  // Modal states
  showConfigModal: false,
  showSkillModal: false,
  showConversationModal: false,
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

function sanitizeMessages(messages: Message[]): Message[] {
  let hasSummary = false
  const output: Message[] = []

  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : ''

    if (content.startsWith('[工具结果]')) continue
    if (content.startsWith('[相关记忆]')) continue

    if (content.startsWith('[历史对话摘要]')) {
      if (!hasSummary) {
        hasSummary = true
        output.push({ role: 'system', content: '已加载之前的对话记录' })
      }
      continue
    }

    output.push(msg)
  }

  return output
}

async function confirmDialog(message: string, title: string): Promise<boolean> {
  const tauriDialog = (window as any).__TAURI__?.dialog
  if (tauriDialog?.confirm) {
    try {
      return await tauriDialog.confirm(message, title)
    } catch (e) {
      // fallback below
    }
  }
  return window.confirm(message)
}

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
  async initWebSocket() {
    // 初始化 WebSocket 连接（不阻塞，失败也不影响其他功能）
    wsService.connect()
      .then(() => console.log('[Store] WebSocket 已连接'))
      .catch((error) => console.error('[Store] WebSocket 连接失败:', error))
  },

  async disconnectWebSocket() {
    wsService.disconnect()
    console.log('[Store] WebSocket 已断开')
  },

  async loadPresets() {
    state.presets = await api.getPresets()
    const savedModel = localStorage.getItem('selectedModel')
    if (savedModel && state.presets.find(p => p.name === savedModel)) {
      // 恢复上次选择的模型并应用到后端
      state.selectedModel = savedModel
      await api.usePreset(savedModel)
    } else if (state.presets.length > 0 && !state.selectedModel) {
      // 默认选第一个
      state.selectedModel = state.presets[0].name
      await api.usePreset(state.presets[0].name)
    }
  },

  async loadConversations() {
    state.conversations = await api.getConversations()
  },

  async loadSkills() {
    state.skills = await api.getSkills()
  },

  async createConversation() {
    const conv = await api.createConversation()
    if (conv) {
      state.conversations.unshift(conv)
      await this.selectConversation(conv.id)
    }
  },

  async selectConversation(id: string, moveToTop: boolean = false) {
    state.currentConversationId = id
    localStorage.setItem('lastConversationId', id)
    const messages = await api.getConversation(id)
    state.messages = sanitizeMessages(messages)

    // Move conversation to top of the list (for modal selection)
    if (moveToTop) {
      const index = state.conversations.findIndex(c => c.id === id)
      if (index > 0) {
        const conv = state.conversations.splice(index, 1)[0]
        state.conversations.unshift(conv)
      }
    }
  },

  async deleteConversation(id: string) {
    const confirmed = await confirmDialog('确定要删除这个会话吗？', '确认删除')
    if (!confirmed) return
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
    ;(window as any).showInfo?.('已刷新技能')
  },

  startStream() {
    state.isStreaming = true
    state.thinkingContent = ''
    state.currentToolResults = []
    state.todos = []
    state.progressText = ''
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
    // Save thinking and tool results to the last message
    const lastMsg = state.messages[state.messages.length - 1]
    const msgIndex = state.messages.length - 1
    if (lastMsg && lastMsg.role === 'assistant') {
      if (state.thinkingContent) {
        lastMsg.thinking = state.thinkingContent
      }
      if (state.currentToolResults.length) {
        lastMsg.toolResults = state.currentToolResults
      }

      // Save to backend
      if (state.currentConversationId && (state.thinkingContent || state.currentToolResults.length)) {
        api.updateMessage(state.currentConversationId, msgIndex, {
          thinking: state.thinkingContent || undefined,
          toolResults: state.currentToolResults.length ? state.currentToolResults : undefined
        }).catch(err => console.error('Failed to save message extras:', err))
      }
    }

    state.isStreaming = false
    state.abortController = null
    if (statusTimer) {
      clearInterval(statusTimer)
      statusTimer = null
    }
    state.progressText = ''
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
  },

  // Tool results
  addToolResult(result: ToolResultDisplay) {
    state.currentToolResults.push(result)
  },

  // Todo
  setTodos(todos: TodoItem[]) {
    state.todos = todos
  },

  // Progress
  setProgress(text: string) {
    state.progressText = text
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
