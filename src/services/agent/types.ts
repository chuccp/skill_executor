/**
 * Agent 相关类型定义
 */

/**
 * Agent 角色
 */
export type AgentRole = 'planner' | 'executor' | 'reviewer' | 'explorer' | 'researcher';

/**
 * Agent 状态
 */
export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * 子任务定义
 */
export interface SubTask {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  assignedTo?: string; // Agent ID
  result?: string;
  dependencies?: string[]; // 依赖的任务 ID
  priority: 'high' | 'medium' | 'low';
  createdAt: number;
  completedAt?: number;
}

/**
 * Agent 执行计划
 */
export interface AgentPlan {
  id: string;
  goal: string;
  tasks: SubTask[];
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
}

/**
 * 反思结果
 */
export interface ReflectionResult {
  success: boolean;
  issues: string[];
  suggestions: string[];
  needsRevision: boolean;
  revisedPlan?: Partial<AgentPlan>;
}

/**
 * 长期记忆条目
 */
export interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata: {
    type: 'task_result' | 'learned_pattern' | 'error_solution' | 'user_preference';
    tags: string[];
    timestamp: number;
    conversationId?: string;
    agentId?: string;
  };
  importance: number; // 0-1
  accessCount: number;
  lastAccessed: number;
}

/**
 * 子代理定义
 */
export interface SubAgent {
  id: string;
  role: AgentRole;
  task: string;
  status: AgentStatus;
  result?: string;
  conversationId?: string;
  createdAt: number;
  completedAt?: number;
  parentConversationId: string;
  plan?: AgentPlan;
  reflections: ReflectionResult[];
}