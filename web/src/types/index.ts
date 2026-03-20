// 类型定义

export interface Conversation {
  id: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  toolResults?: ToolResult[]
}

export interface ToolResult {
  name: string
  result: string
}

export interface Skill {
  name: string
  description: string
  content: string
}

export interface Preset {
  name: string
  env: {
    ANTHROPIC_AUTH_TOKEN: string
    ANTHROPIC_BASE_URL?: string
    ANTHROPIC_MODEL: string
  }
}

export interface WorkdirItem {
  name: string
  isDir: boolean
  size?: number
  modified?: string
}

export interface Workdir {
  path: string
  items: WorkdirItem[]
}

export interface AppState {
  currentConversationId: string | null
  conversations: Conversation[]
  messages: Message[]
  skills: Skill[]
  presets: Preset[]
  workdir: Workdir
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
