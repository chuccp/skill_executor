import { Router, Request, Response } from 'express';
import { ConversationManager } from '../services/conversation';
import { SkillLoader } from '../services/skillLoader';
import { LLMService } from '../services/llm';
import { ConfigLoader } from '../services/configLoader';
import { CommandExecutor } from '../services/commandExecutor';
import { streamChat } from '../services/streamChat';
import { listDirectory } from '../services/tools';
import { getWorkingDir, setWorkingDir } from '../services/workingDir';
import { LLMConfig } from '../types';
import * as path from 'path';
import * as fs from 'fs';

export function createApiRouter(
  conversationManager: ConversationManager,
  skillLoader: SkillLoader,
  llmService: LLMService,
  configLoader: ConfigLoader,
  commandExecutor?: CommandExecutor
): Router {
  const router = Router();
  let workingDir = getWorkingDir();

  // ========== 会话管理 ==========

  // 创建新会话
  router.post('/conversations', (req: Request, res: Response) => {
    const conversation = conversationManager.create();
    res.json({ success: true, data: conversation });
  });

  // 获取所有会话元数据（用于列表显示）
  router.get('/conversations/meta', (req: Request, res: Response) => {
    const metaList = conversationManager.getAllMeta();
    res.json({ success: true, data: metaList });
  });

  // 获取所有会话（完整数据）
  router.get('/conversations', (req: Request, res: Response) => {
    const conversations = conversationManager.getAll();
    res.json({ success: true, data: conversations });
  });

  // 获取单个会话
  router.get('/conversations/:id', (req: Request, res: Response) => {
    const conversation = conversationManager.get(req.params.id);
    if (!conversation) {
      res.json({ success: false, error: 'Conversation not found' });
      return;
    }
    res.json({ success: true, data: conversation });
  });

  // 删除会话
  router.delete('/conversations/:id', (req: Request, res: Response) => {
    const success = conversationManager.delete(req.params.id);
    res.json({ success });
  });

  // 清空会话消息（保留会话）
  router.delete('/conversations/:id/messages', (req: Request, res: Response) => {
    const success = conversationManager.clear(req.params.id);
    res.json({ success });
  });

  // 压缩会话
  router.post('/conversations/:id/compress', (req: Request, res: Response) => {
    const success = conversationManager.compress(req.params.id);
    res.json({ success });
  });

  // 获取会话统计
  router.get('/conversations/stats', (req: Request, res: Response) => {
    const stats = conversationManager.getStats();
    res.json({ success: true, data: stats });
  });

  // 获取记忆统计
  router.get('/conversations/:id/memory-stats', (req: Request, res: Response) => {
    const conversation = conversationManager.get(req.params.id);
    if (!conversation) {
      res.json({ success: false, error: 'Conversation not found' });
      return;
    }
    const stats = conversationManager.getMemoryStats(req.params.id);
    res.json({ success: true, data: stats });
  });

  // 清理旧会话
  router.post('/conversations/cleanup', (req: Request, res: Response) => {
    const { keepCount = 50 } = req.body;
    const deletedCount = conversationManager.cleanup(keepCount);
    res.json({ success: true, data: { deletedCount } });
  });

  // ========== 消息管理 ==========

  // 发送消息（非流式）- 仅添加用户消息，不调用 LLM
  router.post('/conversations/:id/messages', async (req: Request, res: Response) => {
    const { content } = req.body;
    console.log('[API] 添加用户消息:', { content: content?.substring(0, 50) });

    const conversation = conversationManager.get(req.params.id);

    if (!conversation) {
      res.json({ success: false, error: 'Conversation not found' });
      return;
    }

    // 只添加用户消息
    conversationManager.addMessage(req.params.id, 'user', content);
    res.json({ success: true });
  });

  // 更新消息（保存 thinking 和 toolResults）
  router.patch('/conversations/:id/messages/:index', async (req: Request, res: Response) => {
    const { thinking, toolResults } = req.body;
    const { id, index } = req.params;

    const success = conversationManager.updateMessage(id, parseInt(index), { thinking, toolResults });
    res.json({ success });
  });

  // 流式聊天（SSE）
  router.post('/conversations/:id/stream', async (req: Request, res: Response) => {
    const { content, skillName } = req.body;
    console.log('[API SSE] 收到流式请求:', { content: content?.substring(0, 50), skillName });

    const conversationId = req.params.id;
    const conversation = conversationManager.get(conversationId);

    if (!conversation) {
      res.json({ success: false, error: 'Conversation not found' });
      return;
    }

    if (!commandExecutor) {
      res.json({ success: false, error: 'CommandExecutor not available' });
      return;
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const skillsDir = path.join(process.cwd(), 'skills');

    try {
      // 使用流式聊天
      for await (const event of streamChat(conversationId, content, skillName, {
        conversationManager,
        skillLoader,
        llmService,
        commandExecutor,
        skillsDir
      })) {
        // 发送 SSE 事件
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event.data)}\n\n`);
      }
    } catch (error: any) {
      console.error('[API SSE] 错误:', error);
      res.write(`event: error\ndata: ${JSON.stringify(error.message)}\n\n`);
    }

    res.end();
  });

  // ========== 工作目录 ==========

  router.get('/workdir', (req: Request, res: Response) => {
    res.json({ success: true, data: { path: workingDir } });
  });

  router.post('/workdir', (req: Request, res: Response) => {
    const { path: nextPath } = req.body || {};
    if (!nextPath || typeof nextPath !== 'string') {
      res.json({ success: false, error: 'Path required' });
      return;
    }
    const resolved = path.resolve(nextPath);
    if (!fs.existsSync(resolved)) {
      res.json({ success: false, error: 'Path not found' });
      return;
    }
    if (!fs.statSync(resolved).isDirectory()) {
      res.json({ success: false, error: 'Path is not a directory' });
      return;
    }
    workingDir = resolved;
    setWorkingDir(resolved);
    if (commandExecutor) {
      commandExecutor.setWorkingDir(resolved);
    }
    res.json({ success: true, data: { path: workingDir } });
  });

  router.get('/workdir/list', (req: Request, res: Response) => {
    const queryPath = typeof req.query.path === 'string' ? req.query.path : '';
    const target = queryPath && queryPath.trim() ? queryPath : workingDir;
    const resolved = path.resolve(target);
    if (!fs.existsSync(resolved)) {
      res.json({ success: false, error: 'Path not found' });
      return;
    }
    if (!fs.statSync(resolved).isDirectory()) {
      res.json({ success: false, error: 'Path is not a directory' });
      return;
    }
    const items = listDirectory(resolved);
    res.json({ success: true, data: { path: resolved, items } });
  });

  // ========== Skill 管理 ==========

  // 获取所有 skills
  router.get('/skills', (req: Request, res: Response) => {
    const skills = skillLoader.getAll();
    res.json({ success: true, data: skills });
  });

  // 重新加载 skills
  router.post('/skills/reload', (req: Request, res: Response) => {
    const skills = skillLoader.loadAll();
    res.json({ success: true, data: skills });
  });

  // 检查触发的 skills
  router.post('/skills/check-trigger', (req: Request, res: Response) => {
    const { code, userMessage } = req.body;
    const triggeredSkills = skillLoader.getTriggeredSkills({ code, userMessage });
    res.json({ success: true, data: triggeredSkills });
  });

  // ========== LLM 配置 ==========

  // 获取 LLM 配置
  router.get('/llm/config', (req: Request, res: Response) => {
    const config = llmService.getConfig();
    res.json({ success: true, data: config });
  });

  // 更新 LLM 配置
  router.post('/llm/config', (req: Request, res: Response) => {
    const config = req.body as Partial<LLMConfig>;
    llmService.updateConfig(config);
    res.json({ success: true });
  });

  // ========== 预设配置 ==========

  // 获取所有预设配置
  router.get('/presets', (req: Request, res: Response) => {
    const presets = configLoader.getAllForDisplay();
    res.json({ success: true, data: presets });
  });

  // 保存预设配置到文件
  router.post('/presets/save', (req: Request, res: Response) => {
    const { name, apiKey, baseUrl, model } = req.body;

    if (!name || !apiKey || !model) {
      res.json({ success: false, error: 'Missing required fields: name, apiKey, model' });
      return;
    }

    const success = configLoader.save(name, { apiKey, baseUrl, model });
    if (success) {
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'Failed to save to file' });
    }
  });

  // 更新预设配置
  router.put('/presets/:name', (req: Request, res: Response) => {
    const oldName = req.params.name;
    const { name, apiKey, baseUrl, model } = req.body;

    if (!name || !apiKey || !model) {
      res.json({ success: false, error: 'Missing required fields: name, apiKey, model' });
      return;
    }

    const success = configLoader.update(oldName, { name, apiKey, baseUrl, model });
    if (success) {
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'Failed to update preset' });
    }
  });

  // 删除预设配置
  router.delete('/presets/:name', (req: Request, res: Response) => {
    const name = req.params.name;
    const success = configLoader.delete(name);
    if (success) {
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'Preset not found' });
    }
  });

  // 使用预设配置
  router.post('/presets/:name/use', (req: Request, res: Response) => {
    const preset = configLoader.get(req.params.name);
    if (!preset) {
      res.json({ success: false, error: 'Preset not found' });
      return;
    }

    // 更新 LLM 配置
    llmService.updateConfig({
      provider: 'anthropic',
      apiKey: preset.env.ANTHROPIC_AUTH_TOKEN || '',
      baseUrl: preset.env.ANTHROPIC_BASE_URL,
      model: preset.env.ANTHROPIC_MODEL || ''
    });

    res.json({ success: true, data: { name: preset.name, model: preset.env.ANTHROPIC_MODEL } });
  });

  // ========== 文件管理 ==========

  // 获取指定目录的文件列表
  router.get('/files', (req: Request, res: Response) => {
    const dirPath = req.query.path as string;
    const filter = req.query.filter as string; // 可选的文件类型过滤，如 'audio', 'video', 'image'

    if (!dirPath) {
      res.json({ success: false, error: 'Missing path parameter' });
      return;
    }

    // 解析路径（支持相对路径和绝对路径）
    const absolutePath = path.isAbsolute(dirPath) ? dirPath : path.join(getWorkingDir(), dirPath);

    // 安全检查：确保路径存在
    if (!fs.existsSync(absolutePath)) {
      res.json({ success: false, error: 'Directory not found' });
      return;
    }

    // 安全检查：确保是目录
    if (!fs.statSync(absolutePath).isDirectory()) {
      res.json({ success: false, error: 'Path is not a directory' });
      return;
    }

    // 文件类型扩展名映射
    const filterExtensions: Record<string, string[]> = {
      audio: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma'],
      video: ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.wmv', '.flv'],
      image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'],
      document: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md'],
      code: ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.css', '.html', '.json', '.xml']
    };

    try {
      const files = fs.readdirSync(absolutePath);
      const fileList: Array<{
        name: string;
        path: string;
        size: number;
        isDirectory: boolean;
        extension: string;
        modified: string;
      }> = [];

      for (const file of files) {
        const filePath = path.join(absolutePath, file);
        const stat = fs.statSync(filePath);
        const ext = path.extname(file).toLowerCase();

        // 如果指定了过滤器，检查文件扩展名
        if (filter && filterExtensions[filter]) {
          // 如果是目录，也要包含
          if (!stat.isDirectory() && !filterExtensions[filter].includes(ext)) {
            continue;
          }
        }

        fileList.push({
          name: file,
          path: filePath.replace(/\\/g, '/'),
          size: stat.size,
          isDirectory: stat.isDirectory(),
          extension: ext,
          modified: stat.mtime.toISOString()
        });
      }

      // 排序：目录在前，然后按名称排序
      fileList.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      res.json({
        success: true,
        data: {
          path: absolutePath.replace(/\\/g, '/'),
          files: fileList
        }
      });
    } catch (error) {
      res.json({ success: false, error: 'Failed to read directory' });
    }
  });

  // 文件代理 API - 用于访问非 media 目录的文件
  router.get('/file', (req: Request, res: Response) => {
    const filePath = req.query.path as string;

    if (!filePath) {
      res.status(400).send('Missing path parameter');
      return;
    }

    // 解析路径
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(getWorkingDir(), filePath);

    // 安全检查
    if (!fs.existsSync(absolutePath)) {
      res.status(404).send('File not found');
      return;
    }

    if (!fs.statSync(absolutePath).isFile()) {
      res.status(400).send('Path is not a file');
      return;
    }

    // 获取文件扩展名并设置 MIME 类型
    const ext = path.extname(absolutePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.flac': 'audio/flac',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.mkv': 'video/x-matroska',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.bmp': 'image/bmp'
    };

    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);

    // 流式传输文件
    const fileStream = fs.createReadStream(absolutePath);
    fileStream.pipe(res);

    fileStream.on('error', () => {
      res.status(500).send('Failed to read file');
    });
  });

  return router;
}

export default createApiRouter;
