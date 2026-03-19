import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ==================== Glob 文件搜索 ====================

export interface GlobOptions {
  pattern: string;
  path?: string;
  ignore?: string[];
}

export function globFiles(options: GlobOptions): string[] {
  const { pattern, path: searchPath = process.cwd(), ignore = [] } = options;
  const results: string[] = [];
  
  // 解析 glob 模式
  const parts = pattern.split('/');
  const basePattern = parts[parts.length - 1];
  const dirPattern = parts.slice(0, -1).join('/');
  
  function matchPattern(str: string, pattern: string): boolean {
    // 转换 glob 模式为正则
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
    if (depth > 20) return; // 限制深度
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(searchPath, fullPath).replace(/\\/g, '/');
        
        if (shouldIgnore(relativePath)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
        
        if (entry.isDirectory()) {
          // ** 匹配任意深度目录
          if (pattern.includes('**')) {
            walkDir(fullPath, depth + 1);
          } else if (pattern.split('/').length > depth + 1) {
            walkDir(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          // 检查文件名是否匹配
          const fileName = entry.name;
          const relativePath = path.relative(searchPath, fullPath).replace(/\\/g, '/');
          
          if (pattern.includes('**')) {
            // ** 模式：在整个路径中匹配
            const patternAfterDoubleStar = pattern.split('**').pop() || '';
            if (matchPattern(relativePath, pattern) || 
                matchPattern(fileName, basePattern) ||
                matchPattern(relativePath, patternAfterDoubleStar.replace(/^\//, ''))) {
              results.push(fullPath);
            }
          } else if (pattern.includes('/')) {
            // 有路径的模式
            if (matchPattern(relativePath, pattern)) {
              results.push(fullPath);
            }
          } else {
            // 只有文件名模式
            if (matchPattern(fileName, pattern)) {
              results.push(fullPath);
            }
          }
        }
      }
    } catch (e) {
      // 忽略无权限目录
    }
  }
  
  walkDir(searchPath);
  
  // 按修改时间排序（最新的在前）
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
  const { pattern, path: searchPath = process.cwd(), include, ignoreCase = true, context = 0 } = options;
  const results: GrepResult[] = [];
  
  // 构建文件列表
  let files: string[] = [];
  if (include) {
    files = globFiles({ pattern: include, path: searchPath });
  } else {
    // 递归获取所有文本文件
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
  
  // 搜索内容
  const regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g');
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          results.push({
            file,
            line: i + 1,
            content: lines[i].trim()
          });
          
          // 限制结果数量
          if (results.length >= 100) break;
        }
      }
    } catch (e) {
      // 忽略二进制文件或无权限文件
    }
    
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
  // 使用 DuckDuckGo 或其他搜索 API
  // 这里使用一个简单的实现，实际项目中可以使用 SerpAPI、Bing API 等
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1`;
    
    const response = await fetch(url);
    const data = await response.json() as any;
    
    const results: WebSearchResult[] = [];
    
    // 解析 DuckDuckGo 响应
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
    
    // 如果 DuckDuckGo 没有结果，返回提示
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
      return {
        url,
        title: '',
        content: '',
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }
    
    const html = await response.text();
    
    // 简单的 HTML 解析
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url;
    
    // 提取正文内容（简单实现）
    let content = html
      // 移除 script 和 style
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // 移除 HTML 标签
      .replace(/<[^>]+>/g, ' ')
      // 合并空白
      .replace(/\s+/g, ' ')
      .trim();
    
    // 限制长度
    if (content.length > 10000) {
      content = content.substring(0, 10000) + '\n... (内容已截断)';
    }
    
    // 如果有 prompt，简单处理（实际应该用 LLM）
    if (prompt) {
      content = `[根据提示 "${prompt}" 提取的内容]\n\n${content}`;
    }
    
    return { url, title, content };
  } catch (error: any) {
    return {
      url,
      title: '',
      content: '',
      error: error.message
    };
  }
}

// ==================== Todo 任务管理 ====================

export interface TodoItem {
  id: string;
  task: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority?: 'high' | 'medium' | 'low';
}

// 每个会话的 todo 列表
const sessionTodos: Map<string, TodoItem[]> = new Map();

export function getTodos(sessionId: string): TodoItem[] {
  return sessionTodos.get(sessionId) || [];
}

export function setTodos(sessionId: string, todos: TodoItem[]): void {
  sessionTodos.set(sessionId, todos);
}

export function addTodo(sessionId: string, task: string, priority?: 'high' | 'medium' | 'low'): TodoItem {
  const todos = getTodos(sessionId);
  const todo: TodoItem = {
    id: Date.now().toString(),
    task,
    status: 'pending',
    priority
  };
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

export function replaceInFile(
  filePath: string,
  oldString: string,
  newString: string
): ReplaceResult {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, message: '文件不存在', matches: 0 };
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // 检查是否有匹配
    const matches = content.split(oldString).length - 1;
    
    if (matches === 0) {
      return { success: false, message: '未找到要替换的内容', matches: 0 };
    }
    
    // 如果有多个匹配，警告
    if (matches > 1) {
      return { 
        success: false, 
        message: `找到 ${matches} 个匹配项。替换操作需要唯一匹配，请提供更多上下文。`, 
        matches 
      };
    }
    
    // 执行替换
    const newContent = content.replace(oldString, newString);
    fs.writeFileSync(filePath, newContent, 'utf-8');
    
    return { success: true, message: '替换成功', matches: 1 };
  } catch (error: any) {
    return { success: false, message: error.message, matches: 0 };
  }
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

// 这个工具在 WebSocket 中特殊处理，需要等待用户回复
