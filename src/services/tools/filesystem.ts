/**
 * 文件系统操作工具
 */

import * as fs from 'fs';
import * as path from 'path';

// ==================== 辅助函数 ====================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getPermissions(mode: number): string {
  const perms: string[] = [];

  // Owner
  perms.push(mode & 0o400 ? 'r' : '-');
  perms.push(mode & 0o200 ? 'w' : '-');
  perms.push(mode & 0o100 ? 'x' : '-');

  // Group
  perms.push(mode & 0o040 ? 'r' : '-');
  perms.push(mode & 0o020 ? 'w' : '-');
  perms.push(mode & 0o010 ? 'x' : '-');

  // Others
  perms.push(mode & 0o004 ? 'r' : '-');
  perms.push(mode & 0o002 ? 'w' : '-');
  perms.push(mode & 0o001 ? 'x' : '-');

  return perms.join('');
}

// ==================== List Directory ====================

export interface DirectoryInfo {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: Date;
}

export function listDirectory(dirPath: string): DirectoryInfo[] {
  const results: DirectoryInfo[] = [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const info: DirectoryInfo = {
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file'
      };

      try {
        const stat = fs.statSync(fullPath);
        info.size = stat.size;
        info.modified = stat.mtime;
      } catch (e) { }

      results.push(info);
    }
  } catch (error: any) {
    throw new Error(`无法读取目录: ${error.message}`);
  }

  return results;
}

// ==================== 文件操作工具 ====================

export interface FileOperationResult {
  success: boolean;
  message: string;
}

// 复制文件
export function copyFile(source: string, destination: string): FileOperationResult {
  try {
    if (!fs.existsSync(source)) {
      return { success: false, message: `源文件不存在: ${source}` };
    }

    const destDir = path.dirname(destination);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.copyFileSync(source, destination);
    return { success: true, message: `复制成功: ${source} -> ${destination}` };
  } catch (error: any) {
    return { success: false, message: `复制失败: ${error.message}` };
  }
}

// 移动/重命名文件
export function moveFile(source: string, destination: string): FileOperationResult {
  try {
    if (!fs.existsSync(source)) {
      return { success: false, message: `源文件不存在: ${source}` };
    }

    const destDir = path.dirname(destination);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.renameSync(source, destination);
    return { success: true, message: `移动成功: ${source} -> ${destination}` };
  } catch (error: any) {
    return { success: false, message: `移动失败: ${error.message}` };
  }
}

// 删除文件
export function deleteFile(filePath: string): FileOperationResult {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, message: `文件不存在: ${filePath}` };
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }

    return { success: true, message: `删除成功: ${filePath}` };
  } catch (error: any) {
    return { success: false, message: `删除失败: ${error.message}` };
  }
}

// 创建目录
export function createDirectory(dirPath: string): FileOperationResult {
  try {
    if (fs.existsSync(dirPath)) {
      return { success: false, message: `目录已存在: ${dirPath}` };
    }

    fs.mkdirSync(dirPath, { recursive: true });
    return { success: true, message: `目录创建成功: ${dirPath}` };
  } catch (error: any) {
    return { success: false, message: `创建目录失败: ${error.message}` };
  }
}

// ==================== 文件信息 ====================

export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  sizeFormatted: string;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

export function getFileInfo(filePath: string): FileInfo | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const stat = fs.statSync(filePath);
    const parsedPath = path.parse(filePath);

    return {
      path: filePath,
      name: parsedPath.base,
      extension: parsedPath.ext,
      size: stat.size,
      sizeFormatted: formatBytes(stat.size),
      created: stat.birthtime,
      modified: stat.mtime,
      accessed: stat.atime,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      permissions: getPermissions(stat.mode)
    };
  } catch (e) {
    return null;
  }
}

// 检查文件是否存在
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

// ==================== Replace 文件内容 ====================

export interface ReplaceResult {
  success: boolean;
  message: string;
  matches: number;
}

export function replaceInFile(filePath: string, oldString: string, newString: string): ReplaceResult {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, message: '文件不存在', matches: 0 };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const matches = content.split(oldString).length - 1;

    if (matches === 0) {
      return { success: false, message: '未找到要替换的内容', matches: 0 };
    }

    if (matches > 1) {
      return {
        success: false,
        message: `找到 ${matches} 个匹配项。替换操作需要唯一匹配，请提供更多上下文。`,
        matches
      };
    }

    const newContent = content.replace(oldString, newString);
    fs.writeFileSync(filePath, newContent, 'utf-8');

    return { success: true, message: '替换成功', matches: 1 };
  } catch (error: any) {
    return { success: false, message: error.message, matches: 0 };
  }
}

// ==================== XML 转义 ====================

export function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}