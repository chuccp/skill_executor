/**
 * WebSocket 服务模块
 * 提供实时双向通信能力
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import * as path from 'path';
import { ConversationManager } from '../conversation';
import { SkillLoader } from '../skillLoader';
import { LLMService } from '../llm';
import { CommandExecutor } from '../commandExecutor';
import { AgentOrchestrator } from '../agentOrchestrator';
import { WSMessage, PendingCommand, PendingQuestion } from './types';
import { handleChat, handleConfirmCommand, handleAskResponse, handleConfig } from './handlers';

/**
 * 设置 WebSocket 服务器
 */
export function setupWebSocket(
  wss: WebSocketServer,
  conversationManager: ConversationManager,
  skillLoader: SkillLoader,
  llmService: LLMService,
  commandExecutor: CommandExecutor,
  agentOrchestrator?: AgentOrchestrator
) {
  const skillsDir = path.join(process.cwd(), 'skills');

  // 存储待确认的命令
  const pendingCommands: Map<string, PendingCommand> = new Map();

  // 存储待回答的问题
  const pendingQuestions: Map<string, PendingQuestion> = new Map();

  // 存储被停止的会话
  const stoppedConversations: Set<string> = new Set();

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    console.log('WebSocket client connected');

    ws.on('message', async (data: Buffer) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'chat':
            await handleChat(
              ws,
              message,
              conversationManager,
              skillLoader,
              llmService,
              commandExecutor,
              skillsDir,
              pendingCommands,
              pendingQuestions,
              agentOrchestrator,
              stoppedConversations
            );
            break;
          case 'confirm_command':
            await handleConfirmCommand(ws, message, commandExecutor, pendingCommands);
            break;
          case 'ask_response':
            handleAskResponse(ws, message, pendingQuestions);
            break;
          case 'config':
            handleConfig(ws, message, llmService);
            break;
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
          case 'stop':
            if (message.conversationId) {
              stoppedConversations.add(message.conversationId);
              ws.send(JSON.stringify({ type: 'done' }));
            }
            break;
        }
      } catch (error: any) {
        ws.send(JSON.stringify({ type: 'error', content: error.message }));
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');

      // 清理与该连接相关的待确认命令
      for (const [confirmId, pending] of pendingCommands.entries()) {
        if (pending.ws === ws) {
          pending.resolve('连接已断开');
          pendingCommands.delete(confirmId);
        }
      }

      // 清理与该连接相关的待回答问题
      for (const [askId, pending] of pendingQuestions.entries()) {
        if (pending.ws === ws) {
          pending.resolve({ cancelled: true, answer: '连接已断开' });
          pendingQuestions.delete(askId);
        }
      }
    });
  });
}

// 导出类型
export { WSMessage, PendingCommand, PendingQuestion, AutoProgress } from './types';
export { getContextLimit, groupToolsForParallelExecution } from './utils';