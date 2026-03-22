// 会话状态管理 - 每个会话独立管理自己的消息和流式状态

import { ref } from 'vue'
import type { Message, ConversationState, StreamingState, ToolResultDisplay, TodoItem, StreamingBlock } from '../types'
import { api } from '../services/api'

// 创建空的流式状态
function createEmptyStreamingState(): StreamingState {
  return {
    isStreaming: false,
    thinkingContent: '',
    streamingBlocks: [],
    toolResults: [],
    todos: [],
    progressText: '',
    abortController: null
  }
}

// 会话状态存储 - 使用 Map 实现会话级隔离 (wrapped in ref for reactivity)
const conversationStates = ref<Map<string, ConversationState>>(new Map())

// 当前选中的会话 ID (wrapped in ref for reactivity)
const currentConversationId = ref<string | null>(null)

// 状态消息
const statusMessages = [
  '思考中...',
  '让子弹飞一会儿...',
  '脑细胞正在努力...',
  '正在召唤 AI 之力...',
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

function randomStatusMessage(streaming: StreamingState) {
  let index
  do {
    index = Math.floor(Math.random() * statusMessages.length)
  } while (index === lastStatusIndex && statusMessages.length > 1)
  lastStatusIndex = index
  streaming.progressText = statusMessages[index]
}

// 清理消息（移除工具结果、记忆等内部标记）
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

// 获取或创建会话状态
function getOrCreateState(conversationId: string): ConversationState {
  if (!conversationStates.value.has(conversationId)) {
    conversationStates.value.set(conversationId, {
      id: conversationId,
      messages: [],
      streaming: createEmptyStreamingState()
    })
  }
  return conversationStates.value.get(conversationId)!
}

// Actions
export const conversationsActions = {
  // 获取当前会话状态
  getCurrentState(): ConversationState | null {
    if (!currentConversationId.value) return null
    return getOrCreateState(currentConversationId.value)
  },

  // 获取当前流式状态
  getCurrentStreaming(): StreamingState | null {
    const state = this.getCurrentState()
    return state?.streaming || null
  },

  // 设置当前会话
  async setCurrentConversation(id: string | null) {
    // 切换会话前，先停止当前流式
    if (currentConversationId.value) {
      const currentState = conversationStates.value.get(currentConversationId.value)
      if (currentState?.streaming.isStreaming) {
        this.stopStream(currentConversationId.value)
      }
    }

    currentConversationId.value = id
    if (id) {
      localStorage.setItem('lastConversationId', id)
      // 加载消息
      const messages = await api.getConversation(id)
      const state = getOrCreateState(id)
      state.messages = sanitizeMessages(messages)
    }
  },

  // 获取当前会话 ID
  getCurrentConversationId(): string | null {
    return currentConversationId.value
  },

  // 获取当前会话消息
  getCurrentMessages(): Message[] {
    const state = this.getCurrentState()
    return state?.messages || []
  },

  // 加载会话消息
  async loadConversationMessages(conversationId: string): Promise<Message[]> {
    const messages = await api.getConversation(conversationId)
    const state = getOrCreateState(conversationId)
    state.messages = sanitizeMessages(messages)
    return state.messages
  },

  // 添加消息
  addMessage(role: 'user' | 'assistant', content: string) {
    const state = this.getCurrentState()
    if (state) {
      state.messages.push({ role, content })
    }
  },

  // 开始流式
  startStream(conversationId?: string) {
    const id = conversationId || currentConversationId.value
    if (!id) return

    const state = getOrCreateState(id)
    state.streaming.isStreaming = true
    state.streaming.thinkingContent = ''
    state.streaming.streamingBlocks = []
    state.streaming.toolResults = []
    state.streaming.todos = []
    state.streaming.progressText = ''
    state.streaming.abortController = new AbortController()
    randomStatusMessage(state.streaming)

    // 定时更新状态消息
    statusTimer = window.setInterval(() => {
      randomStatusMessage(state.streaming)
    }, 2000)
  },

  // 停止流式
  stopStream(conversationId?: string) {
    const id = conversationId || currentConversationId.value
    if (!id) return

    const state = getOrCreateState(id)
    const streaming = state.streaming

    if (streaming.abortController) {
      streaming.abortController.abort()
      streaming.abortController = null
    }
    streaming.isStreaming = false
    if (statusTimer) {
      clearInterval(statusTimer)
      statusTimer = null
    }
    streaming.progressText = ''
  },

  // 完成流式 - 保存 thinking 和 toolResults 到消息
  finishStream(conversationId?: string) {
    const id = conversationId || currentConversationId.value
    if (!id) return

    const state = getOrCreateState(id)
    const streaming = state.streaming
    const lastMsg = state.messages[state.messages.length - 1]

    if (lastMsg && lastMsg.role === 'assistant') {
      if (streaming.thinkingContent) {
        lastMsg.thinking = streaming.thinkingContent
      }
      if (streaming.toolResults.length) {
        lastMsg.toolResults = streaming.toolResults
      }

      // 保存到后端
      if (streaming.thinkingContent || streaming.toolResults.length) {
        api.updateMessage(id, state.messages.length - 1, {
          thinking: streaming.thinkingContent || undefined,
          toolResults: streaming.toolResults.length ? streaming.toolResults : undefined
        }).catch(err => console.error('Failed to save message extras:', err))
      }
    }

    streaming.isStreaming = false
    streaming.abortController = null
    if (statusTimer) {
      clearInterval(statusTimer)
      statusTimer = null
    }
    streaming.progressText = ''
    streaming.streamingBlocks = []
  },

  // 追加流式文本
  appendStreamText(text: string) {
    const state = this.getCurrentState()
    if (!state) return

    const lastMsg = state.messages[state.messages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      lastMsg.content += text
    }

    // 追加到流式块
    const streaming = state.streaming
    const lastBlock = streaming.streamingBlocks[streaming.streamingBlocks.length - 1]
    if (lastBlock && lastBlock.type === 'text') {
      lastBlock.content += text
    } else if (text.trim()) {
      streaming.streamingBlocks.push({ type: 'text', content: text })
    }
  },

  // 追加 thinking
  appendThinking(text: string) {
    const state = this.getCurrentState()
    if (!state) return

    const streaming = state.streaming
    streaming.thinkingContent += text

    // 追加到流式块
    const lastBlock = streaming.streamingBlocks[streaming.streamingBlocks.length - 1]
    if (lastBlock && lastBlock.type === 'thinking') {
      lastBlock.content += text
    } else if (text.trim()) {
      streaming.streamingBlocks.push({ type: 'thinking', content: text })
    }
  },

  // 添加工具结果
  addToolResult(result: ToolResultDisplay) {
    const state = this.getCurrentState()
    if (state) {
      state.streaming.toolResults.push(result)
    }
  },

  // 设置 Todos
  setTodos(todos: TodoItem[]) {
    const state = this.getCurrentState()
    if (state) {
      state.streaming.todos = todos
    }
  },

  // 设置进度文本
  setProgress(text: string) {
    const state = this.getCurrentState()
    if (state) {
      state.streaming.progressText = text
    }
  },

  // 获取流式块
  getStreamingBlocks(): StreamingBlock[] {
    const state = this.getCurrentState()
    return state?.streaming.streamingBlocks || []
  },

  // 清理会话状态（删除会话时调用）
  removeState(conversationId: string) {
    conversationStates.value.delete(conversationId)
  },

  // 清空所有状态
  clearAllStates() {
    conversationStates.value.clear()
    currentConversationId.value = null
    if (statusTimer) {
      clearInterval(statusTimer)
      statusTimer = null
    }
  }
}

// 导出响应式 getter
export function useConversationsStore() {
  return {
    get conversations() {
      return Array.from(conversationStates.value.values())
    },
    get currentConversationId() {
      return currentConversationId.value
    },
    get currentMessages() {
      return conversationsActions.getCurrentMessages()
    },
    get currentStreaming() {
      return conversationsActions.getCurrentStreaming()
    },
    actions: conversationsActions
  }
}
