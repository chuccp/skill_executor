import { ConversationManager } from './conversation';
import { SkillLoader } from './skillLoader';
import { LLMService } from './llm';
import { CommandExecutor } from './commandExecutor';
import { TOOLS, executeTool, ToolContext } from './toolExecutor';
import { buildSystemPrompt, getDetailedTaskDescription } from './systemPrompt';
import { TodoItem } from './tools';

// SSE 事件类型
export interface SSEEvent {
  type: 'text' | 'thinking' | 'progress' | 'tool_use' | 'tool_result' | 'todo' | 'error' | 'done';
  data: any;
}

// 流式聊天配置
export interface StreamChatConfig {
  conversationManager: ConversationManager;
  skillLoader: SkillLoader;
  llmService: LLMService;
  commandExecutor: CommandExecutor;
  skillsDir: string;
}

// 流式聊天处理
export async function* streamChat(
  conversationId: string,
  content: string,
  skillName: string | undefined,
  config: StreamChatConfig
): AsyncGenerator<SSEEvent> {
  const { conversationManager, skillLoader, llmService, commandExecutor, skillsDir } = config;

  const conversation = conversationManager.get(conversationId);
  if (!conversation) {
    yield { type: 'error', data: 'Conversation not found' };
    return;
  }

  // 添加用户消息
  conversationManager.addMessage(conversationId, 'user', content);

  // 获取 skill 的 prompt
  const basePrompt = buildSystemPrompt();
  let systemPrompt = basePrompt;
  if (skillName) {
    const skill = skillLoader.get(skillName);
    if (skill && skill.prompt) {
      systemPrompt = `${skill.prompt}\n\n${basePrompt}`;
    }
  }

  const MAX_ITERATIONS = 20;
  const autoProgress: { tasks: TodoItem[], toolCount: number } = { tasks: [], toolCount: 0 };

  try {
    let iteration = 0;
    let accumulatedResponse = '';
    const toolCache: Map<string, string> = new Map();
    let lastToolKeys: string[] = [];
    let repeatStreak = 0;

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      let currentResponse = '';
      let toolCalls: any[] = [];
      let thinkingContent = '';

      // 流式响应
      const contextMessages = conversationManager.buildContextMessages(conversationId, content);
      for await (const event of llmService.chatStream(contextMessages, systemPrompt, TOOLS)) {
        if (event.type === 'text' && event.content) {
          currentResponse += event.content;
        } else if (event.type === 'thinking' && event.content) {
          thinkingContent += event.content;
          yield { type: 'thinking', data: event.content };
        } else if (event.type === 'tool_use') {
          toolCalls.push({
            id: event.toolId,
            name: event.toolName,
            input: event.toolInput
          });
        } else if (event.type === 'error') {
          yield { type: 'error', data: event.content };
          return;
        }
      }

      accumulatedResponse = currentResponse;

      // 没有工具调用，发送最终响应并结束循环
      if (toolCalls.length === 0) {
        if (accumulatedResponse) {
          yield { type: 'text', data: accumulatedResponse };
        }
        conversationManager.addMessage(conversationId, 'assistant', accumulatedResponse);
        break;
      }

      // 检查是否接近最大迭代次数，询问用户是否继续
      if (iteration >= MAX_ITERATIONS - 1 && toolCalls.length > 0) {
        yield {
          type: 'ask_user',
          data: {
            askId: `continue-${Date.now()}`,
            question: '任务执行了较多步骤，是否继续执行？',
            header: '确认继续',
            options: [
              { label: '继续执行', value: 'continue', description: '继续执行剩余操作' },
              { label: '停止并总结', value: 'stop', description: '停止执行并总结当前结果' },
              { label: '跳过此步骤', value: 'skip', description: '跳过当前工具调用，继续后续操作' }
            ]
          }
        };

        // SSE 模式下不支持实时交互，直接停止
        yield { type: 'text', data: '\n\n[已停止执行] 任务执行步骤较多，如需继续请回复"继续"。' };
        conversationManager.addMessage(conversationId, 'assistant', accumulatedResponse + '\n\n[已停止执行] 任务执行步骤较多，如需继续请回复"继续"。');
        break;
      }

      // 去重当前批次内完全相同的工具调用
      const batchSeen = new Set<string>();
      const uniqueToolCalls: any[] = [];
      for (const tool of toolCalls) {
        const toolKey = `${tool.name}:${stableStringify(tool.input || {})}`;
        if (batchSeen.has(toolKey)) continue;
        batchSeen.add(toolKey);
        uniqueToolCalls.push(tool);
      }
      toolCalls = uniqueToolCalls;

      // 检测重复调用（只在连续 3 次完全相同时才阻止）
      const currentToolKeys = toolCalls.map(t => `${tool.name}:${stableStringify(t.input || {})}`);
      const isSameAsLast = currentToolKeys.length > 0 &&
        currentToolKeys.length === lastToolKeys.length &&
        currentToolKeys.every((k, i) => k === lastToolKeys[i]);

      if (isSameAsLast) {
        repeatStreak++;
      } else {
        repeatStreak = 0;
      }

      // 检查是否是有效的迭代执行（参数不同或结果不同）
      const hasDifferentParams = currentToolKeys.some((k, i) => {
        const lastKey = lastToolKeys[i];
        if (!lastKey || k === lastKey) return false;
        // 如果工具名相同但参数不同，说明是迭代处理不同数据
        const currentToolName = k.split(':')[0];
        const lastToolName = lastKey.split(':')[0];
        return currentToolName === lastToolName && k !== lastKey;
      });

      // 检查工具执行结果是否包含成功/完成标记
      const hasSuccessResult = Array.from(toolCache.values()).some(result => 
        result.includes('成功') || 
        result.includes('完成') || 
        result.includes('已生成') ||
        result.includes('已创建') ||
        result.includes('已保存到')
      );

      // 只在连续 3 次重复且参数完全相同时才阻止（允许迭代执行）
      // 如果参数不同或执行成功，重置重复计数
      if (isSameAsLast && !hasDifferentParams && !hasSuccessResult) {
        if (repeatStreak >= 3) {
          const cachedResults = currentToolKeys.map(k => toolCache.get(k)).filter((v): v is string => !!v);
          let msg = '检测到相同操作重复执行，已停止。请提供更具体的参数或检查输入。';
          if (cachedResults.length > 0) {
            msg += '\n\n最近执行结果：\n' + cachedResults.join('\n\n');
          }
          yield { type: 'text', data: msg };
          conversationManager.addMessage(conversationId, 'assistant', accumulatedResponse + '\n\n' + msg);
          break;
        }
      } else {
        // 参数不同或执行成功，允许继续迭代
        repeatStreak = 0;
      }

      // 有工具调用，保存响应
      if (currentResponse) {
        conversationManager.addMessage(conversationId, 'assistant', currentResponse);
      }

      // 发送进度提示
      const toolNames = toolCalls.map(t => getDetailedTaskDescription(t.name, t.input)).join('、');
      yield { type: 'progress', data: `正在执行: ${toolNames}` };

      // 处理工具调用
      for (const tool of toolCalls) {
        let currentTaskId: string | null = null;

        if (tool.name === 'todo_write') {
          const todos = tool.input?.todos as TodoItem[];
          if (todos && Array.isArray(todos)) {
            autoProgress.tasks = todos;
            yield { type: 'todo', data: todos };
          }
        } else {
          // 自动进度追踪
          const detailedTask = getDetailedTaskDescription(tool.name, tool.input);
          currentTaskId = `auto-${Date.now()}-${autoProgress.toolCount}`;

          // 清理已完成的旧任务
          const completedTasks = autoProgress.tasks.filter(t => t.status === 'completed');
          if (completedTasks.length > 3) {
            autoProgress.tasks = autoProgress.tasks.filter(t => !completedTasks.slice(0, completedTasks.length - 3).includes(t));
          }

          // 标记上一个任务为完成
          const lastInProgress = autoProgress.tasks.find(t => t.status === 'in_progress');
          if (lastInProgress) lastInProgress.status = 'completed';

          autoProgress.tasks.push({
            id: currentTaskId,
            task: detailedTask,
            status: 'in_progress'
          });
          autoProgress.toolCount++;

          yield { type: 'todo', data: autoProgress.tasks };
        }

        const toolKey = `${tool.name}:${stableStringify(tool.input || {})}`;
        let result: string;

        if (toolCache.has(toolKey)) {
          result = toolCache.get(toolKey) || '';
        } else {
          const ctx: ToolContext = {
            conversationId,
            commandExecutor,
            skillsDir,
            skillLoader,
            conversationManager
          };
          result = await executeTool(tool, ctx);
          toolCache.set(toolKey, result);
        }

        // 标记当前任务完成
        if (currentTaskId) {
          const currentTask = autoProgress.tasks.find(t => t.id === currentTaskId);
          if (currentTask) {
            currentTask.status = 'completed';
            yield { type: 'todo', data: autoProgress.tasks };
          }
        }

        // 发送工具结果事件
        yield { type: 'tool_result', data: { name: tool.name, result } };

        // 将工具结果添加到对话
        conversationManager.addMessage(conversationId, 'user', `[工具结果] ${result}`);
      }

      lastToolKeys = currentToolKeys;
    }

    // 标记所有任务完成
    autoProgress.tasks.forEach(t => t.status = 'completed');
    yield { type: 'todo', data: autoProgress.tasks };

    yield { type: 'done', data: {} };
  } catch (error: any) {
    yield { type: 'error', data: error.message };
  }
}

function stableStringify(value: any): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const entries = keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}