/**
 * 命令执行增强工具
 * 使用 execa 提供更好的子进程控制
 */

import { execa } from 'execa';

// ==================== 类型定义 ====================

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
  input?: string;
  shell?: boolean;
  detached?: boolean;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  failed: boolean;
  timedOut: boolean;
  killed: boolean;
  signal?: string;
}

export interface StreamingExecOptions extends ExecOptions {
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

// ==================== 辅助函数 ====================

function normalizeResult(result: any): ExecResult {
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.exitCode ?? 0,
    failed: result.failed || false,
    timedOut: result.timedOut || false,
    killed: result.isCanceled || result.isTerminated || false,
    signal: result.signal
  };
}

// ==================== 同步执行 ====================

export async function execCommand(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  try {
    const result = await execa(command, args, {
      cwd: options.cwd,
      timeout: options.timeout || 60000,
      env: { ...process.env, ...options.env } as Record<string, string>,
      input: options.input,
      shell: options.shell,
      reject: false
    });
    return normalizeResult(result);
  } catch (error: any) {
    return {
      stdout: '',
      stderr: error.message,
      exitCode: 1,
      failed: true,
      timedOut: false,
      killed: false
    };
  }
}

export async function execShell(command: string, options: ExecOptions = {}): Promise<ExecResult> {
  return execCommand(command, [], { ...options, shell: true });
}

// ==================== 流式执行 ====================

export async function execStreaming(
  command: string,
  args: string[],
  options: StreamingExecOptions = {}
): Promise<ExecResult> {
  const subprocess = execa(command, args, {
    cwd: options.cwd,
    timeout: options.timeout || 60000,
    env: { ...process.env, ...options.env } as Record<string, string>,
    input: options.input,
    shell: options.shell,
    reject: false
  });

  // 监听 stdout
  if (options.onStdout && subprocess.stdout) {
    subprocess.stdout.on('data', (data: Buffer) => {
      options.onStdout!(data.toString());
    });
  }

  // 监听 stderr
  if (options.onStderr && subprocess.stderr) {
    subprocess.stderr.on('data', (data: Buffer) => {
      options.onStderr!(data.toString());
    });
  }

  const result = await subprocess;
  return normalizeResult(result);
}

// ==================== 后台执行 ====================

export interface BackgroundProcess {
  pid?: number;
  kill: () => void;
  promise: Promise<ExecResult>;
}

export function execBackground(
  command: string,
  args: string[],
  options: ExecOptions = {}
): BackgroundProcess {
  const subprocess = execa(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env } as Record<string, string>,
    shell: options.shell,
    reject: false
  });

  return {
    pid: subprocess.pid,
    kill: () => subprocess.kill(),
    promise: subprocess.then(result => normalizeResult(result))
  };
}

// ==================== 管道执行 ====================

export async function execPipe(commands: string[][], options: ExecOptions = {}): Promise<ExecResult> {
  if (commands.length === 0) {
    return { stdout: '', stderr: '', exitCode: 0, failed: false, timedOut: false, killed: false };
  }

  // 创建进程链
  const processes = commands.map((cmd) => {
    const [command, ...args] = cmd;
    return execa(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env } as Record<string, string>,
      shell: options.shell,
      reject: false
    });
  });

  // 连接管道
  for (let i = 0; i < processes.length - 1; i++) {
    if (processes[i].stdout && processes[i + 1].stdin) {
      processes[i].stdout!.pipe(processes[i + 1].stdin!);
    }
  }

  // 等待最后一个进程完成
  const lastResult = await processes[processes.length - 1];
  return normalizeResult(lastResult);
}

// ==================== 超时执行 ====================

export async function execWithTimeout(
  command: string,
  args: string[],
  timeout: number,
  options: ExecOptions = {}
): Promise<ExecResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const result = await execa(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env } as Record<string, string>,
      signal: controller.signal,
      reject: false
    });

    return normalizeResult(result);
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return {
        stdout: '',
        stderr: `命令执行超时 (${timeout}ms)`,
        exitCode: -1,
        failed: true,
        timedOut: true,
        killed: false
      };
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}