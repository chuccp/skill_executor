import * as fs from 'fs';
import * as path from 'path';
import { WebSocket } from 'ws';
import { CommandExecutor } from './commandExecutor';
import { SkillLoader } from './skillLoader';
import { ConversationManager } from './conversation';
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

// ==================== 工具定义 ====================

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
  },
  // ========== 媒体文件工具 ==========
  {
    name: 'get_files',
    description: '获取指定目录的文件列表，支持按类型过滤。用于查找可播放的媒体文件。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径（绝对路径或相对路径）' },
        filter: { type: 'string', description: '可选：文件类型过滤，可选值：audio, video, image, document, code' }
      },
      required: ['path']
    }
  },
  {
    name: 'play_media',
    description: '播放指定的媒体文件（音频或视频）。会返回可在界面上播放的媒体信息。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '媒体文件的绝对路径' }
      },
      required: ['file_path']
    }
  }
];

// ==================== 工具执行上下文 ====================

export interface ToolContext {
  conversationId: string;
  commandExecutor: CommandExecutor;
  skillsDir: string;
  skillLoader: SkillLoader;
  conversationManager: ConversationManager;
  ws?: WebSocket;  // WebSocket 模式下用于发送事件
  pendingCommands?: Map<string, any>;
  pendingQuestions?: Map<string, any>;
}

// ==================== 工具执行函数 ====================

export async function executeTool(
  tool: { name: string; input?: any },
  ctx: ToolContext
): Promise<string> {
  const { conversationId, commandExecutor, skillsDir, skillLoader, conversationManager, ws, pendingCommands, pendingQuestions } = ctx;

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
        const truncatedContent = content.length > 15000
          ? content.substring(0, 15000) + '\n... (内容过长，已截断)'
          : content;

        if (ws) {
          ws.send(JSON.stringify({ type: 'file_read', path: filePath, content: truncatedContent }));
        }

        return `文件内容 (${filePath}):\n\`\`\`\n${truncatedContent}\n\`\`\``;
      } catch (e: any) {
        const errMsg = `读取文件失败: ${e.message}`;
        if (ws) ws.send(JSON.stringify({ type: 'error', content: errMsg }));
        return errMsg;
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
        if (ws) ws.send(JSON.stringify({ type: 'file_written', path: filePath }));
        return `写入文件成功: ${filePath}`;
      } catch (e: any) {
        const errMsg = `写入文件失败: ${e.message}`;
        if (ws) ws.send(JSON.stringify({ type: 'error', content: errMsg }));
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
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'file_replaced', path: filePath, matches: result.matches }));
      }
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

        if (ws) ws.send(JSON.stringify({ type: 'directory_list', path: dirPath, items }));
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
      if (ws) ws.send(JSON.stringify({ type: 'glob_result', pattern, files: files.slice(0, 50) }));
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
      if (ws) ws.send(JSON.stringify({ type: 'grep_result', pattern, results }));
      return `找到 ${results.length} 个匹配:\n${output}`;
    }

    // ========== Shell 工具 ==========
    case 'bash': {
      const cmd = tool.input?.command;
      if (!cmd) return '错误：命令为空';

      if (!commandExecutor.isSafeCommand(cmd)) {
        // SSE 模式：返回需要确认的提示
        if (!ws || !pendingCommands) {
          return `需要用户确认命令: ${cmd}`;
        }
        // WebSocket 模式：等待用户确认
        return new Promise((resolve) => {
          const confirmId = `${conversationId}-${Date.now()}`;
          pendingCommands.set(confirmId, { command: cmd, ws, conversationId, resolve });
          ws.send(JSON.stringify({ type: 'command_confirm', confirmId, command: cmd }));
        });
      }

      if (ws) ws.send(JSON.stringify({ type: 'command_start', command: cmd }));
      const result = await commandExecutor.execute(cmd);
      if (ws) {
        ws.send(JSON.stringify({
          type: 'command_result',
          command: cmd,
          success: result.success,
          stdout: result.stdout,
          stderr: result.stderr
        }));
      }

      const output = result.success
        ? (result.stdout || '(无输出)')
        : `错误: ${result.stderr || result.stdout}`;
      return `命令: ${cmd}\n${output}`;
    }

    // ========== 网络工具 ==========
    case 'web_search': {
      const query = tool.input?.query;
      if (!query) return '错误：搜索查询为空';

      if (ws) ws.send(JSON.stringify({ type: 'search_start', query }));

      try {
        const results = await webSearch(query);
        const output = results.map((r, i) =>
          `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`
        ).join('\n\n');

        if (ws) ws.send(JSON.stringify({ type: 'search_result', query, results }));
        return `搜索结果:\n${output}`;
      } catch (e: any) {
        return `搜索失败: ${e.message}`;
      }
    }

    case 'web_fetch': {
      const url = tool.input?.url;
      const prompt = tool.input?.prompt;

      if (!url) return '错误：URL 为空';

      if (ws) ws.send(JSON.stringify({ type: 'fetch_start', url }));

      try {
        const result = await webFetch(url, prompt);

        if (result.error) {
          return `获取失败: ${result.error}`;
        }

        if (ws) ws.send(JSON.stringify({ type: 'fetch_result', url, title: result.title }));
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

        if (ws) {
          ws.send(JSON.stringify({ type: 'skill_created', name: skillName, path: skillPath }));
        }
        return `技能创建成功: ${skillName} (${skillPath})`;
      } catch (e: any) {
        const errMsg = `创建技能失败: ${e.message}`;
        if (ws) ws.send(JSON.stringify({ type: 'error', content: errMsg }));
        return errMsg;
      }
    }

    // ========== 询问用户工具 ==========
    case 'ask_user': {
      const question = tool.input?.question;
      const header = tool.input?.header || '问题';
      const options = tool.input?.options;

      if (!question) return '错误：问题为空';

      // SSE 模式：不支持实时交互
      if (!ws || !pendingQuestions) {
        return `需要用户输入: ${question}`;
      }

      // WebSocket 模式：等待用户回复
      return new Promise((resolve) => {
        const askId = `${conversationId}-${Date.now()}`;
        pendingQuestions.set(askId, { resolve });
        ws.send(JSON.stringify({ type: 'ask_user', askId, question, header, options: options || null }));
      });
    }

    // ========== 媒体文件工具 ==========
    case 'get_files': {
      const rawPath = tool.input?.path;
      const filter = tool.input?.filter as string | undefined;
      const dirPath = rawPath ? resolveToWorkingDir(rawPath) : '';

      if (!dirPath) return '错误：目录路径为空';

      try {
        if (!fs.existsSync(dirPath)) {
          return `错误：目录不存在: ${dirPath}`;
        }

        if (!fs.statSync(dirPath).isDirectory()) {
          return `错误：路径不是目录: ${dirPath}`;
        }

        const filterExtensions: Record<string, string[]> = {
          audio: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma'],
          video: ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.wmv', '.flv'],
          image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'],
          document: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md'],
          code: ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.css', '.html', '.json', '.xml']
        };

        const files = fs.readdirSync(dirPath);
        const fileList: any[] = [];

        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stat = fs.statSync(filePath);
          const ext = path.extname(file).toLowerCase();

          if (filter && filterExtensions[filter]) {
            if (!stat.isDirectory() && !filterExtensions[filter].includes(ext)) {
              continue;
            }
          }

          fileList.push({
            name: file,
            path: filePath.replace(/\\/g, '/'),
            size: stat.size,
            isDirectory: stat.isDirectory(),
            extension: ext
          });
        }

        fileList.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

        const output = fileList.map(f => {
          const type = f.isDirectory ? '[DIR]' : `[${f.extension || 'FILE'}]`;
          const size = f.size ? ` (${formatBytes(f.size)})` : '';
          return `${type} ${f.name}${size}`;
        }).join('\n');

        return `目录 ${dirPath} 中的文件 (${fileList.length} 个):\n${output}`;
      } catch (e: any) {
        return `获取文件列表失败: ${e.message}`;
      }
    }

    case 'play_media': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';

      if (!filePath) return '错误：文件路径为空';

      try {
        if (!fs.existsSync(filePath)) {
          return `错误：文件不存在: ${filePath}`;
        }

        const ext = path.extname(filePath).toLowerCase();
        const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
        const videoExts = ['.mp4', '.webm', '.avi', '.mov', '.mkv'];
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];

        let mediaType = 'unknown';
        if (audioExts.includes(ext)) mediaType = 'audio';
        else if (videoExts.includes(ext)) mediaType = 'video';
        else if (imageExts.includes(ext)) mediaType = 'image';

        if (mediaType === 'unknown') {
          return `错误：不支持的媒体类型: ${ext}`;
        }

        const fileName = path.basename(filePath);
        const stat = fs.statSync(filePath);
        const fileSize = formatBytes(stat.size);

        // WebSocket 模式：发送播放事件
        if (ws) {
          ws.send(JSON.stringify({
            type: 'play_media',
            mediaType,
            path: filePath,
            name: fileName,
            size: fileSize
          }));
        }

        // SSE 模式：返回特殊格式供前端解析
        return `MEDIA_INFO:${JSON.stringify({
          type: mediaType,
          path: filePath,
          name: fileName,
          size: fileSize
        })}`;
      } catch (e: any) {
        return `播放媒体失败: ${e.message}`;
      }
    }

    default:
      return `未知工具: ${tool.name}`;
  }
}

// ==================== 辅助函数 ====================

function resolveToWorkingDir(target?: string): string {
  if (!target) return getWorkingDir();
  return path.isAbsolute(target) ? target : path.resolve(getWorkingDir(), target);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
