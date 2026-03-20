// 类型定义

// Skill 定义
export interface Skill {
  name: string;
  description: string;
  trigger?: {
    when?: string[];
    notWhen?: string[];
  };
  prompt: string;
  path: string;
}

// 消息角色
export type MessageRole = 'user' | 'assistant' | 'system';

// 工具结果展示
export interface ToolResultDisplay {
  type: 'file' | 'files' | 'search' | 'bash' | 'media' | 'write';
  data: any;
}

// 聊天消息
export interface ChatMessage {
  role: MessageRole;
  content: string;
  timestamp: Date;
  thinking?: string;
  toolResults?: ToolResultDisplay[];
}

// 会话
export interface Conversation {
  id: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// LLM 配置
export interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'custom';
  apiKey: string;
  baseUrl?: string;
  model: string;
}

// API 响应
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// 流式响应事件
export interface StreamEvent {
  type: 'text' | 'thinking' | 'tool_use' | 'error' | 'done';
  content?: string;
  toolName?: string;
  toolId?: string;
  toolInput?: any;
}

// 预设模型配置
export interface PresetConfig {
  name: string;
  env: {
    ANTHROPIC_AUTH_TOKEN?: string;
    ANTHROPIC_BASE_URL?: string;
    ANTHROPIC_MODEL?: string;
    API_TIMEOUT_MS?: string;
    [key: string]: string | undefined;
  };
}
