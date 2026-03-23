/**
 * Agent 模块
 * 提供多 Agent 协作能力
 */

// 导出主类
export { AgentOrchestrator } from './orchestrator';

// 导出类型
export type {
  AgentRole,
  AgentStatus,
  SubTask,
  AgentPlan,
  ReflectionResult,
  MemoryEntry,
  SubAgent
} from './types';

// 导出向量存储（供高级使用）
export { VectorStore } from './vectorStore';

// 导出提示工具
export { getRolePrompt } from './prompts';