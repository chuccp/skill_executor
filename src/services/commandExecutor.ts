import { spawn } from 'child_process';
import * as iconv from 'iconv-lite';
import { createModuleLogger } from './tools/logger';

const logger = createModuleLogger('cmd');

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

export interface StreamCallbacks {
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

export class CommandExecutor {
  private workingDir: string;

  constructor(workingDir: string = process.cwd()) {
    this.workingDir = workingDir;
  }

  setWorkingDir(dir: string): void {
    this.workingDir = dir;
  }

  // 执行命令（流式输出）
  async execute(
    command: string,
    timeout: number = 60000,
    callbacks?: StreamCallbacks
  ): Promise<CommandResult> {
    logger.info('[CMD] 执行命令:', command);

    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const env = {
        ...process.env,
        FORCE_COLOR: '0',
        PYTHONIOENCODING: 'utf-8',
        LANG: 'en_US.UTF-8'
      };

      // 使用 spawn 来支持流式输出
      const shell = isWindows ? true : '/bin/bash';
      const child = spawn(command, [], {
        cwd: this.workingDir,
        shell,
        env,
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // 设置超时
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
        stderr += '\n命令执行超时';
      }, timeout);

      // 处理标准输出
      child.stdout?.on('data', (data: Buffer) => {
        const text = this.decodeOutput(data);
        stdout += text;
        callbacks?.onStdout?.(text);
      });

      // 处理错误输出
      child.stderr?.on('data', (data: Buffer) => {
        const text = this.decodeOutput(data);
        stderr += text;
        callbacks?.onStderr?.(text);
      });

      // 处理结束
      child.on('close', (code) => {
        clearTimeout(timer);
        const success = code === 0 && !timedOut;
        logger.info('[CMD] 执行完成, exit code:', code);
        resolve({ success, stdout, stderr });
      });

      // 处理错误
      child.on('error', (err) => {
        clearTimeout(timer);
        logger.error('[CMD] 执行失败:', err.message);
        resolve({ success: false, stdout, stderr: err.message });
      });
    });
  }

  // 解码命令输出
  private decodeOutput(buffer: Buffer | string): string {
    if (!buffer) return '';
    if (typeof buffer === 'string') return buffer;

    // 尝试 UTF-8 解码
    try {
      const utf8Str = buffer.toString('utf-8');
      if (!this.hasGarbledText(utf8Str)) {
        return utf8Str;
      }
    } catch {}

    // Windows 中文环境，尝试 GBK 解码
    if (process.platform === 'win32') {
      try {
        return iconv.decode(buffer, 'gbk');
      } catch {}
    }

    return buffer.toString('utf-8');
  }

  // 检查是否有乱码
  private hasGarbledText(text: string): boolean {
    const garbledPatterns = [
      /[\x00-\x08\x0B\x0C\x0E-\x1F]/,
    ];

    for (const pattern of garbledPatterns) {
      if (pattern.test(text)) {
        return true;
      }
    }
    return false;
  }

  // 从文本中提取代码块中的命令
  extractCommands(text: string): string[] {
    const commands: string[] = [];

    const bashBlockRegex = /```(?:bash|sh|shell)\n([\s\S]*?)```/g;
    let match;
    while ((match = bashBlockRegex.exec(text)) !== null) {
      const block = match[1].trim();
      const lines = block.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && !line.startsWith('//'));
      commands.push(...lines);
    }

    const inlineCommandRegex = /(?:^|\n)\$\s+([^\n]+)/g;
    while ((match = inlineCommandRegex.exec(text)) !== null) {
      commands.push(match[1].trim());
    }

    return commands;
  }

  // 安全检查
  isSafeCommand(command: string): boolean {
    const dangerousPatterns = [
      /rm\s+(-[rf]+\s+)*\//,
      /rm\s+(-[rf]+\s+)*~/,
      /rm\s+(-[rf]+\s+)*\*/,
      /rmdir\s+\/[^\s]*/,
      />\s*\/dev\/(sda|hdd|nvme)/,
      /mkfs/,
      /dd\s+if=/,
      /fdisk/,
      /format\s+/,
      /shutdown/,
      /reboot/,
      /init\s+[06]/,
      /systemctl\s+(stop|disable)/,
      /curl.*\|\s*(ba)?sh/,
      /wget.*\|\s*(ba)?sh/,
      /nc\s+-l/,
      /chmod\s+(-R\s+)?777\s+\//,
      /chown\s+.*\//,
      /:(){ :|:& };:/,
      />\s*\/etc\//,
      /echo.*>\s*\/etc\//,
      /npm\s+uninstall\s+(-g|--global)/,
      /yarn\s+global\s+remove/,
      /del\s+\/[sSq]/,
      /format\s+[cC]:/,
    ];

    const lowerCmd = command.toLowerCase();
    for (const pattern of dangerousPatterns) {
      if (pattern.test(command) || pattern.test(lowerCmd)) {
        return false;
      }
    }
    return true;
  }

  getWorkingDir(): string {
    return this.workingDir;
  }
}

export default CommandExecutor;