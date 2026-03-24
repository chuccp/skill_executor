/**
 * Agent 编排器核心逻辑
 */

import * as path from 'path';
import { ConversationManager } from '../conversation';
import { LLMService } from '../llm';
import { CommandExecutor } from '../commandExecutor';
import { SkillLoader } from '../skillLoader';
import { TOOLS, executeTool, ToolContext } from '../toolExecutor';
import { createModuleLogger } from '../tools/logger';

const logger = createModuleLogger('agent');
import { AgentRole, SubTask, AgentPlan, ReflectionResult, MemoryEntry, SubAgent } from './types';
import { VectorStore } from './vectorStore';
import { getRolePrompt } from './prompts';

/**
 * Agent 编排器
 * 支持多 Agent 协作、自我反思、任务分解和长期记忆
 */
export class AgentOrchestrator {
  private agents: Map<string, SubAgent> = new Map();
  private plans: Map<string, AgentPlan> = new Map();
  private memory: VectorStore;
  private llmService: LLMService;
  private conversationManager: ConversationManager;
  private commandExecutor: CommandExecutor;
  private skillLoader: SkillLoader;
  private skillsDir: string;
  private initialized: Promise<void>;

  constructor(
    llmService: LLMService,
    conversationManager: ConversationManager,
    commandExecutor: CommandExecutor,
    skillLoader: SkillLoader
  ) {
    this.llmService = llmService;
    this.conversationManager = conversationManager;
    this.commandExecutor = commandExecutor;
    this.skillLoader = skillLoader;
    this.skillsDir = path.join(process.cwd(), 'skills');
    this.memory = new VectorStore();
    this.initialized = this.init();
  }

  private async init(): Promise<void> {
    await this.conversationManager.ensureInitialized();
    await this.memory.ensureInitialized();
  }

  // ==================== 规划功能 ====================

  /**
   * 创建执行计划
   */
  async createPlan(goal: string, parentConversationId: string): Promise<AgentPlan> {
    const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // 检索相关记忆
    const relevantMemories = await this.memory.search(goal, 3);
    const memoryContext = relevantMemories.length > 0
      ? `\n\n相关历史经验：\n${relevantMemories.map(m => `- ${m.content}`).join('\n')}`
      : '';

    // 创建规划者代理
    const plannerAgent = await this.spawn({
      id: `${planId}-planner`,
      role: 'planner',
      task: `创建执行计划：${goal}${memoryContext}`,
      parentConversationId
    });

    // 等待规划完成
    const plan = await this.waitForCompletion(plannerAgent.id, 60000);

    // 解析任务列表
    const tasks = this.parseTasksFromResult(plan.result || '');

    const agentPlan: AgentPlan = {
      id: planId,
      goal,
      tasks,
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.plans.set(planId, agentPlan);
    return agentPlan;
  }

  /**
   * 从规划结果解析任务
   */
  private parseTasksFromResult(result: string): SubTask[] {
    const tasks: SubTask[] = [];
    const lines = result.split('\n');

    let taskId = 0;
    for (const line of lines) {
      // 匹配任务列表格式 (如 "1. 任务描述" 或 "- [ ] 任务描述")
      const match = line.match(/^\s*(?:\d+\.|- \[ \]|-)\s*(.+)/);
      if (match) {
        const description = match[1].trim();
        if (description.length > 5) { // 过滤太短的行
          tasks.push({
            id: `task-${taskId++}`,
            description,
            status: 'pending',
            priority: 'medium',
            createdAt: Date.now()
          });
        }
      }
    }

    // 如果没有解析到任务，创建一个默认任务
    if (tasks.length === 0) {
      tasks.push({
        id: 'task-0',
        description: result.substring(0, 200),
        status: 'pending',
        priority: 'high',
        createdAt: Date.now()
      });
    }

    return tasks;
  }

  // ==================== 执行功能 ====================

  /**
   * 执行计划
   */
  async executePlan(
    planId: string,
    parentConversationId: string,
    onProgress?: (update: { task: SubTask; status: string }) => void
  ): Promise<{ success: boolean; results: Record<string, string> }> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`计划不存在：${planId}`);
    }

    plan.status = 'executing';
    plan.updatedAt = Date.now();

    const results: Record<string, string> = {};
    const agentMap: Record<string, string> = {};

    // 按优先级和依赖关系排序任务
    const sortedTasks = this.sortTasks(plan.tasks);

    for (const task of sortedTasks) {
      if (task.status === 'completed') continue;

      // 检查依赖是否完成
      if (task.dependencies) {
        const depsCompleted = task.dependencies.every(
          depId => plan.tasks.find(t => t.id === depId)?.status === 'completed'
        );
        if (!depsCompleted) {
          task.status = 'failed';
          task.result = '依赖任务未完成';
          continue;
        }
      }

      // 更新状态
      task.status = 'in_progress';
      onProgress?.({ task, status: 'started' });

      // 创建执行者代理
      const executorId = `${planId}-exec-${task.id}`;
      agentMap[task.id] = executorId;

      const context = this.buildTaskContext(plan, task, results);

      const executor = await this.spawn({
        id: executorId,
        role: 'executor',
        task: `${task.description}\n\n上下文：\n${context}`,
        parentConversationId
      });

      // 等待执行完成
      const execResult = await this.waitForCompletion(executor.id, 120000);
      task.result = execResult.result || '';
      results[task.id] = task.result;

      // 审查结果
      const review = await this.reviewTask(task, parentConversationId);
      task.status = review.success ? 'completed' : 'failed';
      task.completedAt = Date.now();

      onProgress?.({ task, status: task.status });

      // 如果失败且需要修正，尝试修复
      if (!review.success && review.needsRevision) {
        const fixed = await this.fixTask(task, review, parentConversationId);
        if (fixed) {
          task.status = 'completed';
          task.result = fixed;
          results[task.id] = fixed;
        }
      }

      // 保存成功的经验到长期记忆
      if (task.status === 'completed') {
        await this.memory.add({
          content: `任务：${task.description}\n结果：${task.result}`,
          metadata: {
            type: 'task_result',
            tags: this.extractTags(task.description),
            timestamp: Date.now(),
            conversationId: parentConversationId
          },
          importance: task.priority === 'high' ? 0.8 : 0.5
        });
      }
    }

    // 更新计划状态
    const allCompleted = plan.tasks.every(t => t.status === 'completed');
    plan.status = allCompleted ? 'completed' : 'failed';
    plan.updatedAt = Date.now();

    return {
      success: allCompleted,
      results
    };
  }

  /**
   * 构建任务上下文
   */
  private buildTaskContext(plan: AgentPlan, task: SubTask, results: Record<string, string>): string {
    const parts: string[] = [];

    parts.push(`整体目标：${plan.goal}`);
    parts.push(`当前任务：${task.description}`);

    if (task.dependencies && task.dependencies.length > 0) {
      const depResults = task.dependencies
        .map(depId => `任务 ${depId} 的结果：${results[depId] || '未完成'}`)
        .join('\n');
      parts.push(`依赖任务的结果：\n${depResults}`);
    }

    return parts.join('\n\n');
  }

  /**
   * 任务排序（按优先级和依赖关系）
   */
  private sortTasks(tasks: SubTask[]): SubTask[] {
    // 拓扑排序
    const sorted: SubTask[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (task: SubTask) => {
      if (visited.has(task.id)) return;
      if (visiting.has(task.id)) {
        // 检测到循环依赖，跳过
        return;
      }

      visiting.add(task.id);

      // 先访问依赖
      if (task.dependencies) {
        for (const depId of task.dependencies) {
          const depTask = tasks.find(t => t.id === depId);
          if (depTask) visit(depTask);
        }
      }

      visiting.delete(task.id);
      visited.add(task.id);
      sorted.push(task);
    };

    // 按优先级分组
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sortedByPriority = [...tasks].sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    for (const task of sortedByPriority) {
      visit(task);
    }

    return sorted;
  }

  // ==================== 审查和修正 ====================

  /**
   * 审查任务结果
   */
  private async reviewTask(task: SubTask, parentConversationId: string): Promise<ReflectionResult> {
    const reviewerId = `review-${task.id}-${Date.now()}`;

    const reviewer = await this.spawn({
      id: reviewerId,
      role: 'reviewer',
      task: `审查任务执行结果：

任务描述：${task.description}
执行结果：${task.result || '(无结果)'}

请验证：
1. 任务是否真正完成
2. 结果是否符合预期
3. 是否存在问题需要修正`,
      parentConversationId
    });

    const reviewResult = await this.waitForCompletion(reviewer.id, 60000);

    // 解析审查结果
    return this.parseReviewResult(reviewResult.result || '');
  }

  /**
   * 解析审查结果
   */
  private parseReviewResult(result: string): ReflectionResult {
    const defaultResult: ReflectionResult = {
      success: true,
      issues: [],
      suggestions: [],
      needsRevision: false
    };

    try {
      // 尝试解析 JSON
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: parsed.success ?? defaultResult.success,
          issues: parsed.issues ?? defaultResult.issues,
          suggestions: parsed.suggestions ?? defaultResult.suggestions,
          needsRevision: parsed.needsRevision ?? defaultResult.needsRevision
        };
      }
    } catch {
      // 解析失败，使用简单判断
    }

    // 基于关键词判断
    const hasFailure = /失败 | 错误 | 问题 | 失败 | 失败/i.test(result);
    const needsFix = /需要.*修正 | 需要.*修复 | 建议.*修改/i.test(result);

    return {
      success: !hasFailure,
      issues: hasFailure ? [result.substring(0, 200)] : [],
      suggestions: [],
      needsRevision: needsFix
    };
  }

  /**
   * 修复失败的任务
   */
  private async fixTask(
    task: SubTask,
    review: ReflectionResult,
    parentConversationId: string
  ): Promise<string | null> {
    if (!review.needsRevision) return null;

    const fixerId = `fix-${task.id}-${Date.now()}`;

    const fixer = await this.spawn({
      id: fixerId,
      role: 'executor',
      task: `修复任务执行中的问题：

原始任务：${task.description}
执行结果：${task.result || '(无结果)'}

发现的问题：
${review.issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

改进建议：
${review.suggestions.map((s, idx) => `${idx + 1}. ${s}`).join('\n')}

请根据以上信息修正问题，重新执行任务。`,
      parentConversationId
    });

    const fixResult = await this.waitForCompletion(fixer.id, 120000);

    // 检查修复是否成功
    const fixReview = await this.reviewTask(
      { ...task, result: fixResult.result || '' },
      parentConversationId
    );

    if (fixReview.success) {
      // 保存错误解决方案到记忆
      await this.memory.add({
        content: `问题：${review.issues.join(', ')}\n解决方案：${fixResult.result}`,
        metadata: {
          type: 'error_solution',
          tags: this.extractTags(task.description),
          timestamp: Date.now()
        },
        importance: 0.9
      });
    }

    return fixReview.success ? (fixResult.result || null) : null;
  }

  // ==================== 基础 Agent 操作 ====================

  /**
   * 创建并启动一个子代理
   */
  async spawn(config: {
    id: string;
    role: AgentRole;
    task: string;
    parentConversationId: string;
  }): Promise<SubAgent> {
    const agent: SubAgent = {
      ...config,
      status: 'pending',
      createdAt: Date.now(),
      reflections: []
    };

    this.agents.set(agent.id, agent);
    logger.info(`[Agent] 创建子代理：${agent.id}, 角色：${agent.role}, 任务：${agent.task.substring(0, 50)}...`);

    // 异步执行代理任务
    this.executeAgent(agent).catch(err => {
      logger.error(`[Agent] ${agent.id} 执行失败:`, err);
      agent.status = 'failed';
      agent.result = `执行失败：${err.message}`;
      agent.completedAt = Date.now();
    });

    return agent;
  }

  /**
   * 执行单个子代理
   */
  private async executeAgent(agent: SubAgent) {
    agent.status = 'running';
    logger.info(`[Agent] ${agent.id} 开始执行任务...`);

    try {
      // 为子代理创建独立的对话
      const agentConversation = await this.conversationManager.create();
      agent.conversationId = agentConversation.id;

      // 构建针对角色的系统提示
      const agentPrompt = getRolePrompt(agent.role, agent.task);

      // 检索相关记忆
      const relevantMemories = await this.memory.search(agent.task, 3);
      if (relevantMemories.length > 0) {
        const memoryText = relevantMemories.map(m => m.content).join('\n\n');
        await this.conversationManager.addMessage(
          agent.conversationId,
          'user',
          `[相关经验]\n${memoryText}\n\n请参考以上经验执行任务。`
        );
      }

      // 添加初始用户消息
      await this.conversationManager.addMessage(agent.conversationId, 'user', agent.task);

      // 执行 LLM 调用循环
      const MAX_ITERATIONS = 10;
      let iteration = 0;
      let fullResponse = '';

      while (iteration < MAX_ITERATIONS) {
        iteration++;

        const contextMessages = await this.conversationManager.buildContextMessages(agent.conversationId, agent.task);
        let toolCalls: any[] = [];

        for await (const event of this.llmService.chatStream(contextMessages, agentPrompt, TOOLS)) {
          if (event.type === 'text' && event.content) {
            fullResponse += event.content;
          } else if (event.type === 'tool_use') {
            toolCalls.push({
              id: event.toolId,
              name: event.toolName,
              input: event.toolInput
            });
          } else if (event.type === 'error') {
            throw new Error(event.content);
          }
        }

        // 如果没有工具调用，结束循环
        if (toolCalls.length === 0) {
          break;
        }

        // 执行工具
        const ctx: ToolContext = {
          conversationId: agent.conversationId,
          commandExecutor: this.commandExecutor,
          skillsDir: this.skillsDir,
          skillLoader: this.skillLoader,
          conversationManager: this.conversationManager
        };

        for (const tool of toolCalls) {
          const result = await executeTool(tool, ctx);
          await this.conversationManager.addMessage(agent.conversationId, 'user', `[工具结果] ${result}`);
        }
      }

      // 完成代理任务
      agent.status = 'completed';
      agent.result = fullResponse || '任务执行完成，无具体输出';
      agent.completedAt = Date.now();

      logger.info(`[Agent] ${agent.id} 任务完成`);
    } catch (error: any) {
      agent.status = 'failed';
      agent.result = `执行失败：${error.message}`;
      agent.completedAt = Date.now();
      throw error;
    }
  }

  /**
   * 等待代理完成
   */
  private async waitForCompletion(agentId: string, timeoutMs: number = 300000): Promise<SubAgent> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const agent = this.agents.get(agentId);
      if (!agent) {
        throw new Error(`代理不存在：${agentId}`);
      }

      if (agent.status === 'completed' || agent.status === 'failed') {
        return agent;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`代理执行超时：${agentId}`);
  }

  // ==================== 辅助方法 ====================

  /**
   * 提取标签
   */
  private extractTags(text: string): string[] {
    const keywords = text.toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && w.length <= 10);

    // 简单的关键词提取
    const freq: Record<string, number> = {};
    for (const word of keywords) {
      freq[word] = (freq[word] || 0) + 1;
    }

    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k]) => k);
  }

  /**
   * 获取单个代理的状态
   */
  getAgent(id: string): SubAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * 获取所有代理的状态列表
   */
  getAllAgents(): SubAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * 获取指定父会话的所有子代理
   */
  getAgentsByParent(parentConversationId: string): SubAgent[] {
    return Array.from(this.agents.values()).filter(
      a => a.parentConversationId === parentConversationId
    );
  }

  /**
   * 获取计划
   */
  getPlan(planId: string): AgentPlan | undefined {
    return this.plans.get(planId);
  }

  /**
   * 获取所有计划
   */
  getAllPlans(): AgentPlan[] {
    return Array.from(this.plans.values());
  }

  /**
   * 清理已完成的代理
   */
  cleanup(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, agent] of this.agents.entries()) {
      if (agent.completedAt && (now - agent.completedAt > maxAgeMs)) {
        this.agents.delete(id);
        cleaned++;
      }
    }

    for (const [id, plan] of this.plans.entries()) {
      if (now - plan.updatedAt > maxAgeMs) {
        this.plans.delete(id);
      }
    }

    if (cleaned > 0) {
      logger.info(`[Agent] 清理了 ${cleaned} 个过期代理`);
    }

    return cleaned;
  }

  /**
   * 搜索记忆
   */
  async searchMemory(query: string, limit?: number): Promise<MemoryEntry[]> {
    return this.memory.search(query, limit);
  }

  /**
   * 添加记忆
   */
  async addMemory(content: string, type: MemoryEntry['metadata']['type'], tags: string[], importance?: number): Promise<string> {
    return this.memory.add({
      content,
      metadata: {
        type,
        tags,
        timestamp: Date.now()
      },
      importance: importance ?? 0.5
    });
  }

  // 确保初始化完成
  async ensureInitialized(): Promise<void> {
    await this.initialized;
  }
}
