/**
 * 工具执行器辅助函数
 */

import * as path from 'path';
import { getWorkingDir } from '../workingDir';

/**
 * 验证解析后的路径是否在工作目录内（防止路径遍历攻击）
 */
export function validatePath(resolvedPath: string, workingDir: string): boolean {
  const normalizedResolved = path.normalize(resolvedPath);
  const normalizedWorking = path.normalize(workingDir);
  return normalizedResolved.toLowerCase().startsWith(normalizedWorking.toLowerCase());
}

/**
 * 将目标路径解析到工作目录，并进行安全验证
 * @throws Error 如果路径遍历到工作目录外
 */
export function resolveToWorkingDir(target?: string): string {
  const workingDir = getWorkingDir();

  if (!target) return workingDir;

  const resolvedPath = path.isAbsolute(target) ? target : path.resolve(workingDir, target);

  // 安全检查：防止路径遍历攻击
  if (!validatePath(resolvedPath, workingDir)) {
    throw new Error(`路径不允许：${target} - 无法访问工作目录外的文件`);
  }

  return resolvedPath;
}

/**
 * 格式化字节数
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}