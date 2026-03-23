/**
 * 工具执行上下文
 */

import { WebSocket } from 'ws';
import { CommandExecutor } from '../commandExecutor';
import { SkillLoader } from '../skillLoader';
import { ConversationManager } from '../conversation';
import { AgentOrchestrator } from '../agentOrchestrator';

export interface ToolContext {
  conversationId: string;
  commandExecutor: CommandExecutor;
  skillsDir: string;
  skillLoader: SkillLoader;
  conversationManager: ConversationManager;
  ws?: WebSocket;
  pendingCommands?: Map<string, any>;
  pendingQuestions?: Map<string, any>;
  agentOrchestrator?: AgentOrchestrator;
}