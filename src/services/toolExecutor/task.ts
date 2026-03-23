/**
 * 任务管理工具处理器
 */

import { WebSocket } from 'ws';
import { getTodos, setTodos, TodoItem, createTask, getTask, listTasks, updateTask, stopTask, AsyncTask, createPlan, getPlan, updatePlanStep } from '../tools';
import { ToolContext } from '../toolExecutor/context';

export async function handleTaskTool(
  tool: { name: string; input?: any },
  ctx: ToolContext
): Promise<string | null> {
  const { conversationId, ws } = ctx;

  switch (tool.name) {
    case 'todo_write': {
      const todos = tool.input?.todos as TodoItem[];
      if (!todos || !Array.isArray(todos)) return '错误：任务列表格式无效';

      setTodos(conversationId, todos);

      const output = todos.map((t, i) => {
        const status = { 'pending': '⏳', 'in_progress': '🔄', 'completed': '✅', 'failed': '❌' }[t.status] || '⏳';
        return `${status} ${i + 1}. ${t.task}`;
      }).join('\n');

      if (ws) ws.send(JSON.stringify({ type: 'todo_updated', todos }));
      return `任务列表已更新:\n${output}`;
    }

    case 'todo_read': {
      const todos = getTodos(conversationId);

      if (todos.length === 0) {
        return '当前没有任务';
      }

      const output = todos.map((t, i) => {
        const status = { 'pending': '⏳', 'in_progress': '🔄', 'completed': '✅', 'failed': '❌' }[t.status] || '⏳';
        return `${status} ${i + 1}. ${t.task}`;
      }).join('\n');

      if (ws) ws.send(JSON.stringify({ type: 'todo_read', todos }));
      return `当前任务:\n${output}`;
    }

    case 'task_create': {
      const taskId = tool.input?.task_id;
      const name = tool.input?.name;

      if (!taskId || !name) {
        return '错误：缺少任务 ID 或名称';
      }

      const task = createTask(taskId, name);
      if (ws) {
        ws.send(JSON.stringify({ type: 'task_created', taskId, name }));
      }
      return `任务已创建: ${taskId} - ${name}`;
    }

    case 'task_get': {
      const taskId = tool.input?.task_id;
      if (!taskId) return '错误：缺少任务 ID';

      const task = getTask(taskId);
      if (!task) {
        return `任务不存在: ${taskId}`;
      }

      return `任务详情:\nID: ${task.id}\n名称: ${task.name}\n状态: ${task.status}\n创建时间: ${task.createdAt.toLocaleString()}\n更新时间: ${task.updatedAt.toLocaleString()}${task.progress ? `\n进度: ${task.progress}%` : ''}${task.result ? `\n结果: ${task.result}` : ''}${task.error ? `\n错误: ${task.error}` : ''}`;
    }

    case 'task_list': {
      const status = tool.input?.status as AsyncTask['status'] | undefined;
      const tasks = listTasks(status);

      if (tasks.length === 0) {
        return status ? `没有状态为 ${status} 的任务` : '没有任务';
      }

      const output = tasks.map(t => {
        const statusIcon = { pending: '⏳', running: '🔄', completed: '✅', failed: '❌', cancelled: '🚫' }[t.status];
        return `${statusIcon} ${t.id}: ${t.name} (${t.status})`;
      }).join('\n');

      if (ws) {
        ws.send(JSON.stringify({ type: 'task_list', tasks: tasks.map(t => ({ id: t.id, name: t.name, status: t.status })) }));
      }
      return `任务列表 (${tasks.length} 个):\n${output}`;
    }

    case 'task_update': {
      const taskId = tool.input?.task_id;
      const status = tool.input?.status;
      const progress = tool.input?.progress;
      const result = tool.input?.result;
      const error = tool.input?.error;

      if (!taskId) return '错误：缺少任务 ID';

      const updates: any = {};
      if (status) updates.status = status;
      if (progress !== undefined) updates.progress = progress;
      if (result !== undefined) updates.result = result;
      if (error !== undefined) updates.error = error;

      const task = updateTask(taskId, updates);
      if (!task) {
        return `任务不存在: ${taskId}`;
      }

      if (ws) {
        ws.send(JSON.stringify({ type: 'task_updated', taskId, status: task.status, progress: task.progress }));
      }
      return `任务已更新: ${taskId} (${task.status})`;
    }

    case 'task_stop': {
      const taskId = tool.input?.task_id;
      if (!taskId) return '错误：缺少任务 ID';

      const task = stopTask(taskId);
      if (!task) {
        return `任务不存在: ${taskId}`;
      }

      if (ws) {
        ws.send(JSON.stringify({ type: 'task_stopped', taskId }));
      }
      return `任务已停止: ${taskId}`;
    }

    case 'plan_create': {
      const planId = tool.input?.plan_id;
      const title = tool.input?.title;
      const steps = tool.input?.steps as string[];

      if (!planId || !title || !steps || !Array.isArray(steps)) {
        return '错误：参数不完整';
      }

      const plan = createPlan(planId, title, steps);
      if (ws) {
        ws.send(JSON.stringify({ type: 'plan_created', planId, title, stepCount: steps.length }));
      }

      const stepsList = steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
      return `计划已创建: ${title}\n\n步骤:\n${stepsList}`;
    }

    case 'plan_get': {
      const planId = tool.input?.plan_id;
      if (!planId) return '错误：缺少计划 ID';

      const plan = getPlan(planId);
      if (!plan) {
        return `计划不存在: ${planId}`;
      }

      const stepsList = plan.steps.map((s, i) => {
        const statusIcon = { pending: '⏳', in_progress: '🔄', completed: '✅' }[s.status];
        return `${statusIcon} ${i + 1}. ${s.content}`;
      }).join('\n');

      return `计划: ${plan.title}\n\n步骤:\n${stepsList}`;
    }

    case 'plan_update_step': {
      const planId = tool.input?.plan_id;
      const stepId = tool.input?.step_id;
      const status = tool.input?.status;

      if (!planId || !stepId || !status) {
        return '错误：参数不完整';
      }

      const plan = updatePlanStep(planId, stepId, status);
      if (!plan) {
        return `计划或步骤不存在`;
      }

      if (ws) {
        ws.send(JSON.stringify({ type: 'plan_step_updated', planId, stepId, status }));
      }
      return `步骤已更新: ${stepId} -> ${status}`;
    }

    default:
      return null;
  }
}