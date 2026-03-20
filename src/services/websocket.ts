import { WebSocketServer, WebSocket } from 'ws';
import { ConversationManager } from './conversation';
import { SkillLoader } from './skillLoader';
import { LLMService } from './llm';
import { CommandExecutor } from './commandExecutor';
import { IncomingMessage } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import {
  globFiles,
  grepContent,
  webSearch,
  webFetch,
  getTodos,
  setTodos,
  addTodo,
  updateTodo,
  listDirectory,
  replaceInFile,
  TodoItem
} from './tools';
import { getWorkingDir } from './workingDir';

interface WSMessage {
  type: 'chat' | 'config' | 'ping' | 'confirm_command' | 'ask_response';
  conversationId?: string;
  content?: string;
  skillName?: string;
  config?: any;
  command?: string;
  approved?: boolean;
  confirmId?: string;
  askId?: string;
  answer?: any;
}

// 工具定义
const TOOLS = [
  // ========== 文件系统工具 ==========
  {
    name: 'read_file',
    description: '读取文件内容。支持文本文件、图片、PDF、DOCX、Excel 等。对于大文件会自动截断。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: '文件路径（绝对路径，或相对当前工作目录）'
        },
        offset: {
          type: 'number',
          description: '可选：起始行号（0-based）'
        },
        limit: {
          type: 'number',
          description: '可选：读取的最大行数'
        }
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
        file_path: {
          type: 'string',
          description: '文件路径（绝对路径，或相对当前工作目录）'
        },
        content: {
          type: 'string',
          description: '要写入的内容'
        }
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
        file_path: {
          type: 'string',
          description: '文件路径（绝对路径，或相对当前工作目录）'
        },
        old_string: {
          type: 'string',
          description: '要替换的原始文本（必须精确匹配）'
        },
        new_string: {
          type: 'string',
          description: '替换后的新文本'
        }
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
        path: {
          type: 'string',
          description: '目录路径（绝对路径，或相对当前工作目录）'
        }
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
        pattern: {
          type: 'string',
          description: 'Glob 模式，如 **/*.ts、src/**/*.js'
        },
        path: {
          type: 'string',
          description: '可选：搜索的根目录，默认为项目根目录'
        }
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
        pattern: {
          type: 'string',
          description: '正则表达式模式'
        },
        path: {
          type: 'string',
          description: '可选：搜索的目录路径'
        },
        include: {
          type: 'string',
          description: '可选：文件 glob 模式，如 *.ts'
        }
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
        command: {
          type: 'string',
          description: '要执行的 shell 命令'
        },
        description: {
          type: 'string',
          description: '可选：命令的简短描述'
        }
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
        query: {
          type: 'string',
          description: '搜索查询'
        }
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
        url: {
          type: 'string',
          description: '要获取的 URL'
        },
        prompt: {
          type: 'string',
          description: '可选：提取信息的提示'
        }
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
        name: {
          type: 'string',
          description: '技能名称'
        },
        description: {
          type: 'string',
          description: '技能的简短描述'
        },
        prompt: {
          type: 'string',
          description: '技能的系统提示词'
        },
        triggers: {
          type: 'array',
          items: { type: 'string' },
          description: '可选：触发关键词列表'
        }
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
        question: {
          type: 'string',
          description: '要问用户的问题'
        },
        header: {
          type: 'string',
          description: '问题的简短标题（最多12字符）'
        },
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

  return `你是一个强大的 AI 编程助手，可以通过工具执行各种操作。

## 核心原则

1. **行动优先**：当用户请求操作时，直接调用相应工具执行，不要只是描述
2. **避免重复**：同一操作不要重复执行，收到工具结果后判断任务是否完成
3. **逐步执行**：复杂任务拆分成多个步骤，一步步完成
4. **使用 Todo 跟踪**：多步骤任务使用 todo_write 跟踪进度

## 环境说明

- 操作系统：${osName}
- 当前工作目录：${cwd}
- 常用命令：${listCmd} 列目录，${catCmd} 查看文件，${grepCmd} 搜索内容
- 路径可以使用绝对路径，或相对当前工作目录

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

- 优先使用绝对路径；相对路径按“当前工作目录”解析
- replace 工具需要精确匹配，包含足够的上下文
- 危险命令会要求用户确认
- 读取文件后再进行修改，不要猜测文件内容`;
}

export function setupWebSocket(
  wss: WebSocketServer,
  conversationManager: ConversationManager,
  skillLoader: SkillLoader,
  llmService: LLMService,
  commandExecutor: CommandExecutor
) {
  const skillsDir = path.join(process.cwd(), 'skills');
  
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    console.log('WebSocket client connected');

    ws.on('message', async (data: Buffer) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'chat':
            await handleChat(ws, message, conversationManager, skillLoader, llmService, commandExecutor, skillsDir);
            break;
          case 'confirm_command':
            await handleConfirmCommand(ws, message, commandExecutor);
            break;
          case 'ask_response':
            handleAskResponse(ws, message);
            break;
          case 'config':
            handleConfig(ws, message, llmService);
            break;
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
        }
      } catch (error: any) {
        ws.send(JSON.stringify({ type: 'error', content: error.message }));
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });
  });
}

// 存储待确认的命令
const pendingCommands: Map<string, { 
  command: string; 
  ws: WebSocket; 
  conversationId: string; 
  resolve: (result: string) => void 
}> = new Map();

// 存储待回答的问题
const pendingQuestions: Map<string, { 
  resolve: (answer: any) => void 
}> = new Map();

async function handleChat(
  ws: WebSocket,
  message: WSMessage,
  conversationManager: ConversationManager,
  skillLoader: SkillLoader,
  llmService: LLMService,
  commandExecutor: CommandExecutor,
  skillsDir: string
) {
  const { conversationId, content, skillName } = message;
  console.log('[WS] 收到聊天消息:', { conversationId, content: content?.substring(0, 50), skillName });

  if (!conversationId || !content) {
    ws.send(JSON.stringify({ type: 'error', content: 'Missing conversationId or content' }));
    return;
  }

  const conversation = conversationManager.get(conversationId);
  if (!conversation) {
    ws.send(JSON.stringify({ type: 'error', content: 'Conversation not found' }));
    return;
  }

  // 添加用户消息
  conversationManager.addMessage(conversationId, 'user', content);
  ws.send(JSON.stringify({ type: 'user_message', content }));

  // 获取 skill 的 prompt，如果没有则使用默认系统提示
  const basePrompt = buildSystemPrompt();
  let systemPrompt = basePrompt;
  if (skillName) {
    const skill = skillLoader.get(skillName);
    if (skill && skill.prompt) {
      systemPrompt = `${skill.prompt}\n\n${basePrompt}`;
      console.log('[WS] 使用技能:', skillName);
    }
  }

  const MAX_ITERATIONS = 20; // 增加到20轮工具调用

  // 自动进度追踪
  const autoProgress: { tasks: TodoItem[], toolCount: number } = { tasks: [], toolCount: 0 };
  
  // 工具名称映射到友好显示名
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

    while (iteration < MAX_ITERATIONS) {
      iteration++;
      console.log(`[WS] 第 ${iteration} 轮调用...`);

      let fullResponse = '';
      let toolCalls: any[] = [];

      // 流式响应
      const contextMessages = conversationManager.buildContextMessages(conversationId, content);
      for await (const event of llmService.chatStream(contextMessages, systemPrompt, TOOLS)) {
        if (event.type === 'text' && event.content) {
          fullResponse += event.content;
          ws.send(JSON.stringify({ type: 'text', content: event.content }));
        } else if (event.type === 'tool_use') {
          toolCalls.push({
            id: event.toolId,
            name: event.toolName,
            input: event.toolInput
          });
        } else if (event.type === 'error') {
          console.error('[WS] 流式错误:', event.content);
          ws.send(JSON.stringify({ type: 'error', content: event.content }));
          return;
        }
      }

      console.log('[WS] 响应长度:', fullResponse.length, '工具调用:', toolCalls.length);

      // 如果没有工具调用，结束循环
      if (toolCalls.length === 0) {
        conversationManager.addMessage(conversationId, 'assistant', fullResponse);
        break;
      }

      // 处理工具调用
      for (const tool of toolCalls) {
        console.log('[WS] 工具:', tool.name, JSON.stringify(tool.input).substring(0, 100));
        
        // 当前任务的 ID（用于精确定位）
        let currentTaskId: string | null = null;
        
        // 如果是 todo_write，使用 AI 提供的任务列表
        if (tool.name === 'todo_write') {
          const todos = tool.input?.todos as TodoItem[];
          if (todos && Array.isArray(todos)) {
            autoProgress.tasks = todos;
            setTodos(conversationId, todos);
            ws.send(JSON.stringify({ type: 'todo_updated', todos }));
          }
        } else {
          // 自动添加进度任务
          const detailedTask = getDetailedTaskDescription(tool.name, tool.input);
          currentTaskId = `auto-${Date.now()}-${autoProgress.toolCount}`;
          
          // 清理已完成的自动任务，只保留最近的几个
          if (autoProgress.tasks.length > 5) {
            autoProgress.tasks = autoProgress.tasks.filter(t => t.status === 'in_progress');
          }
          
          // 标记上一个任务为完成
          const lastInProgress = autoProgress.tasks.find(t => t.status === 'in_progress');
          if (lastInProgress) {
            lastInProgress.status = 'completed';
          }
          
          // 添加新任务
          autoProgress.tasks.push({
            id: currentTaskId,
            task: detailedTask,
            status: 'in_progress'
          });
          autoProgress.toolCount++;
          
          // 发送进度更新
          ws.send(JSON.stringify({ type: 'todo_updated', todos: autoProgress.tasks }));
        }
        
        // 执行工具
        const result = await executeTool(
          tool, 
          ws, 
          conversationId, 
          commandExecutor, 
          skillsDir, 
          skillLoader,
          conversationManager
        );
        
        // 标记当前任务完成（使用 taskId 精确定位）
        if (currentTaskId) {
          const currentTask = autoProgress.tasks.find(t => t.id === currentTaskId);
          if (currentTask) {
            currentTask.status = 'completed';
            ws.send(JSON.stringify({ type: 'todo_updated', todos: autoProgress.tasks }));
          }
        }

        // 将工具结果作为用户消息添加到对话
        conversationManager.addMessage(conversationId, 'user', `[工具结果] ${result}`);
      }
    }

    // 标记所有任务完成
    autoProgress.tasks.forEach(t => t.status = 'completed');
    ws.send(JSON.stringify({ type: 'todo_updated', todos: autoProgress.tasks }));
    
    ws.send(JSON.stringify({ type: 'done' }));
  } catch (error: any) {
    console.error('[WS] 异常:', error);
    ws.send(JSON.stringify({ type: 'error', content: error.message }));
  }
}

// 执行工具
async function executeTool(
  tool: any,
  ws: WebSocket,
  conversationId: string,
  commandExecutor: CommandExecutor,
  skillsDir: string,
  skillLoader: SkillLoader,
  conversationManager: ConversationManager
): Promise<string> {
  
  switch (tool.name) {
    // ========== 文件系统工具 ==========
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
        const truncatedContent = content.length > 8000
          ? content.substring(0, 8000) + '\n... (内容过长，已截断，可使用 offset/limit 参数分段读取)'
          : content;
        
        ws.send(JSON.stringify({ type: 'file_read', path: filePath, content: truncatedContent }));
        return `文件内容 (${filePath}):\n\`\`\`\n${truncatedContent}\n\`\`\``;
      } catch (e: any) {
        const errMsg = `读取文件失败: ${e.message}`;
        ws.send(JSON.stringify({ type: 'error', content: errMsg }));
        return errMsg;
      }
    }

    case 'write_file': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      const fileContent = tool.input?.content;
      if (!filePath || fileContent === undefined) return '错误：参数不完整';
      
      try {
        // 确保目录存在
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, fileContent, 'utf-8');
        ws.send(JSON.stringify({ type: 'file_written', path: filePath }));
        return `写入文件成功: ${filePath}`;
      } catch (e: any) {
        const errMsg = `写入文件失败: ${e.message}`;
        ws.send(JSON.stringify({ type: 'error', content: errMsg }));
        return errMsg;
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
      
      if (result.success) {
        ws.send(JSON.stringify({ type: 'file_replaced', path: filePath, matches: result.matches }));
        return `替换成功: ${filePath} (${result.matches} 处)`;
      } else {
        return `替换失败: ${result.message}`;
      }
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
        
        ws.send(JSON.stringify({ type: 'directory_list', path: dirPath, items }));
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
      ws.send(JSON.stringify({ type: 'glob_result', pattern, files: files.slice(0, 50) }));
      
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
      ws.send(JSON.stringify({ type: 'grep_result', pattern, results }));
      
      return `找到 ${results.length} 个匹配:\n${output}`;
    }

    // ========== Shell 工具 ==========
    case 'bash': {
      const cmd = tool.input?.command;
      if (!cmd) return '错误：命令为空';

      console.log('[WS] 执行命令:', cmd);

      if (!commandExecutor.isSafeCommand(cmd)) {
        return new Promise((resolve) => {
          const confirmId = `${conversationId}-${Date.now()}`;
          pendingCommands.set(confirmId, {
            command: cmd,
            ws,
            conversationId,
            resolve
          });
          ws.send(JSON.stringify({
            type: 'command_confirm',
            confirmId,
            command: cmd
          }));
        });
      } else {
        ws.send(JSON.stringify({ type: 'command_start', command: cmd }));
        const result = await commandExecutor.execute(cmd);
        ws.send(JSON.stringify({
          type: 'command_result',
          command: cmd,
          success: result.success,
          stdout: result.stdout,
          stderr: result.stderr
        }));
        
        const output = result.success 
          ? (result.stdout || '(无输出)') 
          : `错误: ${result.stderr || result.stdout}`;
        return `命令: ${cmd}\n${output}`;
      }
    }

    // ========== 网络工具 ==========
    case 'web_search': {
      const query = tool.input?.query;
      if (!query) return '错误：搜索查询为空';
      
      ws.send(JSON.stringify({ type: 'search_start', query }));
      
      try {
        const results = await webSearch(query);
        const output = results.map((r, i) => 
          `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`
        ).join('\n\n');
        
        ws.send(JSON.stringify({ type: 'search_result', query, results }));
        return `搜索结果:\n${output}`;
      } catch (e: any) {
        return `搜索失败: ${e.message}`;
      }
    }

    case 'web_fetch': {
      const url = tool.input?.url;
      const prompt = tool.input?.prompt;
      
      if (!url) return '错误：URL 为空';
      
      ws.send(JSON.stringify({ type: 'fetch_start', url }));
      
      try {
        const result = await webFetch(url, prompt);
        
        if (result.error) {
          return `获取失败: ${result.error}`;
        }
        
        ws.send(JSON.stringify({ type: 'fetch_result', url, title: result.title }));
        return `网页内容 (${result.title}):\n${result.content}`;
      } catch (e: any) {
        return `获取失败: ${e.message}`;
      }
    }

    // ========== 任务管理工具 ==========
    case 'todo_write': {
      const todos = tool.input?.todos as TodoItem[];
      if (!todos || !Array.isArray(todos)) return '错误：任务列表格式无效';
      
      setTodos(conversationId, todos);
      
      // 格式化输出
      const output = todos.map((t, i) => {
        const status = {
          'pending': '⏳',
          'in_progress': '🔄',
          'completed': '✅',
          'failed': '❌'
        }[t.status] || '⏳';
        const priority = t.priority ? ` [${t.priority}]` : '';
        return `${status} ${i + 1}. ${t.task}${priority}`;
      }).join('\n');
      
      ws.send(JSON.stringify({ type: 'todo_updated', todos }));
      return `任务列表已更新:\n${output}`;
    }

    case 'todo_read': {
      const todos = getTodos(conversationId);
      
      if (todos.length === 0) {
        return '当前没有任务';
      }
      
      const output = todos.map((t, i) => {
        const status = {
          'pending': '⏳',
          'in_progress': '🔄',
          'completed': '✅',
          'failed': '❌'
        }[t.status] || '⏳';
        return `${status} ${i + 1}. ${t.task}`;
      }).join('\n');
      
      ws.send(JSON.stringify({ type: 'todo_read', todos }));
      return `当前任务:\n${output}`;
    }

    // ========== Skill 工具 ==========
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

        ws.send(JSON.stringify({
          type: 'skill_created',
          name: skillName,
          path: skillPath
        }));
        return `技能创建成功: ${skillName} (${skillPath})`;
      } catch (e: any) {
        const errMsg = `创建技能失败: ${e.message}`;
        ws.send(JSON.stringify({ type: 'error', content: errMsg }));
        return errMsg;
      }
    }

    // ========== 询问用户工具 ==========
    case 'ask_user': {
      const question = tool.input?.question;
      const header = tool.input?.header || '问题';
      const options = tool.input?.options;

      if (!question) return '错误：问题为空';

      return new Promise((resolve) => {
        const askId = `${conversationId}-${Date.now()}`;
        pendingQuestions.set(askId, { resolve });

        ws.send(JSON.stringify({
          type: 'ask_user',
          askId,
          question,
          header,
          options: options || null
        }));
      });
    }

    default:
      return `未知工具: ${tool.name}`;
  }
}

function resolveToWorkingDir(target?: string): string {
  if (!target) return getWorkingDir();
  return path.isAbsolute(target) ? target : path.resolve(getWorkingDir(), target);
}

function handleAskResponse(ws: WebSocket, message: WSMessage) {
  const { askId, answer } = message;
  
  if (!askId) {
    ws.send(JSON.stringify({ type: 'error', content: '缺少问题ID' }));
    return;
  }

  const pending = pendingQuestions.get(askId);
  if (!pending) {
    ws.send(JSON.stringify({ type: 'error', content: '问题已过期' }));
    return;
  }

  pendingQuestions.delete(askId);
  pending.resolve(answer);
}

async function handleConfirmCommand(
  ws: WebSocket,
  message: WSMessage,
  commandExecutor: CommandExecutor
) {
  const { confirmId, approved } = message;

  if (!confirmId) {
    ws.send(JSON.stringify({ type: 'error', content: '缺少确认ID' }));
    return;
  }

  const pending = pendingCommands.get(confirmId);
  if (!pending) {
    ws.send(JSON.stringify({ type: 'error', content: '确认请求已过期' }));
    return;
  }

  pendingCommands.delete(confirmId);

  if (!approved) {
    ws.send(JSON.stringify({ type: 'command_cancelled', command: pending.command }));
    if (pending.resolve) {
      pending.resolve(`命令已取消: ${pending.command}`);
    }
    return;
  }

  ws.send(JSON.stringify({ type: 'command_start', command: pending.command }));

  const result = await commandExecutor.execute(pending.command);

  ws.send(JSON.stringify({
    type: 'command_result',
    command: pending.command,
    success: result.success,
    stdout: result.stdout,
    stderr: result.stderr
  }));

  if (pending.resolve) {
    const output = result.success 
      ? (result.stdout || '(无输出)') 
      : `错误: ${result.stderr || result.stdout}`;
    pending.resolve(`命令: ${pending.command}\n${output}`);
  }
}

function handleConfig(ws: WebSocket, message: WSMessage, llmService: LLMService) {
  if (message.config) {
    llmService.updateConfig(message.config);
    ws.send(JSON.stringify({ type: 'config_updated' }));
  }
}

// 辅助函数：格式化字节
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default setupWebSocket;
