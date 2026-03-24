/**
 * WebSocket 消息处理器
 * 使用 RxJS 处理流式响应
 */

import {WebSocket} from 'ws';
import {ConversationManager} from '../conversation';
import {SkillLoader} from '../skillLoader';
import {LLMService} from '../llm';
import {CommandExecutor} from '../commandExecutor';
import {AgentOrchestrator} from '../agentOrchestrator';
import {TOOLS, executeTool, ToolContext} from '../toolExecutor';
import {buildSystemPrompt, getDetailedTaskDescription} from '../systemPrompt';
import {TodoItem} from '../tools';
import {SUMMARIZE_THRESHOLD, CONTEXT_PERCENT_THRESHOLD} from '../../config/constants';
import {WSMessage, PendingCommand, PendingQuestion, AutoProgress} from './types';
import {getContextLimit, groupToolsForParallelExecution} from './utils';
import {LockManager} from './asyncLock';
import {createModuleLogger} from '../tools/logger';
import {StreamProcessor, processorManager} from './eventQueue';

const logger = createModuleLogger('ws');

// ==================== 流处理上下文 ====================

interface StreamContext {
    conversationId: string;
    fullResponse: string;
    toolCalls: any[];
    progressStats: {
        currentIteration: number;
        maxIterations: number;
        totalTools: number;
        successfulTools: number;
        failedTools: number;
        isComplete: boolean;
    };
    autoProgress: AutoProgress;
    failedToolPatterns: Map<string, { count: number; lastIteration: number }>;
    iteration: number;
    systemPrompt: string;
}

// ==================== 处理聊天消息 ====================

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
    lockManager?: any
) {
    const {conversationId, content, skillName} = message;
    logger.info('[WS] 收到聊天消息:', {conversationId, content: content?.substring(0, 50), skillName});

    if (!conversationId || !content) {
        ws.send(JSON.stringify({type: 'error', content: 'Missing conversationId or content'}));
        return;
    }

    stoppedConversations?.delete(conversationId);

    let actualConversationId = conversationId;
    let conversation = await conversationManager.get(conversationId);

    if (!conversation) {
        logger.info('[WS] 会话不存在，自动创建新会话:', conversationId);
        conversation = await conversationManager.create();
        actualConversationId = conversation.id;
        ws.send(JSON.stringify({
            type: 'conversation_created',
            conversationId: actualConversationId
        }));
    }

    // 添加用户消息
    await conversationManager.addMessage(actualConversationId, 'user', content);
    ws.send(JSON.stringify({type: 'user_message', content}));

    // 获取系统提示
    const basePrompt = buildSystemPrompt();
    let systemPrompt = basePrompt;
    if (skillName) {
        const skill = skillLoader.get(skillName);
        if (skill && skill.prompt) {
            systemPrompt = `${skill.prompt}\n\n${basePrompt}`;
            logger.info('[WS] 使用技能:', skillName);
        }
    }

    // 初始化上下文
    const ctx: StreamContext = {
        conversationId: actualConversationId,
        fullResponse: '',
        toolCalls: [],
        progressStats: {
            currentIteration: 0,
            maxIterations: 2000,
            totalTools: 0,
            successfulTools: 0,
            failedTools: 0,
            isComplete: false
        },
        autoProgress: {tasks: [], toolCount: 0},
        failedToolPatterns: new Map(),
        iteration: 0,
        systemPrompt
    };

    // 创建 RxJS 流处理器
    const processor = processorManager.get(actualConversationId, {
        concurrency: 3,
        textBufferTime: 50
    });

    // 注册处理器
    setupProcessors(processor, ws, ctx, {
        conversationManager,
        skillLoader,
        llmService,
        commandExecutor,
        skillsDir,
        pendingCommands,
        pendingQuestions,
        agentOrchestrator,
        stoppedConversations,
        lockManager
    });

    try {
        // 检查并压缩上下文
        await checkAndCompressContext(actualConversationId, conversationManager, llmService, ws, lockManager);

        // 主循环
        while (ctx.iteration < ctx.progressStats.maxIterations) {
            if (stoppedConversations?.has(actualConversationId)) {
                logger.info('[WS] 会话被停止:', actualConversationId);
                processor.pushDone('stopped');
                break;
            }

            ctx.iteration++;
            ctx.progressStats.currentIteration = ctx.iteration;
            logger.info(`[WS] 第 ${ctx.iteration} 轮调用...`);

            // 重置本轮状态
            ctx.fullResponse = '';
            ctx.toolCalls = [];

            // 收集流式事件
            const contextMessages = await conversationManager.buildContextMessages(actualConversationId, content);
            const stream = llmService.chatStream(contextMessages, systemPrompt, TOOLS);

            for await (const event of stream) {
                if (stoppedConversations?.has(actualConversationId)) {
                    processor.pushDone('stopped');
                    break;
                }

                // 将流事件推入 RxJS 处理器
                const shouldContinue = processStreamEvent(event, processor, ctx);
                if (!shouldContinue) break;
            }

            // 如果没有工具调用，结束循环
            if (ctx.toolCalls.length === 0) {
                await conversationManager.addMessage(actualConversationId, 'assistant', ctx.fullResponse);
                ctx.progressStats.isComplete = true;
                processor.pushDone('complete');
                break;
            }

            // 推送工具执行任务
            processor.pushToolResult(ctx.toolCalls, ctx.iteration);

            // 等待工具执行完成（不停止处理器）
            await processor.waitForTools(6000000);

            logger.info(`[WS] 第 ${ctx.iteration} 轮工具执行完成，准备下一轮`);
            // 更新进度
            ws.send(JSON.stringify({type: 'progress', progress: ctx.progressStats}));
        }

        // 确保处理器完成
        if (!ctx.progressStats.isComplete) {
            processor.pushDone('max_iterations');
        }

        await processor.waitUntilComplete(50000);

    } catch (error: any) {
        logger.error('[WS] 异常:', error);
        processor.pushError(error.message);
    } finally {
        processorManager.stop(actualConversationId);
    }
}

// ==================== 设置处理器 ====================

function setupProcessors(
    processor: StreamProcessor,
    ws: WebSocket,
    ctx: StreamContext,
    deps: {
        conversationManager: ConversationManager;
        skillLoader: SkillLoader;
        llmService: LLMService;
        commandExecutor: CommandExecutor;
        skillsDir: string;
        pendingCommands: Map<string, PendingCommand>;
        pendingQuestions: Map<string, PendingQuestion>;
        agentOrchestrator?: AgentOrchestrator;
        stoppedConversations?: Set<string>;
        lockManager?: any;
    }
) {
    // 文本处理
    processor.on('text', (event) => {
        ws.send(JSON.stringify({type: 'text', content: event.payload}));
    });

    // 思考处理
    processor.on('thinking', (event) => {
        ws.send(JSON.stringify({type: 'thinking', content: event.payload}));
    });

    // Usage 处理
    processor.on('usage', (event) => {
        const config = deps.llmService.getConfig();
        const model = config.model || 'unknown';
        const contextLimit = getContextLimit(model);
        const contextTokens = event.payload.inputTokens;
        const contextPercent = Math.round((contextTokens / contextLimit) * 100);

        ws.send(JSON.stringify({
            type: 'usage',
            usage: {
                ...event.payload,
                contextTokens,
                contextLimit,
                contextPercent
            }
        }));
    });

    // 错误处理
    processor.on('error', (event) => {
        ws.send(JSON.stringify({type: 'error', content: event.payload}));
    });

    // 完成处理
    processor.on('done', (event) => {
        ctx.autoProgress.tasks.forEach(t => t.status = 'completed');
        ws.send(JSON.stringify({type: 'todo_updated', todos: ctx.autoProgress.tasks}));

        ctx.progressStats.isComplete = true;
        ws.send(JSON.stringify({type: 'progress', progress: ctx.progressStats}));
        ws.send(JSON.stringify({type: 'done'}));
    });

    // 工具执行处理
    processor.on('tool_result', async (event) => {
        const {toolCalls, iteration} = event.payload;
        await executeToolCalls(ws, ctx, toolCalls, iteration, deps);
    });
}

// ==================== 流事件处理 ====================

function processStreamEvent(event: any, processor: StreamProcessor, ctx: StreamContext): boolean {
    if (event.type === 'text' && event.content) {
        ctx.fullResponse += event.content;
        processor.pushText(event.content);
        return true;
    }

    if (event.type === 'thinking' && event.content) {
        processor.pushThinking(event.content);
        return true;
    }

    if (event.type === 'tool_use') {
        ctx.toolCalls.push({
            id: event.toolId,
            name: event.toolName,
            input: event.toolInput
        });
        return true;
    }

    if (event.type === 'usage' && event.usage) {
        processor.pushUsage(event.usage);
        return true;
    }

    if (event.type === 'error') {
        processor.pushError(event.content);
        return false;
    }

    return true;
}

// ==================== 工具执行 ====================

async function executeToolCalls(
    ws: WebSocket,
    ctx: StreamContext,
    toolCalls: any[],
    iteration: number,
    deps: {
        conversationManager: ConversationManager;
        skillLoader: SkillLoader;
        llmService: LLMService;
        commandExecutor: CommandExecutor;
        skillsDir: string;
        pendingCommands: Map<string, PendingCommand>;
        pendingQuestions: Map<string, PendingQuestion>;
        agentOrchestrator?: AgentOrchestrator;
        stoppedConversations?: Set<string>;
        lockManager?: any;
    }
) {
    const {
        conversationManager,
        commandExecutor,
        skillsDir,
        skillLoader,
        pendingCommands,
        pendingQuestions,
        agentOrchestrator,
        lockManager
    } = deps;

    ctx.progressStats.totalTools += toolCalls.length;

    // 工具分组
    const toolGroups = groupToolsForParallelExecution(toolCalls);
    logger.info(`[WS] 工具分组：${toolGroups.length} 组`);

    // 获取锁
    const conversationLock = lockManager?.getLock(ctx.conversationId);
    logger.info('[WS] 等待获取锁，当前状态:', {
        locked: conversationLock?.isLocked(),
        waiting: conversationLock?.getWaitingCount()
    });
    await conversationLock?.acquire();
    logger.info('[WS] 锁已获取');

    try {
        for (const [groupIndex, group] of toolGroups.entries()) {
            logger.info(`[WS] 执行第 ${groupIndex + 1} 组，共 ${group.length} 个工具`);

            const taskIds: Map<string, string> = new Map();

            // 创建任务
            for (const tool of group) {
                logger.info('[WS] 工具:', tool.name);

                if (tool.name === 'todo_write') {
                    const todos = tool.input?.todos as TodoItem[];
                    if (todos && Array.isArray(todos)) {
                        ctx.autoProgress.tasks = todos;
                        ws.send(JSON.stringify({type: 'todo_updated', todos}));
                    }
                } else {
                    const detailedTask = getDetailedTaskDescription(tool.name, tool.input);
                    const currentTaskId = `auto-${Date.now()}-${ctx.autoProgress.toolCount}`;
                    taskIds.set(tool.id, currentTaskId);

                    ctx.autoProgress.tasks.push({
                        id: currentTaskId,
                        task: detailedTask,
                        status: 'in_progress'
                    });
                    ctx.autoProgress.toolCount++;
                }
            }

            if (ctx.autoProgress.tasks.length > 10) {
                ctx.autoProgress.tasks = ctx.autoProgress.tasks.filter(t => t.status === 'in_progress');
            }

            ws.send(JSON.stringify({type: 'todo_updated', todos: ctx.autoProgress.tasks}));

            // 执行工具（并行执行，但逐个更新状态）
            const executeToolWithCtx = async (tool: any): Promise<{
                toolId: string;
                result: string;
                error?: string
            }> => {
                const currentTaskId = taskIds.get(tool.id);

                try {
                    const toolCtx: ToolContext = {
                        conversationId: ctx.conversationId,
                        commandExecutor,
                        skillsDir,
                        skillLoader,
                        conversationManager,
                        ws,
                        pendingCommands,
                        pendingQuestions,
                        agentOrchestrator
                    };
                    const result = await executeTool(tool, toolCtx);

                    // 执行成功，立即更新任务状态
                    if (currentTaskId) {
                        const task = ctx.autoProgress.tasks.find(t => t.id === currentTaskId);
                        if (task) {
                            task.status = 'completed';
                            ws.send(JSON.stringify({type: 'todo_updated', todos: ctx.autoProgress.tasks}));
                        }
                    }

                    return {toolId: tool.id, result};
                } catch (error: any) {
                    logger.error(`[WS] 工具 ${tool.name} 异常:`, error.message);

                    // 执行失败，立即更新任务状态
                    if (currentTaskId) {
                        const task = ctx.autoProgress.tasks.find(t => t.id === currentTaskId);
                        if (task) {
                            task.status = 'failed';
                            ws.send(JSON.stringify({type: 'todo_updated', todos: ctx.autoProgress.tasks}));
                        }
                    }

                    return {toolId: tool.id, result: `[failed] ${error.message}`, error: error.message};
                }
            };

            // 并行执行，每个工具完成后会自动推送状态更新
            const settledResults = await Promise.allSettled(group.map(executeToolWithCtx));
            const results: { toolId: string; result: string; error?: string }[] = [];

            for (let i = 0; i < settledResults.length; i++) {
                const settled = settledResults[i];
                const tool = group[i];

                if (settled.status === 'fulfilled') {
                    results.push(settled.value);
                } else {
                    results.push({
                        toolId: tool.id,
                        result: `[failed] ${settled.reason?.message || 'unknown error'}`,
                        error: settled.reason?.message || 'unknown error'
                    });
                }
            }

            // 处理结果
            for (const {toolId, result, error} of results) {
                const toolCall = group.find(t => t.id === toolId);

                if (error) {
                    const toolName = toolCall?.name || 'unknown';
                    const failureInfo = ctx.failedToolPatterns.get(toolName) || {count: 0, lastIteration: iteration};
                    failureInfo.count += 1;
                    ctx.failedToolPatterns.set(toolName, failureInfo);
                    ctx.progressStats.failedTools += 1;

                    logger.warn(`[WS] 工具 ${toolName} 失败 (累计 ${failureInfo.count} 次)`);
                } else {
                    ctx.failedToolPatterns.delete(toolCall?.name || 'unknown');
                    ctx.progressStats.successfulTools += 1;
                }

                // 发送结果
                if (toolCall) {
                    if (toolCall.name === 'play_media') {
                        ws.send(JSON.stringify({type: 'media_result', markdown: result}));
                    }
                    ws.send(JSON.stringify({type: 'tool_result', name: toolCall.name, result}));
                    await conversationManager.addMessage(ctx.conversationId, 'user', `[工具结果] ${result}`);
                }
            }
        }
    } finally {
        conversationLock?.release();
        logger.info('[WS] 锁已释放');
    }
}

// ==================== 上下文压缩 ====================

async function checkAndCompressContext(
    conversationId: string,
    conversationManager: ConversationManager,
    llmService: LLMService,
    ws: WebSocket,
    lockManager?: any
) {
    const convData = await conversationManager.get(conversationId);
    const config = llmService.getConfig();
    const model = config.model || 'unknown';
    const contextLimit = getContextLimit(model);

    if (!convData) return;

    const messages = convData.messages;
    const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    const estimatedTokens = Math.round(totalChars / 4);
    const contextPercent = Math.round((estimatedTokens / contextLimit) * 100);

    const needCompressByPercent = contextPercent > CONTEXT_PERCENT_THRESHOLD;
    // const needCompressByCount = messages.length > SUMMARIZE_THRESHOLD;

    if (needCompressByPercent) {
        const conversationLock = lockManager?.getLock(conversationId);
        const lockAcquired = conversationLock?.tryAcquire() ?? true;

        if (lockAcquired) {
            try {
                logger.info(`[WS] 触发上下文压缩 (${contextPercent}%, ${messages.length} 条)`);
                const compressed = await conversationManager.compress(conversationId, llmService);
                if (compressed) {
                    ws.send(JSON.stringify({
                        type: 'context_compressed',
                        content: `上下文已压缩（${contextPercent}% → 约${Math.round(contextPercent * 0.3)}%）`
                    }));
                }
            } finally {
                conversationLock?.release();
            }
        }
    }
}

// ==================== 其他处理器 ====================

export async function handleConfirmCommand(
    ws: WebSocket,
    message: WSMessage,
    commandExecutor: CommandExecutor,
    pendingCommands: Map<string, PendingCommand>
) {
    const {confirmId, approved} = message;

    if (!confirmId) {
        ws.send(JSON.stringify({type: 'error', content: '缺少确认ID'}));
        return;
    }

    const pending = pendingCommands.get(confirmId);
    if (!pending) {
        ws.send(JSON.stringify({type: 'error', content: '确认请求已过期'}));
        return;
    }

    pendingCommands.delete(confirmId);

    if (pending.action === 'delete' || pending.action === 'git_commit') {
        pending.resolve(approved ?? false);
        if (approved) {
            ws.send(JSON.stringify({type: 'command_confirmed', action: pending.action}));
        } else {
            ws.send(JSON.stringify({type: 'command_cancelled', command: pending.command}));
        }
        return;
    }

    if (approved) {
        ws.send(JSON.stringify({type: 'command_start', command: pending.command}));
        const result = await commandExecutor.execute(pending.command);
        ws.send(JSON.stringify({
            type: 'command_result',
            command: pending.command,
            success: result.success,
            stdout: result.stdout,
            stderr: result.stderr
        }));

        const output = result.success ? (result.stdout || '(无输出)') : `错误: ${result.stderr || result.stdout}`;
        pending.resolve(`命令: ${pending.command}\n${output}`);
    } else {
        ws.send(JSON.stringify({type: 'command_cancelled', command: pending.command}));
        pending.resolve('命令已被用户取消');
    }
}

export function handleAskResponse(
    ws: WebSocket,
    message: WSMessage,
    pendingQuestions: Map<string, PendingQuestion>
) {
    const {askId, answer} = message;

    logger.info('[handleAskResponse] 收到用户回答:', {askId, answer});

    if (!askId) {
        ws.send(JSON.stringify({type: 'error', content: '缺少问题ID'}));
        return;
    }

    const pending = pendingQuestions.get(askId);
    if (!pending) {
        logger.warn('[handleAskResponse] 未找到对应的问题:', askId);
        ws.send(JSON.stringify({type: 'error', content: '问题已过期'}));
        return;
    }

    pendingQuestions.delete(askId);
    pending.resolve(answer);
}

export function handleConfig(ws: WebSocket, message: WSMessage, llmService: LLMService) {
    if (message.config) {
        llmService.updateConfig(message.config);
        ws.send(JSON.stringify({type: 'config_updated', config: llmService.getConfig()}));
    }
}