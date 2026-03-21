// WebSocket 服务类型定义

export type WSMessageType = 
  | 'chat'
  | 'config'
  | 'ping'
  | 'confirm_command'
  | 'ask_response'

export type WSServerMessageType =
  | 'text'
  | 'thinking'
  | 'user_message'
  | 'done'
  | 'error'
  | 'tool_use'
  | 'tool_result'
  | 'command_confirm'
  | 'command_start'
  | 'command_result'
  | 'command_cancelled'
  | 'file_read'
  | 'file_written'
  | 'file_replaced'
  | 'glob_result'
  | 'grep_result'
  | 'directory_list'
  | 'search_start'
  | 'search_result'
  | 'fetch_start'
  | 'fetch_result'
  | 'todo_updated'
  | 'todo_read'
  | 'todo'
  | 'ask_user'
  | 'skill_created'
  | 'pong'
  | 'config_updated'
  | 'progress'

export interface WSMessage {
  type: WSMessageType
  conversationId?: string
  content?: string
  skillName?: string
  config?: any
  command?: string
  approved?: boolean
  confirmId?: string
  askId?: string
  answer?: any
}

export interface WSServerMessage {
  type: WSServerMessageType
  content?: string
  command?: string
  success?: boolean
  stdout?: string
  stderr?: string
  todos?: any[]
  data?: any
  askId?: string
  question?: string
  header?: string
  options?: any[]
  confirmId?: string
  config?: any
}

export type WSEventHandler = (event: WSServerMessage) => void

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
      // 开发环境：连接到后端服务器 (38592)
      // 生产环境：使用当前域名
      const isDev = window.location.port === '5173' || window.location.hostname === 'localhost'
      const port = isDev ? '38592' : window.location.port
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      this.url = `${protocol}//${window.location.hostname}:${port}/ws`
    } else {
      this.url = 'ws://localhost:38592/ws'
    }
  }

  // 连接 WebSocket
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        // 设置连接超时
        const connectTimeout = setTimeout(() => {
          console.error('[WebSocket] 连接超时')
          this.ws?.close()
          reject(new Error('WebSocket 连接超时'))
        }, 5000)

        this.ws.onopen = () => {
          clearTimeout(connectTimeout)
          console.log('[WebSocket] 已连接')
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
          console.error('[WebSocket] 错误:', error)
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
