import { exec } from 'child_process';
import { promisify } from 'util';
import * as iconv from 'iconv-lite';

const execAsync = promisify(exec);

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

export class CommandExecutor {
  private workingDir: string;

  constructor(workingDir: string = process.cwd()) {
    this.workingDir = workingDir;
  }

  // 执行命令
  async execute(command: string, timeout: number = 60000): Promise<CommandResult> {
    console.log('[CMD] 执行命令:', command);

    try {
      // Windows 下设置 UTF-8 编码
      const isWindows = process.platform === 'win32';
      const env = {
        ...process.env,
        FORCE_COLOR: '0',
        PYTHONIOENCODING: 'utf-8',
        LANG: 'en_US.UTF-8'
      };

      if (isWindows) {
        // Windows: 使用 chcp 65001 设置 UTF-8
        command = `chcp 65001 >nul && ${command}`;
      }

      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workingDir,
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        env,
        encoding: 'buffer' // 使用 buffer 然后手动解码
      });

      // 解码输出
      const stdoutStr = this.decodeOutput(stdout);
      const stderrStr = this.decodeOutput(stderr);

      console.log('[CMD] 执行成功');
      return { success: true, stdout: stdoutStr, stderr: stderrStr };
    } catch (error: any) {
      console.error('[CMD] 执行失败:', error.message);
      const stdoutStr = this.decodeOutput(error.stdout);
      const stderrStr = this.decodeOutput(error.stderr) || error.message;
      return {
        success: false,
        stdout: stdoutStr,
        stderr: stderrStr
      };
    }
  }

  // 解码命令输出
  private decodeOutput(buffer: Buffer | string): string {
    if (!buffer) return '';
    if (typeof buffer === 'string') return buffer;

    // 尝试 UTF-8 解码
    try {
      const utf8Str = buffer.toString('utf-8');
      // 检查是否有乱码特征
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
    // 检查常见的乱码特征
    const garbledPatterns = [
      /[\x00-\x08\x0B\x0C\x0E-\x1F]/, // 控制字符
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
    
    // 匹配 ```bash 或 ```sh 代码块
    const bashBlockRegex = /```(?:bash|sh|shell)\n([\s\S]*?)```/g;
    let match;
    while ((match = bashBlockRegex.exec(text)) !== null) {
      const block = match[1].trim();
      // 按行分割，过滤注释和空行
      const lines = block.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && !line.startsWith('//'));
      commands.push(...lines);
    }

    // 匹配单独的 `$ ` 开头的命令
    const inlineCommandRegex = /(?:^|\n)\$\s+([^\n]+)/g;
    while ((match = inlineCommandRegex.exec(text)) !== null) {
      commands.push(match[1].trim());
    }

    return commands;
  }

  // 安全检查 - 返回是否为危险命令（需要确认）
  isSafeCommand(command: string): boolean {
    const dangerousPatterns = [
      // 删除操作
      /rm\s+(-[rf]+\s+)*\//,        // rm -rf /
      /rm\s+(-[rf]+\s+)*~/,         // rm -rf ~
      /rm\s+(-[rf]+\s+)*\*/,        // rm -rf *
      /rmdir\s+\/[^\s]*/,           // rmdir /
      // 磁盘操作
      />\s*\/dev\/(sda|hdd|nvme)/,  // 覆盖磁盘
      /mkfs/,                        // 格式化
      /dd\s+if=/,                    // dd 命令
      /fdisk/,                       // 分区操作
      /format\s+/,                   // Windows 格式化
      // 系统操作
      /shutdown/,                    // 关机
      /reboot/,                      // 重启
      /init\s+[06]/,                 // 关机/重启
      /systemctl\s+(stop|disable)/,  // 停止服务
      // 网络危险操作
      /curl.*\|\s*(ba)?sh/,          // curl | sh
      /wget.*\|\s*(ba)?sh/,          // wget | sh
      /nc\s+-l/,                     // netcat 监听
      // 权限操作
      /chmod\s+(-R\s+)?777\s+\//,    // chmod 777 /
      /chown\s+.*\//,                // chown 根目录
      // 危险脚本
      /:(){ :|:& };:/,               // fork bomb
      // 清空文件
      />\s*\/etc\//,                 // 清空系统配置
      /echo.*>\s*\/etc\//,           // 覆盖系统配置
      // npm/yarn 全局卸载
      /npm\s+uninstall\s+(-g|--global)/,
      /yarn\s+global\s+remove/,
      // Windows 特有
      /del\s+\/[sSq]/,               // Windows 删除
      /format\s+[cC]:/,              // 格式化 C 盘
    ];

    const lowerCmd = command.toLowerCase();
    for (const pattern of dangerousPatterns) {
      if (pattern.test(command) || pattern.test(lowerCmd)) {
        return false;
      }
    }
    return true;
  }

  // 设置工作目录
  setWorkingDir(dir: string) {
    this.workingDir = dir;
  }

  getWorkingDir(): string {
    return this.workingDir;
  }
}

export default CommandExecutor;
