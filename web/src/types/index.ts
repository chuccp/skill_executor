// ==================== 核心数据类型 ====================

export interface Conversation {
  id: string
  createdAt: string
  updatedAt: string
  messageCount: number
  firstUserMessage?: string
  summary?: string
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'thinking' | 'tool_result'
  content: string
  thinking?: string
  toolResults?: ToolResultDisplay[]
  toolResult?: ToolResultDisplay
  todos?: TodoItem[]
}

export interface Skill {
  name: string
  description: string
  prompt: string
  path?: string
  triggers?: string[]
}

export interface Preset {
  name: string
  template?: string
  env: {
    ANTHROPIC_AUTH_TOKEN: string
    ANTHROPIC_BASE_URL?: string
    ANTHROPIC_MODEL: string
    API_TIMEOUT_MS?: string
  }
}

// ==================== 工具相关类型 ====================

export interface ToolResultDisplay {
  type: 'file' | 'files' | 'search' | 'bash' | 'media' | 'write'
  data: any
}

export interface TodoItem {
  id?: string
  task: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  priority?: 'high' | 'medium' | 'low'
}

export interface StreamingBlock {
  type: 'thinking' | 'text'
  content: string
}

export interface StreamingState {
  isStreaming: boolean
  thinkingContent: string
  streamingBlocks: StreamingBlock[]
  toolResults: ToolResultDisplay[]
  todos: TodoItem[]
  progressText: string
  abortController: AbortController | null
}

export interface ConversationState {
  id: string
  messages: Message[]
  streaming: StreamingState
}

// ==================== WebSocket 类型 ====================

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
  | 'play_media'

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
  todos?: TodoItem[]
  data?: any
  askId?: string
  question?: string
  header?: string
  options?: any[]
  confirmId?: string
  config?: any
}

export type WSEventHandler = (event: WSServerMessage) => void

// ==================== 配置相关类型 ====================

export interface Provider {
  id: string
  name: string
  baseUrl: string
  models: string[]
}

export interface ModelTemplate {
  id: string
  name: string
  providers: Provider[]
}

// ==================== Store 类型 ====================

export interface AppState {
  // 会话管理
  conversations: Conversation[]
  currentConversationId: string | null
  
  // 全局配置
  skills: Skill[]
  presets: Preset[]
  selectedModel: string
  selectedSkill: string
  
  // UI 状态
  showConfigModal: boolean
  showSkillModal: boolean
  showConversationModal: boolean
  selectedSkillDetail: Skill | null
  
  // Ask User 状态
  askQuestion: string
  askOptions: any[]
  askId: string
}
