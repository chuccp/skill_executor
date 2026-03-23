// WebSocket 事件处理 composable

import { onMounted, onUnmounted } from 'vue'
import { useConversationsStore } from '../stores/conversations'
import { useConfigStore } from '../stores/config'
import { useStore } from '../stores/app'
import { wsService } from '../services/websocket'
import type { WSServerMessage } from '../types'

export function useWebSocketHandler() {
  const conversationsStore = useConversationsStore()
  const configStore = useConfigStore()
  const appStore = useStore()

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

    tool_result: (_msg: WSServerMessage) => {
      // 不再处理 display，媒体通过 media_result 事件处理
    },

    // 媒体结果 - 直接追加 markdown
    media_result: (msg: WSServerMessage) => {
      if (msg.markdown) {
        conversationsStore.actions.appendMediaMarkdown(msg.markdown)
      }
    },

    pause_stream: () => {
      // ask_user 触发，结束当前流式，保存当前 AI 消息
      // 后端会在 done 之前发送 pause_stream，但 we also receive done
      // 所以这里只需要确保流式状态正确结束
      conversationsStore.actions.finishStream()
    },

    ask_user: (data: WSServerMessage) => {
      console.log('[WebSocket] 收到 ask_user 消息:', data);
      if (data.question !== undefined) {
        // 清除进度文本，显示问题
        conversationsStore.actions.setProgress('')
        configStore.actions.setAskUser(data.question, data.options || [], data.askId || '')
        console.log('[WebSocket] ask_user 状态已设置:', {
          question: data.question,
          options: data.options,
          askId: data.askId
        });
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
        conversationsStore.actions.setUsage({
          ...data.usage,
          totalInputTokens: conversationsStore.currentUsage?.totalInputTokens || 0,
          totalOutputTokens: conversationsStore.currentUsage?.totalOutputTokens || 0
        })
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

    // 上下文压缩通知
    context_compressed: (data: WSServerMessage) => {
      console.log('[WebSocket] 上下文已压缩:', data.content)
      // 可以在这里显示 toast 或其他通知
    },

    // 新会话创建
    conversation_created: (data: WSServerMessage) => {
      if (data.conversationId) {
        console.log('[WebSocket] 新会话已创建:', data.conversationId)
        conversationsStore.actions.setCurrentConversationId(data.conversationId)
        // 刷新会话列表
        appStore.actions.loadConversations()
      }
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