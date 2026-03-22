// WebSocket 服务

import type { WSMessage, WSServerMessage, WSEventHandler, WSServerMessageType } from '../types'

export type { WSMessage, WSServerMessage, WSEventHandler, WSServerMessageType }

export class WebSocketService {
  private ws: WebSocket | null = null
  private eventHandlers: Map<string, Set<WSEventHandler>> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private pingInterval: number | null = null
  private url: string

  constructor(url?: string) {
    // 自动检测 WebSocket URL
    if (url) {
      this.url = url
    } else if (typeof window !== 'undefined') {
      // 开发环境：前端在 38593，通过 Vite 代理连接后端
      // 生产环境：使用当前域名
      const isDev = window.location.port === '5173' || window.location.port === '38593'

      if (isDev) {
        // 开发环境：使用相对路径，Vite 会代理到后端
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        this.url = `${protocol}//${window.location.host}/ws`
      } else {
        // 生产环境：使用当前域名
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        this.url = `${protocol}//${window.location.host}/ws`
      }
      console.log('[WebSocket] 连接地址:', this.url)
    } else {
      this.url = 'ws://localhost:38592/ws'
    }
  }

  // 连接 WebSocket
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const startTime = Date.now()
        console.log('[WebSocket] 开始连接:', this.url)
        this.ws = new WebSocket(this.url)

        // 设置连接超时 (10秒)
        const connectTimeout = setTimeout(() => {
          console.error('[WebSocket] 连接超时, 已等待', Date.now() - startTime, 'ms')
          this.ws?.close()
          reject(new Error('WebSocket 连接超时'))
        }, 10000)

        this.ws.onopen = () => {
          clearTimeout(connectTimeout)
          console.log('[WebSocket] 已连接, 耗时', Date.now() - startTime, 'ms')
          this.reconnectAttempts = 0
          this.startPing()
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: WSServerMessage = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            console.error('[WebSocket] 解析消息失败:', error)
          }
        }

        this.ws.onerror = (error) => {
          clearTimeout(connectTimeout)
          console.error('[WebSocket] 错误:', error, '耗时', Date.now() - startTime, 'ms')
          reject(error)
        }

        this.ws.onclose = () => {
          clearTimeout(connectTimeout)
          console.log('[WebSocket] 已断开')
          this.stopPing()
          this.attemptReconnect()
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  // 断开连接
  disconnect() {
    this.stopPing()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.eventHandlers.clear()
  }

  // 发送消息
  send(message: WSMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[WebSocket] 未连接，无法发送消息')
      return
    }
    this.ws.send(JSON.stringify(message))
  }

  // 发送聊天消息
  sendChat(conversationId: string, content: string, skillName?: string): void {
    this.send({
      type: 'chat',
      conversationId,
      content,
      skillName
    })
  }

  // 发送命令确认
  sendCommandConfirm(confirmId: string, approved: boolean): void {
    this.send({
      type: 'confirm_command',
      confirmId,
      approved
    })
  }

  // 发送问题回答
  sendAskResponse(askId: string, answer: any): void {
    this.send({
      type: 'ask_response',
      askId,
      answer
    })
  }

  // 更新配置
  updateConfig(config: any): void {
    this.send({
      type: 'config',
      config
    })
  }

  // 注册事件处理器
  on(eventType: WSServerMessageType, handler: WSEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set())
    }
    this.eventHandlers.get(eventType)!.add(handler)
  }

  // 移除事件处理器
  off(eventType: WSServerMessageType, handler: WSEventHandler): void {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      handlers.delete(handler)
    }
  }

  // 清除所有事件处理器
  clearHandlers(): void {
    this.eventHandlers.clear()
  }

  // 清除特定会话的事件处理器
  clearConversationHandlers(_conversationId: string): void {
    // 移除所有与该会话相关的事件处理器
    // 注意：这需要事件处理器在注册时带上会话 ID 标识
    // 目前通过 clearHandlers() 全部清除，重新连接时重新注册
  }

  // 检查是否已连接
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  // 获取连接状态
  getReadyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED
  }

  // 处理接收到的消息
  private handleMessage(message: WSServerMessage): void {
    const handlers = this.eventHandlers.get(message.type)
    if (handlers) {
      handlers.forEach(handler => handler(message))
    }

    // 通用错误处理
    if (message.type === 'error') {
      console.error('[WebSocket] 服务器错误:', message.content)
    }
  }

  // 尝试重连
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] 重连失败，已达最大尝试次数')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    console.log(`[WebSocket] 尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts}), 延迟 ${delay}ms`)

    setTimeout(() => {
      this.connect().catch(console.error)
    }, delay)
  }

  // 开始心跳
  private startPing(): void {
    this.pingInterval = window.setInterval(() => {
      this.send({ type: 'ping' })
    }, 30000) // 每 30 秒发送一次 ping
  }

  // 停止心跳
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }
}

// 导出单例
export const wsService = new WebSocketService()
