/**
 * 增强的文件搜索工具
 * 使用 fast-glob 提供更快的搜索速度
 */

import * as path from 'path';
import fg from 'fast-glob';

export interface FastGlobOptions {
  pattern: string;
  cwd?: string;
  ignore?: string[];
  absolute?: boolean;
  onlyFiles?: boolean;
  onlyDirectories?: boolean;
  deep?: number;
}

/**
 * 快速文件搜索
 * 比 Node 原生实现快 10-20 倍
 */
export async function fastGlob(options: FastGlobOptions): Promise<string[]> {
  const {
    pattern,
    cwd = process.cwd(),
    ignore = [],
    absolute = true,
    onlyFiles = true,
    onlyDirectories = false,
    deep
  } = options;

  const results = await fg(pattern, {
    cwd,
    ignore: ['**/node_modules/**', '**/.git/**', ...ignore],
    absolute,
    onlyFiles,
    onlyDirectories,
    deep,
    followSymbolicLinks: false,
    suppressErrors: true
  });

  return results.sort();
}

/**
 * 搜索代码文件
 */
export async function findCodeFiles(cwd?: string, extensions?: string[]): Promise<string[]> {
  const exts = extensions || ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java'];
  const patterns = exts.map(ext => `**/*.${ext}`);
  const results: string[] = [];

  for (const pattern of patterns) {
    const files = await fastGlob({ pattern, cwd });
    results.push(...files);
  }

  return results;
}

/**
 * 搜索配置文件
 */
export async function findConfigFiles(cwd?: string): Promise<string[]> {
  const patterns = [
    '**/package.json',
    '**/tsconfig.json',
    '**/.env*',
    '**/config.{js,ts,json,yaml,yml}',
    '**/*.config.{js,ts}',
    '**/Dockerfile*',
    '**/docker-compose*.yml'
  ];

  const results: string[] = [];
  for (const pattern of patterns) {
    const files = await fastGlob({ pattern, cwd });
    results.push(...files);
  }

  return [...new Set(results)];
}

/**
 * 搜索最近修改的文件
 */
export async function findRecentFiles(cwd?: string, days: number = 7): Promise<string[]> {
  const results = await fg('**/*', {
    cwd: cwd || process.cwd(),
    ignore: ['**/node_modules/**', '**/.git/**'],
    onlyFiles: true,
    suppressErrors: true
  });

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const fs = await import('fs');

  return results.filter(file => {
    try {
      const stat = fs.statSync(path.join(cwd || process.cwd(), file));
      return stat.mtimeMs > cutoff;
    } catch {
      return false;
    }
  }).sort((a, b) => {
    try {
      const statA = fs.statSync(path.join(cwd || process.cwd(), a));
      const statB = fs.statSync(path.join(cwd || process.cwd(), b));
      return statB.mtimeMs - statA.mtimeMs;
    } catch {
      return 0;
    }
  });
}