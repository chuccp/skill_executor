/**
 * 文件搜索工具
 */

import * as fs from 'fs';
import * as path from 'path';

// ==================== Glob 文件搜索 ====================

export interface GlobOptions {
  pattern: string;
  path?: string;
  ignore?: string[];
}

export function globFiles(options: GlobOptions): string[] {
  const { pattern, path: searchPath = process.cwd(), ignore = [] } = options;
  const results: string[] = [];

  function matchPattern(str: string, pattern: string): boolean {
    let regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<<<DOUBLE_STAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<DOUBLE_STAR>>>/g, '.*')
      .replace(/\?/g, '[^/]');

    regex = '^' + regex + '$';
    return new RegExp(regex, 'i').test(str);
  }

  function shouldIgnore(filePath: string): boolean {
    for (const ignorePattern of ignore) {
      if (filePath.includes(ignorePattern) || matchPattern(filePath, ignorePattern)) {
        return true;
      }
    }
    return false;
  }

  function walkDir(dir: string, depth: number = 0) {
    if (depth > 20) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(searchPath, fullPath).replace(/\\/g, '/');

        if (shouldIgnore(relativePath)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;

        if (entry.isDirectory()) {
          if (pattern.includes('**')) {
            walkDir(fullPath, depth + 1);
          } else if (pattern.split('/').length > depth + 1) {
            walkDir(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          const fileName = entry.name;
          const relativePath = path.relative(searchPath, fullPath).replace(/\\/g, '/');

          if (pattern.includes('**')) {
            const patternAfterDoubleStar = pattern.split('**').pop() || '';
            if (matchPattern(relativePath, pattern) ||
              matchPattern(fileName, pattern.split('/').pop() || '') ||
              matchPattern(relativePath, patternAfterDoubleStar.replace(/^\//, ''))) {
              results.push(fullPath);
            }
          } else if (pattern.includes('/')) {
            if (matchPattern(relativePath, pattern)) {
              results.push(fullPath);
            }
          } else {
            if (matchPattern(fileName, pattern)) {
              results.push(fullPath);
            }
          }
        }
      }
    } catch (e) { }
  }

  walkDir(searchPath);

  results.sort((a, b) => {
    try {
      const statA = fs.statSync(a);
      const statB = fs.statSync(b);
      return statB.mtimeMs - statA.mtimeMs;
    } catch {
      return 0;
    }
  });

  return results;
}

// ==================== Grep 内容搜索 ====================

export interface GrepOptions {
  pattern: string;
  path?: string;
  include?: string;
  ignoreCase?: boolean;
  context?: number;
  maxResults?: number;
  excludeBinary?: boolean;
}

export interface GrepResult {
  file: string;
  line: number;
  content: string;
  contextBefore?: string[];
  contextAfter?: string[];
}

export function grepContent(options: GrepOptions): GrepResult[] {
  const {
    pattern,
    path: searchPath = process.cwd(),
    include,
    ignoreCase = true,
    context = 0,
    maxResults = 100,
    excludeBinary = true
  } = options;

  const results: GrepResult[] = [];

  let files: string[] = [];
  if (include) {
    files = globFiles({ pattern: include, path: searchPath });
  } else {
    function getAllFiles(dir: string): string[] {
      const result: string[] = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            result.push(...getAllFiles(fullPath));
          } else if (entry.isFile()) {
            result.push(fullPath);
          }
        }
      } catch (e) { }
      return result;
    }
    files = getAllFiles(searchPath);
  }

  const regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g');

  for (const file of files) {
    try {
      // 检查是否为二进制文件
      if (excludeBinary) {
        const buffer = Buffer.alloc(512);
        const fd = fs.openSync(file, 'r');
        const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
        fs.closeSync(fd);

        // 简单的二进制文件检测
        let binaryChars = 0;
        for (let i = 0; i < bytesRead; i++) {
          const byte = buffer[i];
          if (byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)) {
            binaryChars++;
          }
        }

        if (binaryChars > bytesRead * 0.3) {
          continue; // 跳过二进制文件
        }
      }

      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          const result: GrepResult = {
            file,
            line: i + 1,
            content: lines[i].trim()
          };

          // 添加上下文
          if (context > 0) {
            result.contextBefore = [];
            result.contextAfter = [];

            for (let j = Math.max(0, i - context); j < i; j++) {
              result.contextBefore.push(lines[j]);
            }

            for (let j = i + 1; j <= Math.min(lines.length - 1, i + context); j++) {
              result.contextAfter.push(lines[j]);
            }
          }

          results.push(result);

          if (results.length >= maxResults) break;
        }
      }
    } catch (e) {
      // 跳过无法读取的文件
    }

    if (results.length >= maxResults) break;
  }

  return results;
}