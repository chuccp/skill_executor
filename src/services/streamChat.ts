import { ConversationManager } from './conversation';
import { SkillLoader } from './skillLoader';
import { LLMService } from './llm';
import { CommandExecutor } from './commandExecutor';
import * as fs from 'fs';
import * as path from 'path';
import {
  globFiles,
  grepContent,
  webSearch,
  webFetch,
  getTodos,
  setTodos,
  listDirectory,
  replaceInFile,
  TodoItem
} from './tools';
import { getWorkingDir } from './workingDir';

// 工具定义（与 websocket.ts 保持一致）
export const TOOLS = [
  // ========== 文件系统工具 ==========
  {
    name: 'read_file',
    description: '读取文件内容。支持文本文件、图片、PDF、DOCX、Excel 等。对于大文件会自动截断。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '文件路径（绝对路径，或相对当前工作目录）' },
        offset: { type: 'number', description: '可选：起始行号（0-based）' },
        limit: { type: 'number', description: '可选：读取的最大行数' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'write_file',
    description: '创建新文件或覆盖现有文件的内容。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '文件路径（绝对路径，或相对当前工作目录）' },
        content: { type: 'string', description: '要写入的内容' }
      },
      required: ['file_path', 'content']
    }
  },
  {
    name: 'replace',
    description: '在文件中替换文本。需要提供精确的 old_string 和 new_string。old_string 必须唯一匹配。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '文件路径（绝对路径，或相对当前工作目录）' },
        old_string: { type: 'string', description: '要替换的原始文本（必须精确匹配）' },
        new_string: { type: 'string', description: '替换后的新文本' }
      },
      required: ['file_path', 'old_string', 'new_string']
    }
  },
  {
    name: 'list_directory',
    description: '列出目录中的文件和子目录。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径（绝对路径，或相对当前工作目录）' }
      },
      required: []
    }
  },
  {
    name: 'glob',
    description: '使用 glob 模式搜索文件。支持 ** (递归)、* (任意字符)、? (单个字符)。',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob 模式，如 **/*.ts、src/**/*.js' },
        path: { type: 'string', description: '可选：搜索的根目录，默认为项目根目录' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'grep',
    description: '在文件内容中搜索正则表达式模式。返回匹配的文件、行号和内容。',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '正则表达式模式' },
        path: { type: 'string', description: '可选：搜索的目录路径' },
        include: { type: 'string', description: '可选：文件 glob 模式，如 *.ts' }
      },
      required: ['pattern']
    }
  },
  // ========== Shell 工具 ==========
  {
    name: 'bash',
    description: '执行单条 shell 命令。用于安装软件、运行脚本、Git 操作等。避免多条命令拼接；危险命令需要用户确认。',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的 shell 命令' },
        description: { type: 'string', description: '可选：命令的简短描述' }
      },
      required: ['command']
    }
  },
  // ========== 网络工具 ==========
  {
    name: 'web_search',
    description: '在网络上搜索信息。返回搜索结果列表。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询' }
      },
      required: ['query']
    }
  },
  {
    name: 'web_fetch',
    description: '获取网页内容并提取信息。',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要获取的 URL' },
        prompt: { type: 'string', description: '可选：提取信息的提示' }
      },
      required: ['url']
    }
  },
  // ========== 任务管理工具 ==========
  {
    name: 'todo_write',
    description: '写入或更新任务列表。用于跟踪多步骤任务的进度。',
    input_schema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '任务 ID' },
              task: { type: 'string', description: '任务描述' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'] },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] }
            },
            required: ['id', 'task', 'status']
          },
          description: '任务列表'
        }
      },
      required: ['todos']
    }
  },
  {
    name: 'todo_read',
    description: '读取当前的任务列表。',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  // ========== Skill 工具 ==========
  {
    name: 'create_skill',
    description: '创建一个新的技能（Skill）。Skill 是 Markdown 文件，定义了特定的 AI 行为。',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '技能名称' },
        description: { type: 'string', description: '技能的简短描述' },
        prompt: { type: 'string', description: '技能的系统提示词' },
        triggers: { type: 'array', items: { type: 'string' }, description: '可选：触发关键词列表' }
      },
      required: ['name', 'description', 'prompt']
    }
  },
  // ========== 询问用户工具 ==========
  {
    name: 'ask_user',
    description: '向用户提问并等待回复。用于需要用户决策的情况。',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '要问用户的问题' },
        header: { type: 'string', description: '问题的简短标题（最多12字符）' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: '选项标签' },
              description: { type: 'string', description: '选项描述' }
            },
            required: ['label', 'description']
          },
          description: '可选的选项列表'
        }
      },
      required: ['question']
    }
  }
];

function buildSystemPrompt(): string {
  const isWindows = process.platform === 'win32';
  const osName = isWindows ? 'Windows' : 'macOS/Linux';
  const listCmd = isWindows ? 'dir' : 'ls';
  const catCmd = isWindows ? 'type' : 'cat';
  const grepCmd = isWindows ? 'findstr' : 'grep';
  const cwd = getWorkingDir();

  return `你是一个高效的 AI 编程助手。

## 🚨 最重要的规则 - 避免循环

**绝对禁止重复相同的操作！**
- 如果你已经执行了某个工具调用，收到结果后直接进行下一步或回复用户
- 如果搜索文件没找到，不要重复搜索，直接告诉用户并建议解决方案
- 如果读取文件成功，直接根据内容进行下一步操作，不要再次读取
- 同一个 glob 模式只执行一次
- 同一个文件只读取一次

## 常见任务快速指南

### 优化技能文件
当用户要求优化技能时：
1. 直接使用 glob 查找：pattern: "**/*.md", path: "skills目录的绝对路径"
2. 如果找到文件，用 read_file 读取内容
3. 根据用户需求用 write_file 重写或 replace 修改
4. 回复用户完成情况
**注意：一个文件只需要读取一次，然后直接修改！**

### 查找代码
当用户要求查找代码时：
1. 用 glob 搜索文件名，或用 grep 搜索内容
2. 搜索结果已经给出后，直接分析并回复用户
**注意：不要重复搜索！**

### 修改文件
1. 读取文件内容（只读一次）
2. 使用 replace 或 write_file 修改
3. 回复完成

## 代码文件存放规则 📁

**生成的代码必须放在 code 目录，按语言分类：**
- Python 代码 → `code/python/` 目录
- JavaScript 代码 → `code/javascript/` 目录  
- TypeScript 代码 → `code/typescript/` 目录
- Node.js 代码 → `code/nodejs/` 目录
- 其他语言 → `code/{语言名}/` 目录

**示例：**
- 用户要求生成 Python 脚本 → 保存到 `code/python/script_name.py`
- 用户要求生成 JS 文件 → 保存到 `code/javascript/utils.js`

**注意：** 不要在项目根目录创建代码文件，统一放在 code 目录下！

## 多媒体文件存放规则 🎵

**生成的多媒体文件必须放在 media 目录，按类型分类：**
- 图片文件 → `media/images/` 目录（png, jpg, gif, webp, svg 等）
- 音频文件 → `media/audio/` 目录（mp3, wav, ogg, m4a 等）
- 视频文件 → `media/video/` 目录（mp4, webm, avi 等）

**示例：**
- 生成语音 → 保存到 `media/audio/output.mp3`
- 生成图片 → 保存到 `media/images/generated.png`
- 生成视频 → 保存到 `media/video/result.mp4`

**注意：** 不要在项目根目录创建多媒体文件，统一放在 media 目录下！

## 环境信息

- 操作系统：${osName}
- 当前工作目录：${cwd}
- 常用命令：${listCmd} 列目录，${catCmd} 查看文件，${grepCmd} 搜索内容
- 路径可使用绝对路径，或相对当前工作目录
- 技能目录：skills/ 目录下的 .md 文件
- 代码目录：code/{语言}/ 目录（Python/JavaScript/TypeScript 等）
- 技能文件格式：
  \`\`\`markdown
  # 技能名称
  描述
  TRIGGER
  - 触发词
  PROMPT:
  提示词内容
  \`\`\`

## 可用工具

- read_file: 读取文件（绝对路径或相对当前工作目录）
- write_file: 写入文件
- replace: 替换文件内容（需要精确匹配）
- glob: 搜索文件（如 **/*.md）
- grep: 搜索文件内容
- bash: 执行命令
- web_search/web_fetch: 网络操作

## 执行原则

1. **一次性原则**：每个操作只执行一次
2. **结果导向**：收到工具结果后，直接给出结论或进行下一步
3. **简洁高效**：不要重复说明已经做过什么
4. **失败处理**：操作失败时，告诉用户原因和建议，不要无限重试

记住：你的目标是高效完成任务，而不是反复尝试相同的操作。`;
}

// SSE 事件类型
export interface SSEEvent {
  type: 'text' | 'progress' | 'tool_use' | 'tool_result' | 'todo' | 'error' | 'done';
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

  const toolDisplayNames: Record<string, string> = {
    'read_file': '读取文件',
    'write_file': '写入文件',
    'replace': '替换内容',
    'list_directory': '列出目录',
    'glob': '搜索文件',
    'grep': '搜索内容',
    'bash': '执行命令',
    'web_search': '网络搜索',
    'web_fetch': '获取网页',
    'create_skill': '创建技能',
    'ask_user': '询问用户',
    'todo_write': '更新任务',
    'todo_read': '读取任务'
  };

  // 生成详细的任务描述
  function getDetailedTaskDescription(toolName: string, input: any): string {
    switch (toolName) {
      case 'read_file': {
        const filePath = input?.file_path || '';
        const fileName = filePath.split(/[/\\]/).pop() || filePath;
        return `📖 读取 ${truncate(fileName, 25)}`;
      }
      case 'write_file': {
        const filePath = input?.file_path || '';
        const fileName = filePath.split(/[/\\]/).pop() || filePath;
        return `✏️ 写入 ${truncate(fileName, 25)}`;
      }
      case 'replace': {
        const filePath = input?.file_path || '';
        const fileName = filePath.split(/[/\\]/).pop() || filePath;
        return `📝 替换 ${truncate(fileName, 25)}`;
      }
      case 'list_directory': {
        const dirPath = input?.path || '';
        const dirName = dirPath ? dirPath.split(/[/\\]/).pop() : '当前目录';
        return `📂 列出 ${truncate(dirName, 20)}`;
      }
      case 'glob': {
        const pattern = input?.pattern || '';
        return `🔍 搜索 ${truncate(pattern, 20)}`;
      }
      case 'grep': {
        const pattern = input?.pattern || '';
        return `🔍 查找 "${truncate(pattern, 15)}"`;
      }
      case 'bash': {
        const cmd = input?.command || '';
        return `💻 ${truncate(cmd, 30)}`;
      }
      case 'web_search': {
        const query = input?.query || '';
        return `🌐 搜索 ${truncate(query, 20)}`;
      }
      case 'web_fetch': {
        const url = input?.url || '';
        try {
          const urlObj = new URL(url);
          return `📄 获取 ${urlObj.hostname}`;
        } catch {
          return `📄 获取网页`;
        }
      }
      case 'create_skill': {
        const name = input?.name || '';
        return `✨ 创建技能 ${truncate(name, 15)}`;
      }
      default: {
        const baseName = toolDisplayNames[toolName] || toolName;
        return baseName;
      }
    }
  }

  // 截断字符串
  function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 2) + '…';
  }

  try {
    let iteration = 0;
    // 累积完整的 AI 响应，只在最后发送
    let accumulatedResponse = '';
    // 缓存工具结果与重复调用检测
    const toolCache: Map<string, string> = new Map();
    let lastToolKeys: string[] = [];
    let repeatStreak = 0;
    while (iteration < MAX_ITERATIONS) {
      iteration++;

      let currentResponse = '';
      let toolCalls: any[] = [];

      // 流式响应
      const contextMessages = conversationManager.buildContextMessages(conversationId, content);
      for await (const event of llmService.chatStream(contextMessages, systemPrompt, TOOLS)) {
        if (event.type === 'text' && event.content) {
          currentResponse += event.content;
          // 不再实时发送文本，避免中间过程的重复显示
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

      // 累积响应（用于上下文）
      accumulatedResponse = currentResponse;

      // 没有工具调用，发送最终响应并结束循环
      if (toolCalls.length === 0) {
        // 发送最终的完整响应
        if (accumulatedResponse) {
          yield { type: 'text', data: accumulatedResponse };
        }
        conversationManager.addMessage(conversationId, 'assistant', accumulatedResponse);
        break;
      }

      // 去重当前批次内完全相同的工具调用（保留首个）
      const batchSeen = new Set<string>();
      const uniqueToolCalls: any[] = [];
      for (const tool of toolCalls) {
        const toolKey = `${tool.name}:${stableStringify(tool.input || {})}`;
        if (batchSeen.has(toolKey)) {
          console.log(`[StreamChat] 合并重复工具调用(同批次): ${toolKey}`);
          continue;
        }
        batchSeen.add(toolKey);
        uniqueToolCalls.push(tool);
      }

      toolCalls = uniqueToolCalls;

      const currentToolKeys = toolCalls.map(t => `${t.name}:${stableStringify(t.input || {})}`);
      const isSameAsLast =
        currentToolKeys.length > 0 &&
        currentToolKeys.length === lastToolKeys.length &&
        currentToolKeys.every((k, i) => k === lastToolKeys[i]);

      if (isSameAsLast) {
        repeatStreak++;
      } else {
        repeatStreak = 0;
      }

      if (repeatStreak >= 2) {
        const cachedResults = currentToolKeys
          .map(k => toolCache.get(k))
          .filter((v): v is string => !!v);
        let msg = '检测到相同工具调用重复，我已复用上次结果并停止继续重复。请提供更具体的文件名或路径，或描述要操作的目标。';
        if (cachedResults.length > 0) {
          msg += '\n\n' + cachedResults.join('\n\n');
        }
        yield { type: 'text', data: msg };
        conversationManager.addMessage(conversationId, 'assistant', accumulatedResponse + '\n\n' + msg);
        break;
      }

      // 有工具调用，发送简短的进度提示
      if (currentResponse) {
        conversationManager.addMessage(conversationId, 'assistant', currentResponse);
      }

      // 发送工具调用进度（让用户知道正在做什么）
      const toolNames = toolCalls.map(t => toolDisplayNames[t.name] || t.name).join('、');
      yield { type: 'progress', data: `正在执行: ${toolNames}` };

      // 处理工具调用
      for (const tool of toolCalls) {
        console.log('[StreamChat] 处理工具:', tool.name, JSON.stringify(tool.input || {}).substring(0, 100));
        
        // 当前任务的 ID（用于精确定位）
        let currentTaskId: string | null = null;
        
        if (tool.name === 'todo_write') {
          const todos = tool.input?.todos as TodoItem[];
          if (todos && Array.isArray(todos)) {
            autoProgress.tasks = todos;
            setTodos(conversationId, todos);
            yield { type: 'todo', data: todos };
          }
        } else {
          // 自动进度追踪
          const detailedTask = getDetailedTaskDescription(tool.name, tool.input);
          currentTaskId = `auto-${Date.now()}-${autoProgress.toolCount}`;

          // 清理已完成的旧任务，只保留最近的几个（最多保留3个已完成的）
          const completedTasks = autoProgress.tasks.filter(t => t.status === 'completed');
          if (completedTasks.length > 3) {
            const toRemove = completedTasks.slice(0, completedTasks.length - 3);
            autoProgress.tasks = autoProgress.tasks.filter(t => !toRemove.includes(t));
          }

          // 标记上一个任务为完成
          const lastInProgress = autoProgress.tasks.find(t => t.status === 'in_progress');
          if (lastInProgress) {
            lastInProgress.status = 'completed';
          }

          autoProgress.tasks.push({
            id: currentTaskId,
            task: detailedTask,
            status: 'in_progress'
          });
          autoProgress.toolCount++;
          
          console.log('[StreamChat] 任务列表:', autoProgress.tasks.map(t => `${t.task}:${t.status}`).join(', '));

          yield { type: 'todo', data: autoProgress.tasks };
        }

        const toolKey = `${tool.name}:${stableStringify(tool.input || {})}`;
        let result: string;
        if (toolCache.has(toolKey)) {
          console.log('[StreamChat] 使用缓存结果:', toolKey.substring(0, 50));
          result = toolCache.get(toolKey) || '';
        } else {
          result = await executeTool(
            tool,
            conversationId,
            commandExecutor,
            skillsDir,
            skillLoader,
            conversationManager
          );
          toolCache.set(toolKey, result);
        }

        // 标记当前任务完成（使用 taskId 精确定位）
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

// 执行工具
async function executeTool(
  tool: any,
  conversationId: string,
  commandExecutor: CommandExecutor,
  skillsDir: string,
  skillLoader: SkillLoader,
  conversationManager: ConversationManager
): Promise<string> {

  switch (tool.name) {
    case 'read_file': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      if (!filePath) return '错误：文件路径为空';

      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const offset = tool.input?.offset || 0;
        const limit = tool.input?.limit;

        let lines = fileContent.split('\n');
        if (offset > 0 || limit) {
          lines = lines.slice(offset, limit ? offset + limit : undefined);
        }

        const content = lines.join('\n');
        const truncatedContent = content.length > 15000
          ? content.substring(0, 15000) + '\n... (内容过长，已截断)'
          : content;

        return `文件内容 (${filePath}):\n\`\`\`\n${truncatedContent}\n\`\`\``;
      } catch (e: any) {
        return `读取文件失败: ${e.message}`;
      }
    }

    case 'write_file': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      const fileContent = tool.input?.content;
      if (!filePath || fileContent === undefined) return '错误：参数不完整';

      try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, fileContent, 'utf-8');
        return `写入文件成功: ${filePath}`;
      } catch (e: any) {
        return `写入文件失败: ${e.message}`;
      }
    }

    case 'replace': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      const oldString = tool.input?.old_string;
      const newString = tool.input?.new_string;

      if (!filePath || oldString === undefined || newString === undefined) {
        return '错误：参数不完整';
      }

      const result = replaceInFile(filePath, oldString, newString);
      return result.success
        ? `替换成功: ${filePath} (${result.matches} 处)`
        : `替换失败: ${result.message}`;
    }

    case 'list_directory': {
      const dirPath = resolveToWorkingDir(tool.input?.path);
      if (!dirPath) return '错误：目录路径为空';

      try {
        const items = listDirectory(dirPath);
        const result = items.map(item => {
          const type = item.type === 'directory' ? '[DIR]' : '[FILE]';
          const size = item.size ? ` (${formatBytes(item.size)})` : '';
          return `${type} ${item.name}${size}`;
        }).join('\n');

        return `目录内容 (${dirPath}):\n${result}`;
      } catch (e: any) {
        return `列出目录失败: ${e.message}`;
      }
    }

    case 'glob': {
      const pattern = tool.input?.pattern;
      const searchPath = resolveToWorkingDir(tool.input?.path);

      if (!pattern) return '错误：模式为空';

      const files = globFiles({ pattern, path: searchPath });

      if (files.length === 0) {
        return `未找到匹配 "${pattern}" 的文件`;
      }

      const result = files.slice(0, 50).join('\n');
      return `找到 ${files.length} 个文件匹配 "${pattern}":\n${result}${files.length > 50 ? '\n... (结果已截断)' : ''}`;
    }

    case 'grep': {
      const pattern = tool.input?.pattern;
      const searchPath = resolveToWorkingDir(tool.input?.path);
      const include = tool.input?.include;

      if (!pattern) return '错误：搜索模式为空';

      const results = grepContent({ pattern, path: searchPath, include });

      if (results.length === 0) {
        return `未找到匹配 "${pattern}" 的内容`;
      }

      const output = results.map(r => `${r.file}:${r.line}: ${r.content}`).join('\n');
      return `找到 ${results.length} 个匹配:\n${output}`;
    }

    case 'bash': {
      const cmd = tool.input?.command;
      if (!cmd) return '错误：命令为空';

      if (!commandExecutor.isSafeCommand(cmd)) {
        return `需要用户确认命令: ${cmd}`;
      }

      const result = await commandExecutor.execute(cmd);
      const output = result.success
        ? (result.stdout || '(无输出)')
        : `错误: ${result.stderr || result.stdout}`;
      return `命令: ${cmd}\n${output}`;
    }

    case 'web_search': {
      const query = tool.input?.query;
      if (!query) return '错误：搜索查询为空';

      try {
        const results = await webSearch(query);
        const output = results.map((r, i) =>
          `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`
        ).join('\n\n');
        return `搜索结果:\n${output}`;
      } catch (e: any) {
        return `搜索失败: ${e.message}`;
      }
    }

    case 'web_fetch': {
      const url = tool.input?.url;
      const prompt = tool.input?.prompt;

      if (!url) return '错误：URL 为空';

      try {
        const result = await webFetch(url, prompt);
        if (result.error) {
          return `获取失败: ${result.error}`;
        }
        return `网页内容 (${result.title}):\n${result.content}`;
      } catch (e: any) {
        return `获取失败: ${e.message}`;
      }
    }

    case 'todo_write': {
      const todos = tool.input?.todos as TodoItem[];
      if (!todos || !Array.isArray(todos)) return '错误：任务列表格式无效';

      setTodos(conversationId, todos);

      const output = todos.map((t, i) => {
        const status = { 'pending': '⏳', 'in_progress': '🔄', 'completed': '✅', 'failed': '❌' }[t.status] || '⏳';
        return `${status} ${i + 1}. ${t.task}`;
      }).join('\n');

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

      return `当前任务:\n${output}`;
    }

    case 'create_skill': {
      const skillName = tool.input?.name;
      const skillDesc = tool.input?.description || '';
      const skillPrompt = tool.input?.prompt;
      const triggers = tool.input?.triggers || [];

      if (!skillName || !skillPrompt) {
        return '错误：技能名称和提示词不能为空';
      }

      try {
        let skillContent = `# ${skillName}\n\n${skillDesc}\n\n`;

        if (triggers.length > 0) {
          skillContent += `TRIGGER\n`;
          for (const trigger of triggers) {
            skillContent += `- ${trigger}\n`;
          }
          skillContent += '\n';
        }

        skillContent += `PROMPT:\n${skillPrompt}\n`;

        const safeName = skillName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_');
        const skillPath = path.join(skillsDir, `${safeName}.md`);

        if (!fs.existsSync(skillsDir)) {
          fs.mkdirSync(skillsDir, { recursive: true });
        }

        fs.writeFileSync(skillPath, skillContent, 'utf-8');
        skillLoader.loadAll();

        return `技能创建成功: ${skillName} (${skillPath})`;
      } catch (e: any) {
        return `创建技能失败: ${e.message}`;
      }
    }

    case 'ask_user': {
      const question = tool.input?.question;
      if (!question) return '错误：问题为空';

      // SSE 模式下不支持实时交互，返回提示
      return `需要用户输入: ${question}`;
    }

    default:
      return `未知工具: ${tool.name}`;
  }
}

function resolveToWorkingDir(target?: string): string {
  if (!target) return getWorkingDir();
  return path.isAbsolute(target) ? target : path.resolve(getWorkingDir(), target);
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
