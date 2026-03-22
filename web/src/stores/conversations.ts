// 会话状态管理 - 每个会话独立管理自己的消息和流式状态

import { ref } from 'vue'
import type { Message, ConversationState, StreamingState, ToolResultDisplay, TodoItem, ContentBlock } from '../types'
import { api } from '../services/api'
import { getRandomStatusMessage } from '../constants/messages'

// 创建空的流式状态
function createEmptyStreamingState(): StreamingState {
  return {
    isStreaming: false,
    thinkingContent: '',
    streamingBlocks: [],
    contentBlocks: [],
    toolResults: [],
    todos: [],
    progressText: '',
    abortController: null
  }
}

// Token 使用状态
interface UsageState {
  inputTokens: number
  outputTokens: number
}

// 当前 token 使用量
const currentUsage = ref<UsageState>({ inputTokens: 0, outputTokens: 0 })

// 会话状态存储 - 使用 Map 实现会话级隔离 (wrapped in ref for reactivity)
const conversationStates = ref<Map<string, ConversationState>>(new Map())

// 当前选中的会话 ID (wrapped in ref for reactivity)
const currentConversationId = ref<string | null>(null)

let statusTimer: number | null = null
let lastStatusMessage = ''

function updateStatusMessage(streaming: StreamingState) {
  const newMessage = getRandomStatusMessage(lastStatusMessage)
  lastStatusMessage = newMessage
  streaming.progressText = newMessage
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

    // 清空 token 使用量
    currentUsage.value = { inputTokens: 0, outputTokens: 0 }

    const state = getOrCreateState(id)
    state.streaming.isStreaming = true
    state.streaming.thinkingContent = ''
    state.streaming.streamingBlocks = []
    state.streaming.contentBlocks = []  // 初始化内容块
    state.streaming.toolResults = []
    state.streaming.todos = []
    state.streaming.progressText = ''
    state.streaming.abortController = new AbortController()
    updateStatusMessage(state.streaming)

    // 定时更新状态消息
    statusTimer = window.setInterval(() => {
      updateStatusMessage(state.streaming)
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
      // 保存 token 使用量
      if (currentUsage.value.inputTokens > 0 || currentUsage.value.outputTokens > 0) {
        lastMsg.usage = { ...currentUsage.value }
      }

      // 保存到后端
      if (streaming.thinkingContent || streaming.toolResults.length || lastMsg.usage) {
        api.updateMessage(id, state.messages.length - 1, {
          thinking: streaming.thinkingContent || undefined,
          toolResults: streaming.toolResults.length ? streaming.toolResults : undefined,
          usage: lastMsg.usage
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
    streaming.contentBlocks = []
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

    // 追加到内容块（统一显示）
    this.appendTextBlock(text)
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

    // 追加到内容块（统一显示）
    const blocks = streaming.contentBlocks
    const lastContentBlock = blocks[blocks.length - 1]
    if (lastContentBlock && lastContentBlock.type === 'thinking') {
      lastContentBlock.thinkingContent = (lastContentBlock.thinkingContent || '') + text
    } else {
      blocks.push({
        id: `thinking-${Date.now()}`,
        type: 'thinking',
        thinkingContent: text
      })
    }
  },

  // 添加工具结果
  addToolResult(result: ToolResultDisplay) {
    const state = this.getCurrentState()
    if (state) {
      // 只保存到 toolResults 数组，用于持久化
      state.streaming.toolResults.push(result)
      // 不再添加到 contentBlocks，让 AI 的回复通过 markdown 渲染
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

  // ========== 内容块管理（统一流式显示） ==========

  // 获取内容块列表
  getContentBlocks(): ContentBlock[] {
    const state = this.getCurrentState()
    return state?.streaming.contentBlocks || []
  },

  // 添加文本块
  appendTextBlock(text: string) {
    const state = this.getCurrentState()
    if (!state) return

    const blocks = state.streaming.contentBlocks
    const lastBlock = blocks[blocks.length - 1]

    // 如果最后一个块是文本块，追加内容
    if (lastBlock && lastBlock.type === 'text') {
      lastBlock.content = (lastBlock.content || '') + text
    } else {
      // 否则创建新的文本块
      blocks.push({
        id: `text-${Date.now()}`,
        type: 'text',
        content: text
      })
    }
  },

  // 开始命令执行 - 添加 markdown 格式的命令文本
  startCommand(command: string) {
    const state = this.getCurrentState()
    if (state) {
      // 追加命令的 markdown 格式
      const cmdMarkdown = `\n\`\`\`bash\n$ ${command}\n`
      this.appendTextBlock(cmdMarkdown)
    }
  },

  // 追加命令输出
  appendCommandOutput(_command: string, output: string) {
    // 直接追加输出到文本块
    this.appendTextBlock(output)
  },

  // 完成命令执行
  finishCommand(_command: string, success: boolean) {
    // 添加完成标记
    const endMarkdown = success ? '\n```\n' : '\n```\n❌ 命令执行失败\n'
    this.appendTextBlock(endMarkdown)
  },

  // 添加媒体块
  addMediaBlock(media: { type: 'image' | 'audio' | 'video'; url: string; name: string }) {
    const state = this.getCurrentState()
    if (state) {
      state.streaming.contentBlocks.push({
        id: `media-${Date.now()}`,
        type: 'media',
        mediaType: media.type,
        url: media.url,
        name: media.name
      })
    }
  },

  // 添加工具结果块
  addToolResultBlock(toolType: 'file' | 'files' | 'search' | 'write', data: any) {
    const state = this.getCurrentState()
    if (state) {
      state.streaming.contentBlocks.push({
        id: `tool-${Date.now()}`,
        type: 'tool_result',
        toolType,
        data
      })
    }
  },

  // 清理命令状态（保留用于向后兼容）
  clearCommands() {
    // 不再需要，保留空方法
  },

  // ========== Token 使用量管理 ==========

  // 设置 token 使用量
  setUsage(usage: { inputTokens: number; outputTokens: number }) {
    currentUsage.value = usage
  },

  // 获取 token 使用量
  getUsage(): UsageState {
    return currentUsage.value
  },

  // 清空 token 使用量
  clearUsage() {
    currentUsage.value = { inputTokens: 0, outputTokens: 0 }
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
    get currentUsage() {
      return currentUsage.value
    },
    get contentBlocks() {
      return conversationsActions.getContentBlocks()
    },
    actions: conversationsActions
  }
}
