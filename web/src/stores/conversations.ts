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
  contextTokens?: number
  contextLimit?: number
  contextPercent?: number
  totalInputTokens: number   // 会话累计输入 tokens
  totalOutputTokens: number  // 会话累计输出 tokens
}

// 当前 token 使用量
const currentUsage = ref<UsageState>({ inputTokens: 0, outputTokens: 0, totalInputTokens: 0, totalOutputTokens: 0 })

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

    // 重置 token 累计值（新会话从 0 开始）
    currentUsage.value = { inputTokens: 0, outputTokens: 0, totalInputTokens: 0, totalOutputTokens: 0 }

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

  // 设置当前会话 ID（不加载消息，用于后端已创建会话的场景）
  setCurrentConversationId(id: string) {
    currentConversationId.value = id
    localStorage.setItem('lastConversationId', id)
    // 确保会话状态存在
    getOrCreateState(id)
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

    // 重置当前请求的 tokens（保留累计值）
    currentUsage.value.inputTokens = 0
    currentUsage.value.outputTokens = 0
    currentUsage.value.contextTokens = undefined
    currentUsage.value.contextLimit = undefined
    currentUsage.value.contextPercent = undefined

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

    // 创建一条空的 assistant 消息用于流式追加
    const lastMsg = state.messages[state.messages.length - 1]
    if (!lastMsg || lastMsg.role !== 'assistant') {
      state.messages.push({ role: 'assistant', content: '' })
    } else {
      // 如果最后已经是 assistant 消息，清空内容（新的回复）
      lastMsg.content = ''
    }

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

      // 保存消息到后端（包括内容）
      api.updateMessage(id, state.messages.length - 1, {
        thinking: streaming.thinkingContent || undefined,
        toolResults: streaming.toolResults.length ? streaming.toolResults : undefined,
        usage: lastMsg.usage,
        content: lastMsg.content
      }).catch(err => console.error('Failed to save message:', err))
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
      state.streaming.toolResults.push(result)
    }
  },

  // 追加媒体 markdown 到消息
  async appendMediaMarkdown(markdown: string) {
    const state = this.getCurrentState()
    if (state) {
      const lastMsg = state.messages[state.messages.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        // 检查是否已包含，避免重复
        if (!lastMsg.content.includes(markdown)) {
          lastMsg.content += '\n\n' + markdown + '\n'
          // 保存到后端
          const convId = this.getCurrentConversationId()
          if (convId) {
            const idx = state.messages.length - 1
            await api.updateMessage(convId, idx, { content: lastMsg.content })
          }
        }
      }
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

  // 开始代码块
  startCodeBlock(language: string = '') {
    const state = this.getCurrentState()
    if (!state) return

    const blocks = state.streaming.contentBlocks
    blocks.push({
      id: `code-${Date.now()}`,
      type: 'code',
      code: '',
      language: language,
      isStreaming: true
    })

    // 同时追加到 message.content（markdown 格式）
    const lastMsg = state.messages[state.messages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      lastMsg.content += '\n```' + language + '\n'
    }
  },

  // 追加代码内容
  appendCodeBlock(code: string) {
    const state = this.getCurrentState()
    if (!state) return

    const blocks = state.streaming.contentBlocks
    const lastBlock = blocks[blocks.length - 1]

    // 更新 contentBlocks
    if (lastBlock && lastBlock.type === 'code' && lastBlock.isStreaming) {
      lastBlock.code = (lastBlock.code || '') + code
    }

    // 同时追加到 message.content（无论 contentBlocks 状态如何）
    const lastMsg = state.messages[state.messages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      lastMsg.content += code
    }
  },

  // 结束代码块
  finishCodeBlock() {
    const state = this.getCurrentState()
    if (!state) return

    const blocks = state.streaming.contentBlocks
    const lastBlock = blocks[blocks.length - 1]

    if (lastBlock && lastBlock.type === 'code') {
      lastBlock.isStreaming = false
    }

    // 同时关闭 markdown 代码块
    const lastMsg = state.messages[state.messages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      lastMsg.content += '\n```\n'
    }
  },

  // 开始命令执行 - 使用代码块类型
  startCommand(command: string) {
    const state = this.getCurrentState()
    if (!state) return

    const blocks = state.streaming.contentBlocks
    blocks.push({
      id: `code-${Date.now()}`,
      type: 'code',
      code: `$ ${command}\n`,
      language: 'bash',
      isStreaming: true
    })

    // 同时追加到 message.content（markdown 格式）
    const lastMsg = state.messages[state.messages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      lastMsg.content += '\n```bash\n$ ' + command + '\n'
    }
  },

  // 追加命令输出
  appendCommandOutput(_command: string, output: string) {
    this.appendCodeBlock(output)
  },

  // 完成命令执行
  finishCommand(_command: string, success: boolean) {
    const state = this.getCurrentState()
    if (!state) return

    const blocks = state.streaming.contentBlocks
    const lastBlock = blocks[blocks.length - 1]

    if (lastBlock && lastBlock.type === 'code' && lastBlock.isStreaming) {
      lastBlock.isStreaming = false
      if (!success) {
        lastBlock.code = (lastBlock.code || '') + '\n❌ 命令执行失败\n'
      }
    }

    // 同时关闭 markdown 代码块
    const lastMsg = state.messages[state.messages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      if (!success) {
        lastMsg.content += '\n❌ 命令执行失败\n'
      }
      lastMsg.content += '\n```\n'
    }
  },

  // 清理命令状态（保留用于向后兼容）
  clearCommands() {
    // 不再需要，保留空方法
  },

  // ========== Token 使用量管理 ==========

  // 设置 token 使用量（累加到会话总量）
  setUsage(usage: UsageState) {
    // 累加本次请求的 tokens
    currentUsage.value.totalInputTokens += usage.inputTokens
    currentUsage.value.totalOutputTokens += usage.outputTokens
    // 更新当前请求的值和上下文信息
    currentUsage.value.inputTokens = usage.inputTokens
    currentUsage.value.outputTokens = usage.outputTokens
    currentUsage.value.contextTokens = usage.contextTokens
    currentUsage.value.contextLimit = usage.contextLimit
    currentUsage.value.contextPercent = usage.contextPercent
  },

  // 获取 token 使用量
  getUsage(): UsageState {
    return currentUsage.value
  },

  // 清空 token 使用量
  clearUsage() {
    currentUsage.value = { inputTokens: 0, outputTokens: 0, totalInputTokens: 0, totalOutputTokens: 0 }
  },

  // 重置当前请求的 tokens（保留累计值）
  resetCurrentUsage() {
    currentUsage.value.inputTokens = 0
    currentUsage.value.outputTokens = 0
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
