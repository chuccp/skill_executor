/**
 * 命令执行增强工具
 * 使用 Node.js 原生 child_process 模块
 */

import { spawn, exec as execCallback } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCallback);

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

function normalizeResult(stdout: string, stderr: string, exitCode: number | null, signal: string | null): ExecResult {
  return {
    stdout: stdout || '',
    stderr: stderr || '',
    exitCode: exitCode ?? 0,
    failed: exitCode !== 0,
    timedOut: false,
    killed: false,
    signal: signal || undefined
  };
}

// ==================== 同步执行 ====================

export async function execCommand(
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  try {
    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
    const execOptions: any = {
      cwd: options.cwd,
      timeout: options.timeout || 60000,
      env: { ...process.env, ...options.env },
      input: options.input
    };
    if (options.shell !== undefined) {
      execOptions.shell = options.shell;
    }
    const result = await exec(fullCommand, execOptions) as unknown as { stdout: string; stderr: string };
    return normalizeResult(result.stdout, result.stderr, 0, null);
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      exitCode: error.code ?? error.status ?? 1,
      failed: true,
      timedOut: error.code === 'ETIMEDOUT' || error.killed,
      killed: error.killed || false,
      signal: error.signal
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
  const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
  const subprocess = spawn(fullCommand, [], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env } as Record<string, string>,
    shell: options.shell ?? true,
    detached: options.detached
  });

  let stdout = '';
  let stderr = '';

  return new Promise((resolve) => {
    // 监听 stdout
    subprocess.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      if (options.onStdout) {
        options.onStdout(chunk);
      }
    });

    // 监听 stderr
    subprocess.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      if (options.onStderr) {
        options.onStderr(chunk);
      }
    });

    // 监听错误
    subprocess.on('error', (error) => {
      resolve({
        stdout,
        stderr: error.message,
        exitCode: 1,
        failed: true,
        timedOut: false,
        killed: false
      });
    });

    // 监听退出
    subprocess.on('close', (exitCode, signal) => {
      resolve(normalizeResult(stdout, stderr, exitCode, signal));
    });

    // 处理输入
    if (options.input && subprocess.stdin) {
      subprocess.stdin.write(options.input);
      subprocess.stdin.end();
    }

    // 处理超时
    if (options.timeout) {
      setTimeout(() => {
        subprocess.kill();
      }, options.timeout);
    }
  });
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
  const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
  const subprocess = spawn(fullCommand, [], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env } as Record<string, string>,
    shell: options.shell ?? true,
    detached: true
  });

  let stdout = '';
  let stderr = '';

  subprocess.stdout?.on('data', (data: Buffer) => {
    stdout += data.toString();
  });

  subprocess.stderr?.on('data', (data: Buffer) => {
    stderr += data.toString();
  });

  const promise = new Promise<ExecResult>((resolve) => {
    subprocess.on('close', (exitCode, signal) => {
      resolve(normalizeResult(stdout, stderr, exitCode, signal));
    });

    subprocess.on('error', (error) => {
      resolve({
        stdout,
        stderr: error.message,
        exitCode: 1,
        failed: true,
        timedOut: false,
        killed: false
      });
    });
  });

  return {
    pid: subprocess.pid,
    kill: () => subprocess.kill(),
    promise
  };
}

// ==================== 管道执行 ====================

export async function execPipe(commands: string[][], options: ExecOptions = {}): Promise<ExecResult> {
  if (commands.length === 0) {
    return { stdout: '', stderr: '', exitCode: 0, failed: false, timedOut: false, killed: false };
  }

  // 对于单个命令，直接执行
  if (commands.length === 1) {
    const [command, ...args] = commands[0];
    return execCommand(command, args, options);
  }

  // 对于多个命令，使用 shell 管道
  const pipeCommand = commands.map(cmd => cmd.join(' ')).join(' | ');
  return execShell(pipeCommand, options);
}

// ==================== 超时执行 ====================

export async function execWithTimeout(
  command: string,
  args: string[],
  timeout: number,
  options: ExecOptions = {}
): Promise<ExecResult> {
  const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
    const execOptions: any = {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      signal: controller.signal
    };
    if (options.shell !== undefined) {
      execOptions.shell = options.shell;
    }
    const result = await exec(fullCommand, execOptions) as unknown as { stdout: string; stderr: string };

    return normalizeResult(result.stdout, result.stderr, 0, null);
  } catch (error: any) {
    if (error.name === 'AbortError' || error.code === 'ETIMEDOUT') {
      return {
        stdout: '',
        stderr: `命令执行超时 (${timeout}ms)`,
        exitCode: -1,
        failed: true,
        timedOut: true,
        killed: false
      };
    }
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      exitCode: error.code ?? error.status ?? 1,
      failed: true,
      timedOut: false,
      killed: error.killed || false,
      signal: error.signal
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
