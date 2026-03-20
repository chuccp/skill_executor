import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

// ==================== 平台检测 ====================

export const platform = {
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux',
  name: process.platform,
  homeDir: os.homedir(),
  pathSeparator: path.sep
};

// ==================== Glob 文件搜索 ====================

export interface GlobOptions {
  pattern: string;
  path?: string;
  ignore?: string[];
}

export function globFiles(options: GlobOptions): string[] {
  const { pattern, path: searchPath = process.cwd(), ignore = [] } = options;
  const results: string[] = [];
  
  function matchPattern(str: string, pattern: string): boolean {
    let regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<<<DOUBLE_STAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<DOUBLE_STAR>>>/g, '.*')
      .replace(/\?/g, '[^/]');
    
    regex = '^' + regex + '$';
    return new RegExp(regex, 'i').test(str);
  }
  
  function shouldIgnore(filePath: string): boolean {
    for (const ignorePattern of ignore) {
      if (filePath.includes(ignorePattern) || matchPattern(filePath, ignorePattern)) {
        return true;
      }
    }
    return false;
  }
  
  function walkDir(dir: string, depth: number = 0) {
    if (depth > 20) return;
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(searchPath, fullPath).replace(/\\/g, '/');
        
        if (shouldIgnore(relativePath)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
        
        if (entry.isDirectory()) {
          if (pattern.includes('**')) {
            walkDir(fullPath, depth + 1);
          } else if (pattern.split('/').length > depth + 1) {
            walkDir(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          const fileName = entry.name;
          const relativePath = path.relative(searchPath, fullPath).replace(/\\/g, '/');
          
          if (pattern.includes('**')) {
            const patternAfterDoubleStar = pattern.split('**').pop() || '';
            if (matchPattern(relativePath, pattern) || 
                matchPattern(fileName, pattern.split('/').pop() || '') ||
                matchPattern(relativePath, patternAfterDoubleStar.replace(/^\//, ''))) {
              results.push(fullPath);
            }
          } else if (pattern.includes('/')) {
            if (matchPattern(relativePath, pattern)) {
              results.push(fullPath);
            }
          } else {
            if (matchPattern(fileName, pattern)) {
              results.push(fullPath);
            }
          }
        }
      }
    } catch (e) {}
  }
  
  walkDir(searchPath);
  
  results.sort((a, b) => {
    try {
      const statA = fs.statSync(a);
      const statB = fs.statSync(b);
      return statB.mtimeMs - statA.mtimeMs;
    } catch {
      return 0;
    }
  });
  
  return results;
}

// ==================== Grep 内容搜索 ====================

export interface GrepOptions {
  pattern: string;
  path?: string;
  include?: string;
  ignoreCase?: boolean;
  context?: number;
}

export interface GrepResult {
  file: string;
  line: number;
  content: string;
}

export function grepContent(options: GrepOptions): GrepResult[] {
  const { pattern, path: searchPath = process.cwd(), include, ignoreCase = true } = options;
  const results: GrepResult[] = [];
  
  let files: string[] = [];
  if (include) {
    files = globFiles({ pattern: include, path: searchPath });
  } else {
    function getAllFiles(dir: string): string[] {
      const result: string[] = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            result.push(...getAllFiles(fullPath));
          } else if (entry.isFile()) {
            result.push(fullPath);
          }
        }
      } catch (e) {}
      return result;
    }
    files = getAllFiles(searchPath);
  }
  
  const regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g');
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          results.push({ file, line: i + 1, content: lines[i].trim() });
          if (results.length >= 100) break;
        }
      }
    } catch (e) {}
    
    if (results.length >= 100) break;
  }
  
  return results;
}

// ==================== Web Search ====================

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
}

export async function webSearch(query: string): Promise<WebSearchResult[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1`;
    
    const response = await fetch(url);
    const data = await response.json() as any;
    
    const results: WebSearchResult[] = [];
    
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 10)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 50),
            link: topic.FirstURL,
            snippet: topic.Text
          });
        }
      }
    }
    
    if (results.length === 0) {
      results.push({
        title: '搜索提示',
        link: '',
        snippet: `DuckDuckGo 未返回结果。建议使用搜索引擎直接搜索: https://www.google.com/search?q=${encodedQuery}`
      });
    }
    
    return results;
  } catch (error: any) {
    return [{
      title: '搜索失败',
      link: '',
      snippet: `搜索出错: ${error.message}。请直接访问搜索引擎。`
    }];
  }
}

// ==================== Web Fetch ====================

export interface WebFetchResult {
  url: string;
  title: string;
  content: string;
  error?: string;
}

export async function webFetch(url: string, prompt?: string): Promise<WebFetchResult> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      return { url, title: '', content: '', error: `HTTP ${response.status}: ${response.statusText}` };
    }
    
    const html = await response.text();
    
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url;
    
    let content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (content.length > 10000) {
      content = content.substring(0, 10000) + '\n... (内容已截断)';
    }
    
    if (prompt) {
      content = `[根据提示 "${prompt}" 提取的内容]\n\n${content}`;
    }
    
    return { url, title, content };
  } catch (error: any) {
    return { url, title: '', content: '', error: error.message };
  }
}

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

// ==================== List Directory ====================

export interface DirectoryInfo {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: Date;
}

export function listDirectory(dirPath: string): DirectoryInfo[] {
  const results: DirectoryInfo[] = [];
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const info: DirectoryInfo = {
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file'
      };
      
      try {
        const stat = fs.statSync(fullPath);
        info.size = stat.size;
        info.modified = stat.mtime;
      } catch (e) {}
      
      results.push(info);
    }
  } catch (error: any) {
    throw new Error(`无法读取目录: ${error.message}`);
  }
  
  return results;
}

// ==================== Replace 文件内容 ====================

export interface ReplaceResult {
  success: boolean;
  message: string;
  matches: number;
}

export function replaceInFile(filePath: string, oldString: string, newString: string): ReplaceResult {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, message: '文件不存在', matches: 0 };
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const matches = content.split(oldString).length - 1;
    
    if (matches === 0) {
      return { success: false, message: '未找到要替换的内容', matches: 0 };
    }
    
    if (matches > 1) {
      return { 
        success: false, 
        message: `找到 ${matches} 个匹配项。替换操作需要唯一匹配，请提供更多上下文。`, 
        matches 
      };
    }
    
    const newContent = content.replace(oldString, newString);
    fs.writeFileSync(filePath, newContent, 'utf-8');
    
    return { success: true, message: '替换成功', matches: 1 };
  } catch (error: any) {
    return { success: false, message: error.message, matches: 0 };
  }
}

// ==================== 文件操作工具 ====================

export interface FileOperationResult {
  success: boolean;
  message: string;
}

// 复制文件
export function copyFile(source: string, destination: string): FileOperationResult {
  try {
    if (!fs.existsSync(source)) {
      return { success: false, message: `源文件不存在: ${source}` };
    }
    
    const destDir = path.dirname(destination);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    fs.copyFileSync(source, destination);
    return { success: true, message: `复制成功: ${source} -> ${destination}` };
  } catch (error: any) {
    return { success: false, message: `复制失败: ${error.message}` };
  }
}

// 移动/重命名文件
export function moveFile(source: string, destination: string): FileOperationResult {
  try {
    if (!fs.existsSync(source)) {
      return { success: false, message: `源文件不存在: ${source}` };
    }
    
    const destDir = path.dirname(destination);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    fs.renameSync(source, destination);
    return { success: true, message: `移动成功: ${source} -> ${destination}` };
  } catch (error: any) {
    return { success: false, message: `移动失败: ${error.message}` };
  }
}

// 删除文件
export function deleteFile(filePath: string): FileOperationResult {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, message: `文件不存在: ${filePath}` };
    }
    
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
    
    return { success: true, message: `删除成功: ${filePath}` };
  } catch (error: any) {
    return { success: false, message: `删除失败: ${error.message}` };
  }
}

// 创建目录
export function createDirectory(dirPath: string): FileOperationResult {
  try {
    if (fs.existsSync(dirPath)) {
      return { success: false, message: `目录已存在: ${dirPath}` };
    }
    
    fs.mkdirSync(dirPath, { recursive: true });
    return { success: true, message: `目录创建成功: ${dirPath}` };
  } catch (error: any) {
    return { success: false, message: `创建目录失败: ${error.message}` };
  }
}

// ==================== 文件信息 ====================

export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  sizeFormatted: string;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

export function getFileInfo(filePath: string): FileInfo | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const stat = fs.statSync(filePath);
    const parsedPath = path.parse(filePath);
    
    return {
      path: filePath,
      name: parsedPath.base,
      extension: parsedPath.ext,
      size: stat.size,
      sizeFormatted: formatBytes(stat.size),
      created: stat.birthtime,
      modified: stat.mtime,
      accessed: stat.atime,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      permissions: getPermissions(stat.mode)
    };
  } catch (e) {
    return null;
  }
}

// 检查文件是否存在
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

// ==================== XML 转义 ====================

export function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ==================== 辅助函数 ====================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getPermissions(mode: number): string {
  const perms: string[] = [];
  
  // Owner
  perms.push(mode & 0o400 ? 'r' : '-');
  perms.push(mode & 0o200 ? 'w' : '-');
  perms.push(mode & 0o100 ? 'x' : '-');
  
  // Group
  perms.push(mode & 0o040 ? 'r' : '-');
  perms.push(mode & 0o020 ? 'w' : '-');
  perms.push(mode & 0o010 ? 'x' : '-');
  
  // Others
  perms.push(mode & 0o004 ? 'r' : '-');
  perms.push(mode & 0o002 ? 'w' : '-');
  perms.push(mode & 0o001 ? 'x' : '-');
  
  return perms.join('');
}

// ==================== Edit 文件编辑 ====================

export interface EditOperation {
  oldText: string;
  newText: string;
}

export interface EditResult {
  success: boolean;
  message: string;
  appliedEdits: number;
  totalEdits: number;
}

export function editFile(filePath: string, edits: EditOperation[], createIfNotExists?: boolean): EditResult {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      if (createIfNotExists) {
        // 创建新文件
        if (edits.length === 1 && edits[0].oldText === '') {
          fs.writeFileSync(filePath, edits[0].newText, 'utf-8');
          return { success: true, message: '文件创建成功', appliedEdits: 1, totalEdits: 1 };
        }
        return { success: false, message: '新文件需要提供一个空的 oldText', appliedEdits: 0, totalEdits: edits.length };
      }
      return { success: false, message: '文件不存在', appliedEdits: 0, totalEdits: edits.length };
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    let appliedEdits = 0;

    for (const edit of edits) {
      if (edit.oldText === '') {
        // 空的 oldText 表示在文件末尾追加
        content += edit.newText;
        appliedEdits++;
        continue;
      }

      // 检查是否存在匹配
      if (!content.includes(edit.oldText)) {
        continue;
      }

      // 检查是否唯一匹配
      const matches = content.split(edit.oldText).length - 1;
      if (matches > 1) {
        // 多个匹配，尝试使用更精确的上下文
        continue;
      }

      // 执行替换
      content = content.replace(edit.oldText, edit.newText);
      appliedEdits++;
    }

    if (appliedEdits > 0) {
      fs.writeFileSync(filePath, content, 'utf-8');
    }

    return {
      success: appliedEdits === edits.length,
      message: appliedEdits === edits.length
        ? '所有编辑已应用'
        : `已应用 ${appliedEdits}/${edits.length} 个编辑`,
      appliedEdits,
      totalEdits: edits.length
    };
  } catch (error: any) {
    return { success: false, message: error.message, appliedEdits: 0, totalEdits: edits.length };
  }
}

// 多文件编辑
export interface MultiFileEdit {
  filePath: string;
  edits: EditOperation[];
  createIfNotExists?: boolean;
}

export interface MultiFileEditResult {
  filePath: string;
  success: boolean;
  message: string;
  appliedEdits: number;
}

export function editMultipleFiles(edits: MultiFileEdit[]): MultiFileEditResult[] {
  return edits.map(edit => {
    const result = editFile(edit.filePath, edit.edits, edit.createIfNotExists);
    return {
      filePath: edit.filePath,
      success: result.success,
      message: result.message,
      appliedEdits: result.appliedEdits
    };
  });
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

// ==================== Notebook 编辑 ====================

export interface NotebookCell {
  cell_type: 'markdown' | 'code' | 'raw';
  source: string | string[];
  metadata?: Record<string, any>;
  execution_count?: number | null;
  outputs?: any[];
}

export interface Notebook {
  cells: NotebookCell[];
  metadata: Record<string, any>;
  nbformat: number;
  nbformat_minor: number;
}

export function readNotebook(filePath: string): Notebook | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Notebook;
  } catch {
    return null;
  }
}

export function writeNotebook(filePath: string, notebook: Notebook): boolean {
  try {
    fs.writeFileSync(filePath, JSON.stringify(notebook, null, 1), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export function editNotebookCell(
  filePath: string,
  cellIndex: number,
  newSource: string | string[],
  cellType?: 'markdown' | 'code' | 'raw'
): { success: boolean; message: string } {
  try {
    const notebook = readNotebook(filePath);
    if (!notebook) {
      return { success: false, message: '无法读取 Notebook 文件' };
    }

    if (cellIndex < 0 || cellIndex >= notebook.cells.length) {
      return { success: false, message: `无效的单元格索引: ${cellIndex}` };
    }

    notebook.cells[cellIndex].source = newSource;
    if (cellType) {
      notebook.cells[cellIndex].cell_type = cellType;
    }

    writeNotebook(filePath, notebook);
    return { success: true, message: `单元格 ${cellIndex} 已更新` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export function addNotebookCell(
  filePath: string,
  cellType: 'markdown' | 'code' | 'raw',
  source: string | string[],
  position?: number
): { success: boolean; message: string } {
  try {
    const notebook = readNotebook(filePath);
    if (!notebook) {
      return { success: false, message: '无法读取 Notebook 文件' };
    }

    const newCell: NotebookCell = {
      cell_type: cellType,
      source: source,
      metadata: {},
      execution_count: cellType === 'code' ? null : undefined,
      outputs: cellType === 'code' ? [] : undefined
    };

    if (position !== undefined && position >= 0 && position <= notebook.cells.length) {
      notebook.cells.splice(position, 0, newCell);
    } else {
      notebook.cells.push(newCell);
    }

    writeNotebook(filePath, notebook);
    return { success: true, message: `新单元格已添加` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export function deleteNotebookCell(
  filePath: string,
  cellIndex: number
): { success: boolean; message: string } {
  try {
    const notebook = readNotebook(filePath);
    if (!notebook) {
      return { success: false, message: '无法读取 Notebook 文件' };
    }

    if (cellIndex < 0 || cellIndex >= notebook.cells.length) {
      return { success: false, message: `无效的单元格索引: ${cellIndex}` };
    }

    notebook.cells.splice(cellIndex, 1);
    writeNotebook(filePath, notebook);
    return { success: true, message: `单元格 ${cellIndex} 已删除` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
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

// ==================== Git Worktree ====================

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  isMain: boolean;
}

export async function listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', { cwd: repoPath });
    const worktrees: WorktreeInfo[] = [];
    const lines = stdout.split('\n');

    let currentWorktree: Partial<WorktreeInfo> = {};
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (currentWorktree.path) {
          worktrees.push(currentWorktree as WorktreeInfo);
        }
        currentWorktree = { path: line.substring(9) };
      } else if (line.startsWith('HEAD ')) {
        currentWorktree.head = line.substring(5);
      } else if (line.startsWith('branch ')) {
        currentWorktree.branch = line.substring(7);
      }
    }
    if (currentWorktree.path) {
      worktrees.push(currentWorktree as WorktreeInfo);
    }

    // 标记主工作树
    if (worktrees.length > 0) {
      worktrees[0].isMain = true;
    }

    return worktrees;
  } catch {
    return [];
  }
}

export async function createWorktree(
  repoPath: string,
  branchName: string,
  worktreePath: string
): Promise<{ success: boolean; message: string }> {
  try {
    await execAsync(`git worktree add "${worktreePath}" -b "${branchName}"`, { cwd: repoPath });
    return { success: true, message: `工作树创建成功: ${worktreePath}` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function removeWorktree(
  repoPath: string,
  worktreePath: string
): Promise<{ success: boolean; message: string }> {
  try {
    await execAsync(`git worktree remove "${worktreePath}"`, { cwd: repoPath });
    return { success: true, message: `工作树已删除: ${worktreePath}` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}