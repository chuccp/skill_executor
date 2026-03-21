import { ConversationManager } from './conversation';
import { LLMService } from './llm';
import { CommandExecutor } from './commandExecutor';
import { SkillLoader } from './skillLoader';
import { TOOLS, executeTool, ToolContext } from './toolExecutor';
import { buildSystemPrompt } from './systemPrompt';
import { TodoItem } from './tools';
import * as path from 'path';

/**
 * 子代理状态
 */
export interface SubAgent {
  id: string;
  type: 'explore' | 'code' | 'research';
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  createdAt: number;
  completedAt?: number;
  parentConversationId: string;
}

/**
 * 子代理编排器
 * 负责创建、管理和协调多个子代理的执行
 */
export class AgentOrchestrator {
  private agents: Map<string, SubAgent> = new Map();
  private llmService: LLMService;
  private conversationManager: ConversationManager;
  private commandExecutor: CommandExecutor;
  private skillLoader: SkillLoader;
  private skillsDir: string;

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
  }

  /**
   * 创建并启动一个子代理
   */
  async spawn(config: {
    id: string;
    type: 'explore' | 'code' | 'research';
    task: string;
    parentConversationId: string;
  }): Promise<SubAgent> {
    const agent: SubAgent = {
      ...config,
      status: 'pending',
      createdAt: Date.now()
    };

    this.agents.set(agent.id, agent);
    console.log(`[Agent] 创建子代理: ${agent.id}, 类型：${agent.type}, 任务：${agent.task}`);

    // 异步执行代理任务
    this.executeAgent(agent).catch(err => {
      console.error(`[Agent] ${agent.id} 执行失败:`, err);
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
    console.log(`[Agent] ${agent.id} 开始执行任务...`);

    try {
      // 为子代理创建独立的对话
      const agentConversation = this.conversationManager.create();
      const agentConvId = agentConversation.id;

      // 构建针对代理类型的系统提示
      const agentPrompt = this.buildAgentPrompt(agent.type, agent.task);

      // 添加初始用户消息
      this.conversationManager.addMessage(agentConvId, 'user', agent.task);

      // 执行 LLM 调用循环（简化版，最多 5 轮）
      const MAX_ITERATIONS = 5;
      let iteration = 0;
      let fullResponse = '';

      while (iteration < MAX_ITERATIONS) {
        iteration++;

        const contextMessages = this.conversationManager.buildContextMessages(agentConvId, agent.task);
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

        // 执行工具（串行，简化的上下文处理）
        const ctx: ToolContext = {
          conversationId: agentConvId,
          commandExecutor: this.commandExecutor,
          skillsDir: this.skillsDir,
          skillLoader: this.skillLoader,
          conversationManager: this.conversationManager
        };

        for (const tool of toolCalls) {
          const result = await executeTool(tool, ctx);
          this.conversationManager.addMessage(agentConvId, 'user', `[工具结果] ${result}`);
        }
      }

      // 完成代理任务
      agent.status = 'completed';
      agent.result = fullResponse || '任务执行完成，无具体输出';
      agent.completedAt = Date.now();

      console.log(`[Agent] ${agent.id} 任务完成`);
    } catch (error: any) {
      agent.status = 'failed';
      agent.result = `执行失败：${error.message}`;
      agent.completedAt = Date.now();
      throw error;
    }
  }

  /**
   * 根据代理类型构建专门的系统提示
   */
  private buildAgentPrompt(agentType: string, task: string): string {
    const basePrompt = buildSystemPrompt();

    const typePrompts: Record<string, string> = {
      explore: `你是一个探索型助手，专注于理解代码库结构、分析文件内容和发现关键信息。
你的任务是：${task}

请优先使用以下工具：
- list_directory: 浏览目录结构
- read_file: 读取文件内容
- glob: 搜索特定类型的文件
- grep: 查找代码中的模式

在探索过程中，请记录重要的发现和文件路径。`,

      code: `你是一个编程型助手，专注于编写、修改和测试代码。
你的任务是：${task}

请优先使用以下工具：
- read_file: 先阅读现有代码
- write_file/replace/edit: 创建或修改代码
- bash: 运行测试或构建命令

确保代码质量，遵循最佳实践。`,

      research: `你是一个研究型助手，专注于收集信息、分析文档和提供深度见解。
你的任务是：${task}

请优先使用以下工具：
- web_search: 搜索网络信息
- web_fetch: 获取网页内容
- read_file: 阅读本地文档
- glob/grep: 查找相关信息

请提供详细、准确的分析报告。`
    };

    const typePrompt = typePrompts[agentType] || typePrompts.explore;

    return `${typePrompt}\n\n${basePrompt}`;
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
   * 等待指定的多个代理完成并聚合结果
   */
  async gatherResults(agentIds: string[], timeoutMs: number = 300000): Promise<Record<string, string>> {
    const startTime = Date.now();
    const results: Record<string, string> = {};

    while (Date.now() - startTime < timeoutMs) {
      let allCompleted = true;
      let hasFailure = false;

      for (const id of agentIds) {
        const agent = this.agents.get(id);
        if (!agent) {
          results[id] = '错误：代理不存在';
          continue;
        }

        if (agent.status === 'completed') {
          results[id] = agent.result || '';
        } else if (agent.status === 'failed') {
          results[id] = agent.result || '执行失败';
          hasFailure = true;
        } else {
          allCompleted = false;
        }
      }

      if (allCompleted) {
        console.log(`[Agent] 所有 ${agentIds.length} 个代理已完成`);
        return results;
      }

      if (hasFailure) {
        console.warn('[Agent] 部分代理执行失败，继续等待其他代理...');
      }

      // 等待 1 秒后重试
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 超时
    console.warn(`[Agent] 等待代理结果超时 (${timeoutMs}ms)`);
    for (const id of agentIds) {
      if (!results[id]) {
        const agent = this.agents.get(id);
        results[id] = agent?.status === 'running'
          ? `超时：代理仍在执行中 (当前状态：${agent.status})`
          : `超时：代理状态未知 (当前状态：${agent?.status})`;
      }
    }

    return results;
  }

  /**
   * 清理已完成超过指定时间的代理
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

    if (cleaned > 0) {
      console.log(`[Agent] 清理了 ${cleaned} 个过期代理`);
    }

    return cleaned;
  }
}
