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
        file_path: { type: 'string', description: '文件的绝对路径' },
        offset: { type: 'number', description: '可选：起始行号（0-based）' },
        limit: { type: 'number', description: '可选：读取的最大行数' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'write_file',
    description: '创建新文件或覆盖现有文件的内容。文件路径必须是绝对路径。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '文件的绝对路径' },
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
        file_path: { type: 'string', description: '文件的绝对路径' },
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
        path: { type: 'string', description: '目录的绝对路径' }
      },
      required: ['path']
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
    description: '执行 shell 命令。用于安装软件、运行脚本、Git 操作等。危险命令需要用户确认。',
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

const SYSTEM_PROMPT = `你是一个强大的 AI 编程助手，可以通过工具执行各种操作。

## 核心原则

1. **行动优先**：当用户请求操作时，直接调用相应工具执行，不要只是描述
2. **避免重复**：同一操作不要重复执行，收到工具结果后判断任务是否完成
3. **逐步执行**：复杂任务拆分成多个步骤，一步步完成
4. **使用 Todo 跟踪**：多步骤任务使用 todo_write 跟踪进度

## 环境说明

- 操作系统：Windows
- 使用 Windows 命令：dir 代替 ls，type 代替 cat，findstr 代替 grep
- 路径分隔符：反斜杠 \\ 或正斜杠 / 都可以

## 可用工具

### 文件系统
- read_file: 读取文件内容
- write_file: 创建/覆盖文件
- replace: 精确替换文件中的文本
- list_directory: 列出目录内容
- glob: 使用模式搜索文件（**/*.ts, src/**/*.js）
- grep: 在文件内容中搜索模式

### Shell
- bash: 执行 shell 命令

### 网络
- web_search: 网络搜索
- web_fetch: 获取网页内容

### 任务管理
- todo_write: 写入任务列表
- todo_read: 读取任务列表

### 其他
- create_skill: 创建技能文件
- ask_user: 向用户提问

## 工作流程

1. 理解用户需求
2. 如果是复杂任务，先用 todo_write 创建任务列表
3. 按顺序执行各个步骤
4. 完成后报告结果

## 注意事项

- 文件路径必须是绝对路径
- replace 工具需要精确匹配，包含足够的上下文
- 危险命令会要求用户确认
- 读取文件后再进行修改，不要猜测文件内容`;

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
  let systemPrompt = SYSTEM_PROMPT;
  if (skillName) {
    const skill = skillLoader.get(skillName);
    if (skill && skill.prompt) {
      systemPrompt = skill.prompt;
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

  try {
    let iteration = 0;
    // 累积完整的 AI 响应，只在最后发送
    let accumulatedResponse = '';

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

      // 有工具调用，发送简短的进度提示
      if (currentResponse) {
        conversationManager.addMessage(conversationId, 'assistant', currentResponse);
      }

      // 发送工具调用进度（让用户知道正在做什么）
      const toolNames = toolCalls.map(t => toolDisplayNames[t.name] || t.name).join('、');
      yield { type: 'progress', data: `正在执行: ${toolNames}` };

      // 处理工具调用
      for (const tool of toolCalls) {
        if (tool.name === 'todo_write') {
          const todos = tool.input?.todos as TodoItem[];
          if (todos && Array.isArray(todos)) {
            autoProgress.tasks = todos;
            setTodos(conversationId, todos);
            yield { type: 'todo', data: todos };
          }
        } else {
          // 自动进度追踪
          const displayName = toolDisplayNames[tool.name] || tool.name;
          const taskId = `auto-${Date.now()}-${autoProgress.toolCount}`;

          const lastInProgress = autoProgress.tasks.find(t => t.status === 'in_progress');
          if (lastInProgress) {
            lastInProgress.status = 'completed';
          }

          autoProgress.tasks.push({
            id: taskId,
            task: displayName,
            status: 'in_progress'
          });
          autoProgress.toolCount++;

          yield { type: 'todo', data: autoProgress.tasks };
        }

        const result = await executeTool(
          tool,
          conversationId,
          commandExecutor,
          skillsDir,
          skillLoader,
          conversationManager
        );

        // 标记任务完成
        const currentTask = autoProgress.tasks.find(t => t.status === 'in_progress');
        if (currentTask) {
          currentTask.status = 'completed';
          yield { type: 'todo', data: autoProgress.tasks };
        }

        // 发送工具结果事件
        yield { type: 'tool_result', data: { name: tool.name, result } };

        // 将工具结果添加到对话
        conversationManager.addMessage(conversationId, 'user', `[工具结果] ${result}`);
      }
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
      const filePath = tool.input?.file_path;
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
      const filePath = tool.input?.file_path;
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
      const filePath = tool.input?.file_path;
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
      const dirPath = tool.input?.path || getWorkingDir();
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
      const searchPath = tool.input?.path || getWorkingDir();

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
      const searchPath = tool.input?.path || getWorkingDir();
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
