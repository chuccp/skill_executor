/**
 * 任务管理工具
 */

// ==================== Todo 任务管理 ====================

export interface TodoItem {
  id: string;
  task: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority?: 'high' | 'medium' | 'low';
}

const sessionTodos: Map<string, TodoItem[]> = new Map();

export function getTodos(sessionId: string): TodoItem[] {
  return sessionTodos.get(sessionId) || [];
}

export function setTodos(sessionId: string, todos: TodoItem[]): void {
  sessionTodos.set(sessionId, todos);
}

export function addTodo(sessionId: string, task: string, priority?: 'high' | 'medium' | 'low'): TodoItem {
  const todos = getTodos(sessionId);
  const todo: TodoItem = { id: Date.now().toString(), task, status: 'pending', priority };
  todos.push(todo);
  setTodos(sessionId, todos);
  return todo;
}

export function updateTodo(sessionId: string, id: string, status: TodoItem['status']): TodoItem | null {
  const todos = getTodos(sessionId);
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.status = status;
    setTodos(sessionId, todos);
    return todo;
  }
  return null;
}

// ==================== Ask User ====================

export interface QuestionOption {
  label: string;
  description: string;
}

export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

// ==================== 异步任务系统 ====================

export interface AsyncTask {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const asyncTasks: Map<string, AsyncTask> = new Map();

export function createTask(id: string, name: string): AsyncTask {
  const task: AsyncTask = {
    id,
    name,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  };
  asyncTasks.set(id, task);
  return task;
}

export function getTask(id: string): AsyncTask | undefined {
  return asyncTasks.get(id);
}

export function listTasks(status?: AsyncTask['status']): AsyncTask[] {
  const tasks = Array.from(asyncTasks.values());
  if (status) {
    return tasks.filter(t => t.status === status);
  }
  return tasks;
}

export function updateTask(
  id: string,
  updates: Partial<Pick<AsyncTask, 'status' | 'progress' | 'result' | 'error'>>
): AsyncTask | null {
  const task = asyncTasks.get(id);
  if (!task) return null;

  Object.assign(task, updates, { updatedAt: new Date() });
  return task;
}

export function stopTask(id: string): AsyncTask | null {
  const task = asyncTasks.get(id);
  if (!task) return null;

  if (task.status === 'running') {
    task.status = 'cancelled';
    task.updatedAt = new Date();
  }
  return task;
}

export function deleteTask(id: string): boolean {
  return asyncTasks.delete(id);
}

// ==================== Plan 模式 ====================

export interface PlanStep {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface Plan {
  id: string;
  title: string;
  steps: PlanStep[];
  createdAt: Date;
}

const plans: Map<string, Plan> = new Map();

export function createPlan(id: string, title: string, steps: string[]): Plan {
  const plan: Plan = {
    id,
    title,
    steps: steps.map((content, index) => ({
      id: `${id}-${index}`,
      content,
      status: 'pending' as const
    })),
    createdAt: new Date()
  };
  plans.set(id, plan);
  return plan;
}

export function getPlan(id: string): Plan | undefined {
  return plans.get(id);
}

export function updatePlanStep(
  planId: string,
  stepId: string,
  status: PlanStep['status']
): Plan | null {
  const plan = plans.get(planId);
  if (!plan) return null;

  const step = plan.steps.find(s => s.id === stepId);
  if (!step) return null;

  step.status = status;
  return plan;
}

export function deletePlan(id: string): boolean {
  return plans.delete(id);
}