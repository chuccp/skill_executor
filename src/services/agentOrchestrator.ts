/**
 * Agent 编排器
 * @deprecated 请直接从 './agent' 目录导入
 */

// 从模块化组件重新导出
export { AgentOrchestrator, VectorStore, getRolePrompt } from './agent/index';
export type {
  AgentRole,
  AgentStatus,
  SubTask,
  AgentPlan,
  ReflectionResult,
  MemoryEntry,
  SubAgent
} from './agent/index';