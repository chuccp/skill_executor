/**
 * 智能文件编辑器
 * 根据文件类型自动选择最佳编辑策略
 */

import * as fs from 'fs';
import * as path from 'path';
import { Project, SourceFile, Node } from 'ts-morph';
import DiffMatchPatch from 'diff-match-patch';

// ==================== 类型定义 ====================

export interface EditOperation {
  oldText: string;
  newText: string;
}

export interface EditResult {
  success: boolean;
  message: string;
  appliedEdits: number;
  totalEdits: number;
  failedEdits?: { index: number; reason: string; oldText: string }[];
  method?: 'exact' | 'fuzzy' | 'ast';
}

// ==================== 文件类型检测 ====================

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const CONFIG_EXTENSIONS = ['.json', '.jsonc', '.yaml', '.yml'];

function isCodeFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return CODE_EXTENSIONS.includes(ext);
}

function isConfigFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return CONFIG_EXTENSIONS.includes(ext);
}

// ==================== 精确匹配编辑 ====================

function exactEdit(content: string, oldText: string, newText: string): { result: string; applied: boolean; reason?: string } {
  if (oldText === '') {
    return { result: content + newText, applied: true };
  }

  if (!content.includes(oldText)) {
    return { result: content, applied: false, reason: '未找到要替换的文本' };
  }

  const matches = content.split(oldText).length - 1;
  if (matches > 1) {
    return { result: content, applied: false, reason: `找到 ${matches} 个匹配，需要更精确的上下文` };
  }

  return { result: content.replace(oldText, newText), applied: true };
}

// ==================== 模糊匹配编辑 (diff-match-patch) ====================

function fuzzyEdit(content: string, oldText: string, newText: string, threshold: number = 0.8): { result: string; applied: boolean; reason?: string; similarity?: number } {
  const dmp = new DiffMatchPatch();

  // 搜索最佳匹配位置
  const searchResult = dmp.match_main(content, oldText, 0);

  if (searchResult === -1) {
    // 尝试分块搜索
    const lines = content.split('\n');
    const oldLines = oldText.split('\n');

    if (oldLines.length > 1) {
      // 多行文本：搜索首行
      const firstLineResult = dmp.match_main(lines.join('\n'), oldLines[0], 0);
      if (firstLineResult !== -1) {
        // 检查后续行是否匹配
        const startIdx = firstLineResult;
        const matchedText = content.substring(startIdx, startIdx + oldText.length);
        const similarity = dmp.diff_levenshtein(dmp.diff_main(oldText, matchedText)) / oldText.length;

        if (similarity <= (1 - threshold)) {
          return {
            result: content.substring(0, startIdx) + newText + content.substring(startIdx + matchedText.length),
            applied: true,
            similarity: 1 - similarity
          };
        }
      }
    }

    return { result: content, applied: false, reason: '模糊匹配也未找到相似文本' };
  }

  // 计算相似度
  const matchedText = content.substring(searchResult, searchResult + oldText.length);
  const diff = dmp.diff_main(oldText, matchedText);
  const levenshtein = dmp.diff_levenshtein(diff);
  const similarity = 1 - (levenshtein / Math.max(oldText.length, matchedText.length));

  if (similarity >= threshold) {
    return {
      result: content.substring(0, searchResult) + newText + content.substring(searchResult + matchedText.length),
      applied: true,
      similarity
    };
  }

  return {
    result: content,
    applied: false,
    reason: `找到相似文本但相似度过低 (${(similarity * 100).toFixed(1)}% < ${threshold * 100}%)`,
    similarity
  };
}

// ==================== AST 编辑 (ts-morph) ====================

// 缓存 Project 实例
let projectCache: Project | null = null;

function getProject(): Project {
  if (!projectCache) {
    projectCache = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        allowJs: true,
        checkJs: false
      }
    });
  }
  return projectCache;
}

function astEdit(filePath: string, content: string, oldText: string, newText: string): { result: string; applied: boolean; reason?: string } {
  try {
    const project = getProject();
    const sourceFile = project.createSourceFile(filePath, content, { overwrite: true });

    // 尝试在 AST 中找到匹配的节点
    let found = false;
    let result = content;

    // 遍历所有节点寻找匹配
    sourceFile.forEachDescendant((node) => {
      const nodeText = node.getText();
      if (nodeText === oldText) {
        // 找到精确匹配的节点
        const start = node.getStart();
        const end = node.getEnd();
        result = content.substring(0, start) + newText + content.substring(end);
        found = true;
      }
    });

    if (found) {
      return { result, applied: true };
    }

    // AST 中未找到，回退到精确匹配
    return { result: content, applied: false, reason: 'AST 中未找到匹配节点' };
  } catch (error: any) {
    return { result: content, applied: false, reason: `AST 解析失败: ${error.message}` };
  } finally {
    // 清理源文件
    const project = getProject();
    const existing = project.getSourceFile(filePath);
    if (existing) {
      project.removeSourceFile(existing);
    }
  }
}

// ==================== 主编辑函数 ====================

export function editFile(filePath: string, edits: EditOperation[], options?: {
  createIfNotExists?: boolean;
  fuzzyThreshold?: number;
  forceMethod?: 'exact' | 'fuzzy' | 'ast';
}): EditResult {
  const { createIfNotExists = false, fuzzyThreshold = 0.8, forceMethod } = options || {};
  const failedEdits: { index: number; reason: string; oldText: string }[] = [];
  const methodUsed: EditResult['method'] = forceMethod || (isCodeFile(filePath) ? 'ast' : 'exact');

  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      if (createIfNotExists && edits.length === 1 && edits[0].oldText === '') {
        fs.writeFileSync(filePath, edits[0].newText, 'utf-8');
        return { success: true, message: '文件创建成功', appliedEdits: 1, totalEdits: 1, method: 'exact' };
      }
      return { success: false, message: '文件不存在', appliedEdits: 0, totalEdits: edits.length };
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    let appliedEdits = 0;

    for (let i = 0; i < edits.length; i++) {
      const { oldText, newText } = edits[i];
      let editResult: { result: string; applied: boolean; reason?: string };

      // 空的 oldText 表示追加
      if (oldText === '') {
        content += newText;
        appliedEdits++;
        continue;
      }

      // 根据策略选择编辑方法
      if (forceMethod === 'fuzzy') {
        editResult = fuzzyEdit(content, oldText, newText, fuzzyThreshold);
      } else if (forceMethod === 'ast' && isCodeFile(filePath)) {
        editResult = astEdit(filePath, content, oldText, newText);
        if (!editResult.applied) {
          // AST 失败，尝试精确匹配
          editResult = exactEdit(content, oldText, newText);
        }
      } else if (isCodeFile(filePath)) {
        // 代码文件：先 AST，再精确，最后模糊
        editResult = astEdit(filePath, content, oldText, newText);
        if (!editResult.applied) {
          editResult = exactEdit(content, oldText, newText);
        }
        if (!editResult.applied) {
          editResult = fuzzyEdit(content, oldText, newText, fuzzyThreshold);
        }
      } else {
        // 普通文件：先精确，再模糊
        editResult = exactEdit(content, oldText, newText);
        if (!editResult.applied) {
          editResult = fuzzyEdit(content, oldText, newText, fuzzyThreshold);
        }
      }

      if (editResult.applied) {
        content = editResult.result;
        appliedEdits++;
      } else {
        failedEdits.push({
          index: i,
          reason: editResult.reason || '未知原因',
          oldText: oldText.substring(0, 100) + (oldText.length > 100 ? '...' : '')
        });
      }
    }

    if (appliedEdits > 0) {
      fs.writeFileSync(filePath, content, 'utf-8');
    }

    // 构建详细消息
    let message = appliedEdits === edits.length
      ? `所有编辑已应用 (${methodUsed})`
      : `已应用 ${appliedEdits}/${edits.length} 个编辑 (${methodUsed})`;

    if (failedEdits.length > 0) {
      const details = failedEdits.map(f =>
        `\n  - 编辑 #${f.index + 1}: ${f.reason}\n    文本: "${f.oldText}"`
      ).join('');
      message += `\n失败原因:${details}`;
    }

    return {
      success: appliedEdits === edits.length,
      message,
      appliedEdits,
      totalEdits: edits.length,
      failedEdits: failedEdits.length > 0 ? failedEdits : undefined,
      method: methodUsed
    };
  } catch (error: any) {
    return {
      success: false,
      message: `编辑失败: ${error.message}`,
      appliedEdits: 0,
      totalEdits: edits.length
    };
  }
}

// ==================== 便捷函数 ====================

/**
 * 查找文本在文件中的位置
 */
export function findText(filePath: string, searchText: string, fuzzy?: boolean): { line: number; column: number; similarity?: number }[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const results: { line: number; column: number; similarity?: number }[] = [];

  if (fuzzy) {
    const dmp = new DiffMatchPatch();
    const pos = dmp.match_main(content, searchText, 0);
    if (pos !== -1) {
      const before = content.substring(0, pos);
      const lines = before.split('\n');
      results.push({
        line: lines.length,
        column: lines[lines.length - 1].length + 1
      });
    }
  } else {
    let pos = content.indexOf(searchText);
    while (pos !== -1) {
      const before = content.substring(0, pos);
      const lines = before.split('\n');
      results.push({
        line: lines.length,
        column: lines[lines.length - 1].length + 1
      });
      pos = content.indexOf(searchText, pos + 1);
    }
  }

  return results;
}

/**
 * 获取文件差异
 */
export function getDiff(oldContent: string, newContent: string): string {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(oldContent, newContent);
  dmp.diff_cleanupSemantic(diffs);
  return dmp.diff_prettyHtml(diffs);
}