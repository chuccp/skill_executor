/**
 * WebSocket 消息处理器
 */

import { WebSocket } from 'ws';
import { ConversationManager } from '../conversation';
import { SkillLoader } from '../skillLoader';
import { LLMService } from '../llm';
import { CommandExecutor } from '../commandExecutor';
import { AgentOrchestrator } from '../agentOrchestrator';
import { TOOLS, executeTool, ToolContext } from '../toolExecutor';
import { buildSystemPrompt, getDetailedTaskDescription } from '../systemPrompt';
import { TodoItem } from '../tools';
import { SUMMARIZE_THRESHOLD, CONTEXT_PERCENT_THRESHOLD } from '../../config/constants';
import { WSMessage, PendingCommand, PendingQuestion, AutoProgress } from './types';
import { getContextLimit, groupToolsForParallelExecution } from './utils';
import { LockManager } from './asyncLock'; // P1: 导入锁管理器

/**
 * 处理聊天消息
 */
export async function handleChat(
  ws: WebSocket,
  message: WSMessage,
  conversationManager: ConversationManager,
  skillLoader: SkillLoader,
  llmService: LLMService,
  commandExecutor: CommandExecutor,
  skillsDir: string,
  pendingCommands: Map<string, PendingCommand>,
  pendingQuestions: Map<string, PendingQuestion>,
  agentOrchestrator?: AgentOrchestrator,
  stoppedConversations?: Set<string>,
  lockManager?: any // P1: 添加锁管理器参数
) {
  const { conversationId, content, skillName } = message;
  console.log('[WS] 收到聊天消息:', { conversationId, content: content?.substring(0, 50), skillName });

  if (!conversationId || !content) {
    ws.send(JSON.stringify({ type: 'error', content: 'Missing conversationId or content' }));
    return;
  }

  // 清除停止标记
  stoppedConversations?.delete(conversationId);

  let actualConversationId = conversationId;
  let conversation = await conversationManager.get(conversationId);

  if (!conversation) {
    // 会话不存在，自动创建新会话
    console.log('[WS] 会话不存在，自动创建新会话:', conversationId);
    conversation = await conversationManager.create();
    actualConversationId = conversation.id;
    // 通知前端新会话已创建
    ws.send(JSON.stringify({
      type: 'conversation_created',
      conversationId: actualConversationId
    }));
  }

  // 检查锁状态（调试日志）
  const conversationLock = lockManager?.getLock(actualConversationId);
  console.log('[WS] 锁状态:', { locked: conversationLock?.isLocked(), waiting: conversationLock?.getWaitingCount() });

  // 添加用户消息
  await conversationManager.addMessage(actualConversationId, 'user', content);
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
  const autoProgress: AutoProgress = { tasks: [], toolCount: 0 };
  
  // P1 修复：详细进度报告统计
  let progressStats = {
    currentIteration: 0,
    maxIterations: MAX_ITERATIONS,
    totalTools: 0,
    successfulTools: 0,
    failedTools: 0,
    isComplete: false
  };
  
  // P0 修复：跟踪工具失败模式以检测死循环
  const failedToolPatterns = new Map<string, { count: number; lastIteration: number }>();
  const toolCallHistory: string[] = []; // 记录最近的工具调用，检测重复
  const FAILURE_THRESHOLD = 3; // 同一工具连续失败 3 次则终止
  const MAX_LOOP_STALL_ITERATIONS = 3; // 相同工具调用重复 3 次则终止

  // 在请求前检查是否需要压缩上下文
  const convData = await conversationManager.get(actualConversationId);
  const config = llmService.getConfig();
  const model = config.model || 'unknown';
  const contextLimit = getContextLimit(model);

  if (convData) {
    const messages = convData.messages;

    // 估算当前上下文的 token 数量（约 1 token ≈ 4 字符）
    const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    const estimatedTokens = Math.round(totalChars / 4);
    const contextPercent = Math.round((estimatedTokens / contextLimit) * 100);

    // 检查是否需要压缩
    const needCompressByPercent = contextPercent > CONTEXT_PERCENT_THRESHOLD;
    const needCompressByCount = messages.length > SUMMARIZE_THRESHOLD;

    if (needCompressByPercent || needCompressByCount) {
      // P1 修复：只有需要压缩时才获取锁
      const conversationLock = lockManager?.getLock(actualConversationId);
      const lockAcquired = conversationLock?.tryAcquire() ?? true;

      if (lockAcquired) {
        try {
          if (needCompressByPercent) {
            console.log(`[WS] 上下文使用 ${contextPercent}% (${estimatedTokens} tokens) 超过阈值 ${CONTEXT_PERCENT_THRESHOLD}%，触发压缩`);
          } else {
            console.log(`[WS] 消息数量 ${messages.length} 超过阈值 ${SUMMARIZE_THRESHOLD}，触发压缩`);
          }
          const compressed = await conversationManager.compress(actualConversationId, llmService);
          if (compressed) {
            ws.send(JSON.stringify({
              type: 'context_compressed',
              content: needCompressByPercent
                ? `上下文已压缩（${contextPercent}% → 约${Math.round(contextPercent * 0.3)}%）`
                : `上下文已压缩（${messages.length} 条消息 → 约 20 条）`
            }));
          }
        } finally {
          conversationLock?.release();
        }
      } else {
        console.log(`[WS] 工具执行在进行中，跳过上下文压缩检查`);
      }
    }
  }

  try {
    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
      // 检查是否被停止
      if (stoppedConversations?.has(actualConversationId)) {
        console.log('[WS] 会话被停止:', actualConversationId);
        return;
      }

      iteration++;
      progressStats.currentIteration = iteration; // P1: 更新当前迭代
      console.log(`[WS] 第 ${iteration} 轮调用...`);

      let fullResponse = '';
      let toolCalls: any[] = [];

      // 流式响应 + P0 超时保护 (5 分钟)
      const streamTimeout = 300000; // 5 分钟毫秒
      const contextMessages = await conversationManager.buildContextMessages(actualConversationId, content);
      const stream = llmService.chatStream(contextMessages, systemPrompt, TOOLS);
      
      let streamAborted = false;
      const timeoutId = setTimeout(() => {
        streamAborted = true;
        console.warn('[WS] LLM 流超时（5分钟），强制终止迭代');
        ws.send(JSON.stringify({ 
          type: 'error', 
          content: 'LLM 流式处理超时（>5分钟），已终止此轮对话' 
        }));
      }, streamTimeout);

      for await (const event of stream) {
        if (streamAborted) break;
        // 检查是否被停止
        if (stoppedConversations?.has(actualConversationId)) {
          console.log('[WS] 会话被停止:', actualConversationId);
          return;
        }

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
        } else if (event.type === 'usage' && event.usage) {
          // 添加上下文信息
          const config = llmService.getConfig();
          const model = config.model || 'unknown';
          const contextLimit = getContextLimit(model);
          const contextTokens = event.usage.inputTokens;
          const contextPercent = Math.round((contextTokens / contextLimit) * 100);

          ws.send(JSON.stringify({
            type: 'usage',
            usage: {
              ...event.usage,
              contextTokens,
              contextLimit,
              contextPercent
            }
          }));
        } else if (event.type === 'error') {
          console.error('[WS] 流式错误:', event.content);
          ws.send(JSON.stringify({ type: 'error', content: event.content }));
          return;
        }
      }

      // 清除超时计时器
      clearTimeout(timeoutId);
      if (streamAborted) break; // 如果超时，终止迭代
      
      console.log('[WS] AI完整响应:', fullResponse);
      console.log('[WS] 响应长度:', fullResponse.length, '工具调用:', toolCalls.length);

      // 如果没有工具调用，结束循环
      if (toolCalls.length === 0) {
        await conversationManager.addMessage(actualConversationId, 'assistant', fullResponse);
        
        // P1: 发送最终进度报告
        progressStats.isComplete = true;
        ws.send(JSON.stringify({ type: 'progress', progress: progressStats }));
        
        break;
      }
      
      // P1: 更新总工具数量
      progressStats.totalTools += toolCalls.length;

      // toolCalls.forEach((toolCall)=>{
      //   console.log(`[WS] 工具调用: ${toolCall.name}:${JSON.stringify(toolCall.input).substring(0, 50)}`);
      // })
      
      // P0 修复：检测循环停滞（相同工具重复调用）
      // const toolCallKey = toolCalls.map(t => `${t.name}:${JSON.stringify(t.input).substring(0, 20)}`).join('|');
      // toolCallHistory.push(toolCallKey);
      // if (toolCallHistory.length > 3) {
      //   toolCallHistory.shift();
      // }
      
      // // 如果最近 3 次工具调用都相同 => 死循环
      // if (toolCallHistory.length === 3 &&
      //     toolCallHistory[0] === toolCallHistory[1] &&
      //     toolCallHistory[1] === toolCallHistory[2]) {
      //   console.warn('[WS] 检测到工具调用死循环！相同工具连续 3 次未改变');
      //   ws.send(JSON.stringify({
      //     type: 'error',
      //     content: 'LLM 陷入循环：相同工具调用重复 3 次未改变，已自动终止'
      //   }));
      //   if (fullResponse) {
      //     await conversationManager.addMessage(actualConversationId, 'assistant', fullResponse);
      //   }
      //   break;
      // }

      // 并行执行优化：将工具调用分组
      const toolGroups = groupToolsForParallelExecution(toolCalls);
      console.log(`[WS] 工具分组：${toolGroups.length} 组`);

      // P1 修复：在工具执行期间获取锁，防止上下文压缩干扰
      const conversationLock = lockManager?.getLock(actualConversationId);
      console.log('[WS] 等待获取锁...', { locked: conversationLock?.isLocked(), waiting: conversationLock?.getWaitingCount() });
      await conversationLock?.acquire();
      console.log('[WS] 锁已获取，开始执行工具');

      try {
        // 按组执行工具（组内并行，组间串行）
        for (const [groupIndex, group] of toolGroups.entries()) {
          console.log(`[WS] 执行第 ${groupIndex + 1} 组，共 ${group.length} 个工具`);

        // 为组内每个工具创建任务跟踪
        const taskIds: Map<string, string> = new Map();

        for (const tool of group) {
          console.log('[WS] 工具:', tool.name, JSON.stringify(tool.input).substring(0, 100));

          if (tool.name === 'todo_write') {
            const todos = tool.input?.todos as TodoItem[];
            if (todos && Array.isArray(todos)) {
              autoProgress.tasks = todos;
              ws.send(JSON.stringify({ type: 'todo_updated', todos }));
            }
          } else {
            // 自动添加进度任务
            const detailedTask = getDetailedTaskDescription(tool.name, tool.input);
            const currentTaskId = `auto-${Date.now()}-${autoProgress.toolCount}`;
            taskIds.set(tool.id, currentTaskId);

            // 添加新任务（并行执行时不标记上一个任务完成，等结果返回时再标记）
            autoProgress.tasks.push({
              id: currentTaskId,
              task: detailedTask,
              status: 'in_progress'
            });
            autoProgress.toolCount++;
          }
        }

        // 清理过多的已完成任务（保留 in_progress 的）
        if (autoProgress.tasks.length > 10) {
          autoProgress.tasks = autoProgress.tasks.filter(t => t.status === 'in_progress');
        }

        // 发送任务更新
        ws.send(JSON.stringify({ type: 'todo_updated', todos: autoProgress.tasks }));

        // 并行执行组内所有工具 - P0 修复：添加单个工具的异常处理
        const executeToolWithCtx = async (tool: any): Promise<{ toolId: string; result: string; error?: string }> => {
            try {
              const ctx: ToolContext = {
                conversationId: actualConversationId,
                commandExecutor,
                skillsDir,
                skillLoader,
                conversationManager,
                ws,
                pendingCommands,
                pendingQuestions,
                agentOrchestrator
              };
              const result = await executeTool(tool, ctx);
              return { toolId: tool.id, result };
            } catch (error: any) {
              console.error(`[WS] 工具 ${tool.name} 执行异常:`, error.message);
              return { 
                toolId: tool.id, 
                result: `[failed] ${error.message}`,
                error: error.message
              };
            }
          };

          // P0 修复：改用 Promise.allSettled 避免单个失败导致整组工具无法执行
          const settledResults = await Promise.allSettled(group.map(executeToolWithCtx));
          const results: { toolId: string; result: string; error?: string }[] = [];
          
          for (let i = 0; i < settledResults.length; i++) {
            const settled = settledResults[i];
            const tool = group[i];
            
            if (settled.status === 'fulfilled') {
              results.push(settled.value);
            } else {
              console.error(`[WS] 工具 ${tool.name} Promise 被拒绝:`, settled.reason);
              results.push({
                toolId: tool.id,
                result: `[failed] ${settled.reason?.message || 'unknown error'}`,
                error: settled.reason?.message || 'unknown error'
              });
            }
          }

          // 处理结果
          let shouldEndTurn = false;
          let failureCount = 0;
          
          for (const { toolId, result, error } of results) {
          // P0 修复：跟踪工具失败模式
          const toolCall = group.find(t => t.id === toolId);
          if (error) {
            const toolName = toolCall?.name || 'unknown';
            const failureInfo = failedToolPatterns.get(toolName) || { count: 0, lastIteration: iteration };
            failureInfo.count += 1;
            failureInfo.lastIteration = iteration;
            failedToolPatterns.set(toolName, failureInfo);
            failureCount += 1;
            
            // P1: 更新失败工具计数
            progressStats.failedTools += 1;
            
            console.warn(`[WS] 工具 ${toolName} 失败 (累计 ${failureInfo.count} 次)`);
            
            // 如果同一工具连续失败 3 次，停止使用这个工具
            if (failureInfo.count >= FAILURE_THRESHOLD) {
              console.error(`[WS] 工具 ${toolName} 连续失败 ${FAILURE_THRESHOLD} 次，自动终止迭代`);
              ws.send(JSON.stringify({ 
                type: 'error', 
                content: `工具 ${toolName} 连续失败 ${FAILURE_THRESHOLD} 次，已自动终止此轮对话` 
              }));
              shouldEndTurn = true;
              break;
            }
          } else {
            // 工具成功，重置失败计数
            const toolName = toolCall?.name || 'unknown';
            failedToolPatterns.delete(toolName);
            
            // P1: 更新成功工具计数
            progressStats.successfulTools += 1;
          }
          
          // 检查是否是 ask_user 的 _endTurn 标记
          try {
            const parsed = JSON.parse(result);
            if (parsed._endTurn) {
              console.log('[WS] ask_user 返回，结束当前轮');
              shouldEndTurn = true;
              continue; // 跳过这个工具结果的处理
            }
          } catch {
            // 不是 JSON，正常处理
          }

          // 标记对应任务完成
          const currentTaskId = taskIds.get(toolId);
          if (currentTaskId) {
            const currentTask = autoProgress.tasks.find(t => t.id === currentTaskId);
            if (currentTask) {
              currentTask.status = error ? 'failed' : 'completed';
              ws.send(JSON.stringify({ type: 'todo_updated', todos: autoProgress.tasks }));
            }
          }

          // 发送 tool_result 事件给前端
          if (toolCall) {
            if (error) {
              console.error('[WS] Tool result for', toolCall.name, ': FAILED -', error);
            } else {
              console.log('[WS] Tool result for', toolCall.name, ': SUCCESS');
            }

            // play_media 直接追加 markdown 到 AI 消息
            if (toolCall.name === 'play_media') {
              // 直接通过前端追加媒体 markdown
              ws.send(JSON.stringify({
                type: 'media_result',
                markdown: result
              }));
            }

            const wsMsg = {
              type: 'tool_result',
              name: toolCall.name,
              result: result
            };
            ws.send(JSON.stringify(wsMsg));

            // 将工具结果作为用户消息添加到对话
            await conversationManager.addMessage(actualConversationId, 'user', `[工具结果] ${result}`);
          }
        }

        // 如果检测到 _endTurn，结束当前轮
        if (shouldEndTurn) {
          // 保存当前 AI 消息（如果有内容的话）
          if (fullResponse) {
            await conversationManager.addMessage(actualConversationId, 'assistant', fullResponse);
          }
          autoProgress.tasks.forEach(t => t.status = 'completed');
          ws.send(JSON.stringify({ type: 'todo_updated', todos: autoProgress.tasks }));
          
          // P1: 发送最终进度报告
          progressStats.isComplete = true;
          ws.send(JSON.stringify({ type: 'progress', progress: progressStats }));
          
          ws.send(JSON.stringify({ type: 'done' }));
          return; // 结束整个 handleChat 函数
        }
      }
      } finally {
        // P1 修复：释放锁，允许下一次压缩
        console.log('[WS] finally 块执行，释放锁');
        conversationLock?.release();
        console.log('[WS] 锁已释放，状态:', { locked: conversationLock?.isLocked() });
      }
      
      // P1: 每次迭代结束时发送进度更新
      ws.send(JSON.stringify({ type: 'progress', progress: progressStats }));
    }

    // 标记所有任务完成
    autoProgress.tasks.forEach(t => t.status = 'completed');
    ws.send(JSON.stringify({ type: 'todo_updated', todos: autoProgress.tasks }));

    // P1: 发送最终进度报告
    progressStats.isComplete = true;
    ws.send(JSON.stringify({ type: 'progress', progress: progressStats }));

    ws.send(JSON.stringify({ type: 'done' }));
  } catch (error: any) {
    console.error('[WS] 异常:', error);
    ws.send(JSON.stringify({ type: 'error', content: error.message }));
  }
}

/**
 * 处理命令确认
 */
export async function handleConfirmCommand(
  ws: WebSocket,
  message: WSMessage,
  commandExecutor: CommandExecutor,
  pendingCommands: Map<string, PendingCommand>
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

  // 对于需要特殊处理的操作（如 delete, git_commit），直接传递确认结果
  if (pending.action === 'delete' || pending.action === 'git_commit') {
    pending.resolve(approved ?? false);
    if (approved) {
      ws.send(JSON.stringify({ type: 'command_confirmed', action: pending.action }));
    } else {
      ws.send(JSON.stringify({ type: 'command_cancelled', command: pending.command }));
    }
    return;
  }

  // 普通的 bash 命令确认，执行命令并返回结果
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

/**
 * 处理用户回答
 */
export function handleAskResponse(
  ws: WebSocket,
  message: WSMessage,
  pendingQuestions: Map<string, PendingQuestion>
) {
  const { askId, answer } = message;

  console.log('[handleAskResponse] 收到用户回答:', { askId, answer });

  if (!askId) {
    ws.send(JSON.stringify({ type: 'error', content: '缺少问题ID' }));
    return;
  }

  const pending = pendingQuestions.get(askId);
  if (!pending) {
    console.warn('[handleAskResponse] 未找到对应的问题:', askId);
    ws.send(JSON.stringify({ type: 'error', content: '问题已过期' }));
    return;
  }

  console.log('[handleAskResponse] resolve Promise, askId:', askId);
  pendingQuestions.delete(askId);
  pending.resolve(answer);
}

/**
 * 处理配置更新
 */
export function handleConfig(ws: WebSocket, message: WSMessage, llmService: LLMService) {
  if (message.config) {
    llmService.updateConfig(message.config);
    ws.send(JSON.stringify({ type: 'config_updated', config: llmService.getConfig() }));
  }
}