import { WebSocketServer, WebSocket } from 'ws';
import { ConversationManager } from './conversation';
import { SkillLoader } from './skillLoader';
import { LLMService } from './llm';
import { CommandExecutor } from './commandExecutor';
import { IncomingMessage } from 'http';
import * as path from 'path';
import { TOOLS, executeTool, ToolContext } from './toolExecutor';
import { buildSystemPrompt, getDetailedTaskDescription } from './systemPrompt';
import { TodoItem } from './tools';

interface WSMessage {
  type: 'chat' | 'config' | 'ping' | 'confirm_command' | 'ask_response';
  conversationId?: string;
  content?: string;
  skillName?: string;
  config?: any;
  command?: string;
  approved?: boolean;
  confirmId?: string;
  askId?: string;
  answer?: any;
}

export function setupWebSocket(
  wss: WebSocketServer,
  conversationManager: ConversationManager,
  skillLoader: SkillLoader,
  llmService: LLMService,
  commandExecutor: CommandExecutor
) {
  const skillsDir = path.join(process.cwd(), 'skills');

  // 存储待确认的命令
  const pendingCommands: Map<string, {
    command: string;
    ws: WebSocket;
    conversationId: string;
    resolve: (result: string) => void;
  }> = new Map();

  // 存储待回答的问题
  const pendingQuestions: Map<string, {
    resolve: (answer: any) => void;
  }> = new Map();

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    console.log('WebSocket client connected');

    ws.on('message', async (data: Buffer) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'chat':
            await handleChat(ws, message, conversationManager, skillLoader, llmService, commandExecutor, skillsDir, pendingCommands, pendingQuestions);
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
        }
      } catch (error: any) {
        ws.send(JSON.stringify({ type: 'error', content: error.message }));
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
  });
}

async function handleChat(
  ws: WebSocket,
  message: WSMessage,
  conversationManager: ConversationManager,
  skillLoader: SkillLoader,
  llmService: LLMService,
  commandExecutor: CommandExecutor,
  skillsDir: string,
  pendingCommands: Map<string, any>,
  pendingQuestions: Map<string, any>
) {
  const { conversationId, content, skillName } = message;
  console.log('[WS] 收到聊天消息:', { conversationId, content: content?.substring(0, 50), skillName });

  if (!conversationId || !content) {
    ws.send(JSON.stringify({ type: 'error', content: 'Missing conversationId or content' }));
    return;
  }

  const conversation = conversationManager.get(conversationId);
  if (!conversation) {
    ws.send(JSON.stringify({ type: 'error', content: 'Conversation not found' }));
    return;
  }

  // 添加用户消息
  conversationManager.addMessage(conversationId, 'user', content);
  ws.send(JSON.stringify({ type: 'user_message', content }));

  // 获取 skill 的 prompt
  const basePrompt = buildSystemPrompt();
  let systemPrompt = basePrompt;
  if (skillName) {
    const skill = skillLoader.get(skillName);
    if (skill && skill.prompt) {
      systemPrompt = `${skill.prompt}\n\n${basePrompt}`;
      console.log('[WS] 使用技能:', skillName);
    }
  }

  const MAX_ITERATIONS = 20;
  const autoProgress: { tasks: TodoItem[], toolCount: number } = { tasks: [], toolCount: 0 };

  try {
    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
      iteration++;
      console.log(`[WS] 第 ${iteration} 轮调用...`);

      let fullResponse = '';
      let toolCalls: any[] = [];

      // 流式响应
      const contextMessages = conversationManager.buildContextMessages(conversationId, content);
      for await (const event of llmService.chatStream(contextMessages, systemPrompt, TOOLS)) {
        if (event.type === 'text' && event.content) {
          fullResponse += event.content;
          ws.send(JSON.stringify({ type: 'text', content: event.content }));
        } else if (event.type === 'thinking' && event.content) {
          ws.send(JSON.stringify({ type: 'thinking', content: event.content }));
        } else if (event.type === 'tool_use') {
          toolCalls.push({
            id: event.toolId,
            name: event.toolName,
            input: event.toolInput
          });
        } else if (event.type === 'error') {
          console.error('[WS] 流式错误:', event.content);
          ws.send(JSON.stringify({ type: 'error', content: event.content }));
          return;
        }
      }

      console.log('[WS] 响应长度:', fullResponse.length, '工具调用:', toolCalls.length);

      // 如果没有工具调用，结束循环
      if (toolCalls.length === 0) {
        conversationManager.addMessage(conversationId, 'assistant', fullResponse);
        break;
      }

      // 处理工具调用
      for (const tool of toolCalls) {
        console.log('[WS] 工具:', tool.name, JSON.stringify(tool.input).substring(0, 100));

        let currentTaskId: string | null = null;

        if (tool.name === 'todo_write') {
          const todos = tool.input?.todos as TodoItem[];
          if (todos && Array.isArray(todos)) {
            autoProgress.tasks = todos;
            ws.send(JSON.stringify({ type: 'todo_updated', todos }));
          }
        } else {
          // 自动添加进度任务
          const detailedTask = getDetailedTaskDescription(tool.name, tool.input);
          currentTaskId = `auto-${Date.now()}-${autoProgress.toolCount}`;

          // 清理已完成的自动任务
          if (autoProgress.tasks.length > 5) {
            autoProgress.tasks = autoProgress.tasks.filter(t => t.status === 'in_progress');
          }

          // 标记上一个任务为完成
          const lastInProgress = autoProgress.tasks.find(t => t.status === 'in_progress');
          if (lastInProgress) lastInProgress.status = 'completed';

          // 添加新任务
          autoProgress.tasks.push({
            id: currentTaskId,
            task: detailedTask,
            status: 'in_progress'
          });
          autoProgress.toolCount++;

          ws.send(JSON.stringify({ type: 'todo_updated', todos: autoProgress.tasks }));
        }

        // 执行工具
        const ctx: ToolContext = {
          conversationId,
          commandExecutor,
          skillsDir,
          skillLoader,
          conversationManager,
          ws,
          pendingCommands,
          pendingQuestions
        };
        const result = await executeTool(tool, ctx);

        // 标记当前任务完成
        if (currentTaskId) {
          const currentTask = autoProgress.tasks.find(t => t.id === currentTaskId);
          if (currentTask) {
            currentTask.status = 'completed';
            ws.send(JSON.stringify({ type: 'todo_updated', todos: autoProgress.tasks }));
          }
        }

        // 将工具结果作为用户消息添加到对话
        conversationManager.addMessage(conversationId, 'user', `[工具结果] ${result}`);
      }
    }

    // 标记所有任务完成
    autoProgress.tasks.forEach(t => t.status = 'completed');
    ws.send(JSON.stringify({ type: 'todo_updated', todos: autoProgress.tasks }));

    ws.send(JSON.stringify({ type: 'done' }));
  } catch (error: any) {
    console.error('[WS] 异常:', error);
    ws.send(JSON.stringify({ type: 'error', content: error.message }));
  }
}

async function handleConfirmCommand(
  ws: WebSocket,
  message: WSMessage,
  commandExecutor: CommandExecutor,
  pendingCommands: Map<string, any>
) {
  const { confirmId, approved } = message;

  if (!confirmId) {
    ws.send(JSON.stringify({ type: 'error', content: '缺少确认ID' }));
    return;
  }

  const pending = pendingCommands.get(confirmId);
  if (!pending) {
    ws.send(JSON.stringify({ type: 'error', content: '确认请求已过期' }));
    return;
  }

  pendingCommands.delete(confirmId);

  if (approved) {
    ws.send(JSON.stringify({ type: 'command_start', command: pending.command }));
    const result = await commandExecutor.execute(pending.command);
    ws.send(JSON.stringify({
      type: 'command_result',
      command: pending.command,
      success: result.success,
      stdout: result.stdout,
      stderr: result.stderr
    }));

    const output = result.success
      ? (result.stdout || '(无输出)')
      : `错误: ${result.stderr || result.stdout}`;
    pending.resolve(`命令: ${pending.command}\n${output}`);
  } else {
    ws.send(JSON.stringify({ type: 'command_cancelled', command: pending.command }));
    pending.resolve('命令已被用户取消');
  }
}

function handleAskResponse(
  ws: WebSocket,
  message: WSMessage,
  pendingQuestions: Map<string, any>
) {
  const { askId, answer } = message;

  if (!askId) {
    ws.send(JSON.stringify({ type: 'error', content: '缺少问题ID' }));
    return;
  }

  const pending = pendingQuestions.get(askId);
  if (!pending) {
    ws.send(JSON.stringify({ type: 'error', content: '问题已过期' }));
    return;
  }

  pendingQuestions.delete(askId);
  pending.resolve(answer);
}

function handleConfig(ws: WebSocket, message: WSMessage, llmService: LLMService) {
  if (message.config) {
    llmService.updateConfig(message.config);
    ws.send(JSON.stringify({ type: 'config_updated', config: llmService.getConfig() }));
  }
}