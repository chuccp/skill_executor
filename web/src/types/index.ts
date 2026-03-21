// 类型定义

export interface Conversation {
  id: string
  createdAt: string
  updatedAt: string
  messageCount: number
  firstUserMessage?: string
  summary?: string
}

export interface ToolResultDisplay {
  type: 'file' | 'files' | 'search' | 'bash' | 'media' | 'write'
  data: any
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'thinking' | 'tool_result'
  content: string
  thinking?: string
  toolResults?: ToolResultDisplay[]
  toolResult?: ToolResultDisplay
  todos?: Array<{
    id?: string
    task: string
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
    priority?: 'high' | 'medium' | 'low'
  }>
}

export interface Skill {
  name: string
  description: string
  prompt: string
  path?: string
}

export interface Preset {
  name: string
  template?: string
  env: {
    ANTHROPIC_AUTH_TOKEN: string
    ANTHROPIC_BASE_URL?: string
    ANTHROPIC_MODEL: string
  }
}

export interface AppState {
  currentConversationId: string | null
  conversations: Conversation[]
  messages: Message[]
  skills: Skill[]
  presets: Preset[]
  isStreaming: boolean
  selectedModel: string
  selectedSkill: string
  streamStatus: string
  thinkingContent: string
}

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
