/**
 * Agent 工具处理器
 */

import { WebSocket } from 'ws';
import { createTask, getTask, listTasks } from '../tools';
import { ToolContext } from '../toolExecutor/context';

export async function handleAgentTool(
  tool: { name: string; input?: any },
  ctx: ToolContext
): Promise<string | null> {
  const { conversationId, ws } = ctx;

  switch (tool.name) {
    case 'agent_spawn': {
      const agentId = tool.input?.agent_id;
      const task = tool.input?.task;
      const agentRole = tool.input?.agent_role || tool.input?.agent_type || 'executor';

      if (!agentId || !task) {
        return '错误：缺少代理 ID 或任务描述';
      }

      if (ctx.agentOrchestrator) {
        try {
          const agent = await ctx.agentOrchestrator.spawn({
            id: agentId,
            role: agentRole as 'planner' | 'executor' | 'reviewer' | 'explorer' | 'researcher',
            task,
            parentConversationId: conversationId
          });

          if (ws) {
            ws.send(JSON.stringify({
              type: 'agent_spawned',
              agentId,
              task,
              agentRole,
              status: 'running'
            }));
          }

          return `代理已创建：${agentId}\n角色：${agentRole}\n任务：${task}\n\n代理正在后台执行，使用 agent_get 查询进度。`;
        } catch (error: any) {
          return `代理创建失败：${error.message}`;
        }
      }

      // 降级处理
      const agentTask = createTask(agentId, `[Agent] ${task}`);
      return `代理已创建: ${agentId}\n角色: ${agentRole}\n任务: ${task}\n\n注意：未初始化 AgentOrchestrator，代理不会实际执行。`;
    }

    case 'agent_plan': {
      const goal = tool.input?.goal;

      if (!goal) {
        return '错误：缺少目标描述';
      }

      if (!ctx.agentOrchestrator) {
        return '错误：AgentOrchestrator 未初始化';
      }

      try {
        const plan = await ctx.agentOrchestrator.createPlan(goal, conversationId);

        const tasksList = plan.tasks.map((t, i) =>
          `${t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢'} ${i + 1}. ${t.description}`
        ).join('\n');

        if (ws) {
          ws.send(JSON.stringify({
            type: 'plan_created',
            planId: plan.id,
            goal,
            tasks: plan.tasks
          }));
        }

        return `执行计划已创建 (ID: ${plan.id})\n\n目标：${goal}\n\n任务列表：\n${tasksList}\n\n使用 agent_execute_plan 执行此计划。`;
      } catch (error: any) {
        return `创建计划失败：${error.message}`;
      }
    }

    case 'agent_execute_plan': {
      const planId = tool.input?.plan_id;

      if (!planId) {
        return '错误：缺少计划 ID';
      }

      if (!ctx.agentOrchestrator) {
        return '错误：AgentOrchestrator 未初始化';
      }

      try {
        if (ws) {
          ws.send(JSON.stringify({
            type: 'plan_executing',
            planId
          }));
        }

        const result = await ctx.agentOrchestrator.executePlan(planId, conversationId, (update) => {
          if (ws) {
            ws.send(JSON.stringify({
              type: 'task_progress',
              planId,
              taskId: update.task.id,
              task: update.task.description,
              status: update.status
            }));
          }
        });

        const summary = Object.entries(result.results)
          .map(([taskId, res]) => `${taskId}: ${res.substring(0, 100)}...`)
          .join('\n');

        if (ws) {
          ws.send(JSON.stringify({
            type: 'plan_completed',
            planId,
            success: result.success
          }));
        }

        return `计划执行${result.success ? '成功' : '失败'} (ID: ${planId})\n\n结果：\n${summary}`;
      } catch (error: any) {
        return `执行计划失败：${error.message}`;
      }
    }

    case 'agent_get': {
      const id = tool.input?.agent_id || tool.input?.id;
      if (!id) return '错误：缺少代理 ID';

      if (!ctx.agentOrchestrator) {
        const task = getTask(id);
        if (!task) return `代理不存在: ${id}`;
        return `代理状态:\nID: ${task.id}\n名称: ${task.name}\n状态: ${task.status}\n${task.result ? `结果: ${task.result}` : ''}`;
      }

      const agent = ctx.agentOrchestrator.getAgent(id);
      if (!agent) {
        return `代理不存在: ${id}`;
      }

      return `代理详情:\nID: ${agent.id}\n角色: ${agent.role}\n状态: ${agent.status}\n任务: ${agent.task.substring(0, 100)}...\n${agent.result ? `结果: ${agent.result.substring(0, 200)}...` : ''}`;
    }

    case 'agent_list': {
      if (!ctx.agentOrchestrator) {
        const tasks = listTasks();
        if (tasks.length === 0) return '没有代理任务';
        return tasks.map(t => `${t.status === 'running' ? '🔄' : t.status === 'completed' ? '✅' : '⏳'} ${t.id}: ${t.name}`).join('\n');
      }

      const agents = ctx.agentOrchestrator.getAgentsByParent(conversationId);
      if (agents.length === 0) {
        return '当前会话没有代理任务';
      }

      return agents.map(a => {
        const statusIcon = a.status === 'running' ? '🔄' : a.status === 'completed' ? '✅' : a.status === 'failed' ? '❌' : '⏳';
        return `${statusIcon} [${a.role}] ${a.id}: ${a.task.substring(0, 50)}...`;
      }).join('\n');
    }

    case 'agent_memory_search': {
      const query = tool.input?.query;
      const limit = tool.input?.limit || 5;

      if (!query) return '错误：缺少搜索查询';
      if (!ctx.agentOrchestrator) return '错误：AgentOrchestrator 未初始化';

      const memories = ctx.agentOrchestrator.searchMemory(query, limit);
      if (memories.length === 0) {
        return '没有找到相关记忆';
      }

      return memories.map((m, i) =>
        `${i + 1}. [${m.metadata.type}] ${m.content.substring(0, 200)}...\n   标签: ${m.metadata.tags.join(', ')}`
      ).join('\n\n');
    }

    default:
      return null;
  }
}