import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ConversationManager } from './services/conversation';
import { SkillLoader } from './services/skillLoader';
import { LLMService } from './services/llm';
import { ConfigLoader } from './services/configLoader';
import { CommandExecutor } from './services/commandExecutor';
import { createApiRouter } from './routes/api';
import { setupWebSocket } from './services/websocket';
import { LLMConfig } from './types';

const execAsync = promisify(exec);

// 检查并释放端口
async function checkAndFreePort(port: number): Promise<void> {
  const isWindows = process.platform === 'win32';
  const killedPids = new Set<string>(); // 避免重复杀进程

  try {
    if (isWindows) {
      // Windows: 使用 netstat 查找占用端口的进程
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n').filter(line => line.includes('LISTENING'));

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && !killedPids.has(pid)) {
          killedPids.add(pid);
          console.log(`Port ${port} is in use by PID ${pid}, killing process...`);
          try {
            await execAsync(`taskkill /F /PID ${pid}`);
            console.log(`Process ${pid} killed successfully`);
          } catch (e) {
            console.log(`Failed to kill process ${pid}`);
          }
        }
      }
    } else {
      // Linux/Mac: 使用 lsof 查找占用端口的进程
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      const pids = stdout.trim().split('\n').filter(pid => pid);

      for (const pid of pids) {
        if (!killedPids.has(pid)) {
          killedPids.add(pid);
          console.log(`Port ${port} is in use by PID ${pid}, killing process...`);
          try {
            await execAsync(`kill -9 ${pid}`);
            console.log(`Process ${pid} killed successfully`);
          } catch (e) {
            console.log(`Failed to kill process ${pid}`);
          }
        }
      }
    }
  } catch (e) {
    // netstat/findstr 没找到时会报错，忽略
  }
}

// 初始化服务
const skillsDir = path.join(process.cwd(), 'skills');
const settingsPath = path.join(process.cwd(), 'setting', 'settings.json');
const skillLoader = new SkillLoader(skillsDir);
const configLoader = new ConfigLoader(settingsPath);
const conversationManager = new ConversationManager();
const commandExecutor = new CommandExecutor(process.cwd());

// 加载预设配置，使用第一个作为默认
const presets = configLoader.getAll();
let defaultConfig: LLMConfig = {
  provider: 'anthropic',
  apiKey: '',
  model: 'claude-sonnet-4-20250514'
};

if (presets.length > 0) {
  const firstPreset = presets[0];
  defaultConfig = {
    provider: 'anthropic',
    apiKey: firstPreset.env.ANTHROPIC_AUTH_TOKEN || '',
    baseUrl: firstPreset.env.ANTHROPIC_BASE_URL,
    model: firstPreset.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
  };
  console.log(`Using preset: ${firstPreset.name}`);
}

const llmService = new LLMService(defaultConfig);

// 加载 skills
const loadedSkills = skillLoader.loadAll();
console.log(`Loaded ${loadedSkills.length} skills`);

// 创建 Express 应用
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API 路由
app.use('/api', createApiRouter(conversationManager, skillLoader, llmService, configLoader, commandExecutor));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 设置 WebSocket
setupWebSocket(wss, conversationManager, skillLoader, llmService, commandExecutor);

// 启动服务器
const PORT = process.env.PORT || 3000;

async function startServer() {
  // 检查并释放端口
  await checkAndFreePort(Number(PORT));

  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`WebSocket server running at ws://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
