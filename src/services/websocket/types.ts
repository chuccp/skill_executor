// WebSocket 消息类型
export interface WSMessage {
  type: 'chat' | 'config' | 'ping' | 'confirm_command' | 'ask_response' | 'stop' | 'progress';
  conversationId?: string;
  content?: string;
  skillName?: string;
  config?: any;
  command?: string;
  approved?: boolean;
  confirmId?: string;
  askId?: string;
  answer?: any;
  progress?: ProgressInfo;
}

// 待确认命令
export interface PendingCommand {
  command: string;
  action?: 'delete' | 'git_commit';
  path?: string;
  ws: import('ws').WebSocket;
  conversationId: string;
  resolve: (result: string | boolean) => void;
}

// 待回答问题
export interface PendingQuestion {
  ws: import('ws').WebSocket;
  resolve: (answer: any) => void;
}

// 自动进度
export interface AutoProgress {
  tasks: import('../tools').TodoItem[];
  toolCount: number;
}

// 进度信息
export interface ProgressInfo {
  currentIteration: number;
  maxIterations: number;
  totalTools: number;
  successfulTools: number;
  failedTools: number;
  isComplete: boolean;
}