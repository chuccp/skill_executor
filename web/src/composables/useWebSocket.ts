// WebSocket 事件处理 composable

import { onMounted, onUnmounted } from 'vue'
import { useConversationsStore } from '../stores/conversations'
import { useConfigStore } from '../stores/config'
import { wsService } from '../services/websocket'
import type { WSServerMessage } from '../types'

export function useWebSocketHandler() {
  const conversationsStore = useConversationsStore()
  const configStore = useConfigStore()

  // Event handlers
  const handlers = {
    text: (data: WSServerMessage) => {
      conversationsStore.actions.appendStreamText(data.content || '')
    },

    thinking: (data: WSServerMessage) => {
      if (data.content) {
        conversationsStore.actions.appendThinking(data.content)
      }
    },

    tool_use: (data: WSServerMessage) => {
      if (data.content) {
        conversationsStore.actions.setProgress(data.content)
      }
    },

    tool_result: (msg: WSServerMessage) => {
      if (msg.data && msg.data.display) {
        conversationsStore.actions.addToolResult(msg.data.display)
      }
    },

    pause_stream: () => {
      // 暂停流式，保存当前 AI 消息（thinking、toolResults 等）
      // 后续用户回答后，AI 会开始新的消息
      conversationsStore.actions.finishStream()
    },

    resume_stream: () => {
      // 用户已回答，AI 继续响应，创建新的 AI 消息
      conversationsStore.actions.addMessage('assistant', '')
      conversationsStore.actions.startStream()
    },

    ask_user: (data: WSServerMessage) => {
      if (data.askId && data.question !== undefined) {
        // 清除进度文本，显示问题
        conversationsStore.actions.setProgress('')
        configStore.actions.setAskUser(data.question, data.options || [], data.askId)
      }
    },

    // 任务列表更新
    todo_updated: (data: WSServerMessage) => {
      if (data.todos) {
        conversationsStore.actions.setTodos(data.todos)
      }
    },

    // Token 使用量更新
    usage: (data: WSServerMessage) => {
      if (data.usage) {
        conversationsStore.actions.setUsage(data.usage)
      }
    },

    // 命令开始
    command_start: (data: WSServerMessage) => {
      if (data.command) {
        conversationsStore.actions.startCommand(data.command)
      }
    },

    // 命令实时输出
    command_output: (data: WSServerMessage) => {
      if (data.command && data.output) {
        conversationsStore.actions.appendCommandOutput(data.command, data.output)
      }
    },

    // 命令完成
    command_result: (data: WSServerMessage) => {
      if (data.command) {
        conversationsStore.actions.finishCommand(data.command, data.success ?? true)
      }
    },

    done: () => {
      conversationsStore.actions.finishStream()
    },

    error: (data: WSServerMessage) => {
      console.error('[WebSocket] Server error:', data.content)
      conversationsStore.actions.stopStream()
    }
  }

  function registerHandlers() {
    Object.entries(handlers).forEach(([event, handler]) => {
      wsService.on(event as any, handler as any)
    })
  }

  function unregisterHandlers() {
    Object.entries(handlers).forEach(([event, handler]) => {
      wsService.off(event as any, handler as any)
    })
  }

  return {
    registerHandlers,
    unregisterHandlers
  }
}

// Auto-register in component
export function useWebSocket() {
  const { registerHandlers, unregisterHandlers } = useWebSocketHandler()

  onMounted(() => {
    registerHandlers()
  })

  onUnmounted(() => {
    unregisterHandlers()
  })

  return {
    wsService
  }
}