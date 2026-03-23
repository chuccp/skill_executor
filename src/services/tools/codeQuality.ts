/**
 * 代码质量工具
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ==================== 代码格式化 ====================

export interface FormatOptions {
  filePath: string;
  style?: 'prettier' | 'eslint' | 'clang-format';
  language?: string;
}

export async function formatCode(options: FormatOptions): Promise<{ success: boolean; content: string; error?: string }> {
  const { filePath, style = 'prettier', language } = options;

  try {
    let command: string;

    switch (style) {
      case 'prettier':
        command = `npx prettier --write "${filePath}"`;
        break;
      case 'eslint':
        command = `npx eslint --fix "${filePath}"`;
        break;
      case 'clang-format':
        const lang = language || (filePath.endsWith('.cpp') || filePath.endsWith('.cc') ? 'cpp' : 'c');
        command = `clang-format -i -style=Google "${filePath}"`;
        break;
      default:
        return { success: false, content: '', error: `不支持的格式化风格: ${style}` };
    }

    await execAsync(command, { cwd: path.dirname(filePath) });
    const content = fs.readFileSync(filePath, 'utf-8');

    return { success: true, content };
  } catch (error: any) {
    return { success: false, content: '', error: error.message };
  }
}

// ==================== 代码分析 ====================

export interface CodeMetrics {
  lines: number;
  characters: number;
  functions: number;
  classes: number;
  complexity: number;
  language: string;
}

export function analyzeCode(filePath: string): CodeMetrics {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').length;
  const characters = content.length;

  // 简单的语言检测
  let language = 'unknown';
  if (filePath.endsWith('.js') || filePath.endsWith('.ts')) language = 'javascript';
  else if (filePath.endsWith('.py')) language = 'python';
  else if (filePath.endsWith('.java')) language = 'java';
  else if (filePath.endsWith('.cpp') || filePath.endsWith('.cc')) language = 'cpp';
  else if (filePath.endsWith('.c')) language = 'c';
  else if (filePath.endsWith('.go')) language = 'go';
  else if (filePath.endsWith('.rs')) language = 'rust';

  // 简单的复杂度计算
  let functions = 0;
  let classes = 0;
  let complexity = 1; // 基础复杂度

  if (language === 'javascript' || language === 'typescript') {
    functions = (content.match(/\bfunction\b|\b=>\s*\{/g) || []).length;
    classes = (content.match(/\bclass\b/g) || []).length;
    complexity += (content.match(/\bif\b|\bfor\b|\bwhile\b|\bswitch\b/g) || []).length;
  } else if (language === 'python') {
    functions = (content.match(/\bdef\b/g) || []).length;
    classes = (content.match(/\bclass\b/g) || []).length;
    complexity += (content.match(/\bif\b|\bfor\b|\bwhile\b/g) || []).length;
  }

  return {
    lines,
    characters,
    functions,
    classes,
    complexity,
    language
  };
}

// ==================== 语法检查 ====================

export interface LintResult {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  rule?: string;
}

export async function lintCode(filePath: string, language?: string): Promise<LintResult[]> {
  const ext = path.extname(filePath);
  const detectedLang = language || (
    ext === '.js' ? 'javascript' :
    ext === '.ts' ? 'typescript' :
    ext === '.py' ? 'python' :
    'unknown'
  );

  try {
    let command: string;

    switch (detectedLang) {
      case 'javascript':
      case 'typescript':
        command = `npx eslint "${filePath}" --format json`;
        break;
      case 'python':
        command = `python -m pylint "${filePath}" --output-format=json`;
        break;
      default:
        return [{
          file: filePath,
          line: 1,
          column: 1,
          message: `不支持的语言: ${detectedLang}`,
          severity: 'error'
        }];
    }

    const { stdout } = await execAsync(command, { cwd: path.dirname(filePath) });
    const results = JSON.parse(stdout);

    return results.map((r: any) => ({
      file: r.filePath || filePath,
      line: r.line || 1,
      column: r.column || 1,
      message: r.message,
      severity: r.severity === 2 ? 'error' : r.severity === 1 ? 'warning' : 'info',
      rule: r.ruleId || r.symbol
    }));
  } catch (error: any) {
    return [{
      file: filePath,
      line: 1,
      column: 1,
      message: `语法检查失败: ${error.message}`,
      severity: 'error'
    }];
  }
}