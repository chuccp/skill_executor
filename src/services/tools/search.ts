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
}

export interface GrepResult {
  file: string;
  line: number;
  content: string;
}

export function grepContent(options: GrepOptions): GrepResult[] {
  const { pattern, path: searchPath = process.cwd(), include, ignoreCase = true } = options;
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
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          results.push({ file, line: i + 1, content: lines[i].trim() });
          if (results.length >= 100) break;
        }
      }
    } catch (e) { }

    if (results.length >= 100) break;
  }

  return results;
}