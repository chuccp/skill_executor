/**
 * 文件编辑工具
 */

import * as fs from 'fs';
// @ts-ignore
import DiffMatchPatch from 'diff-match-patch';

// ==================== Edit 文件编辑 ====================

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
}

const dmp = new DiffMatchPatch();

/**
 * 使用 diff-match-patch 查找最佳匹配
 * 支持换行符差异和小范围的字符差异
 */
function findBestMatch(content: string, search: string): { matchedText: string; confidence: number } | null {
  // 先尝试精确匹配
  if (content.includes(search)) {
    return { matchedText: search, confidence: 1 };
  }

  // 规范化换行符后匹配
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const normalizedSearch = search.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (normalizedContent.includes(normalizedSearch)) {
    // 找到规范化后的匹配，提取原始文本
    const startIdx = normalizedContent.indexOf(normalizedSearch);
    let normIdx = 0;
    let origStart = 0;
    let foundStart = false;

    for (let i = 0; i <= content.length; i++) {
      if (!foundStart && normIdx === startIdx) {
        origStart = i;
        foundStart = true;
      }

      if (foundStart && normIdx === startIdx + normalizedSearch.length) {
        return { matchedText: content.substring(origStart, i), confidence: 0.95 };
      }

      if (i < content.length) {
        if (content[i] === '\r') {
          normIdx++;
        } else if (content[i] === '\n' && (i === 0 || content[i - 1] !== '\r')) {
          normIdx++;
        } else if (content[i] !== '\n') {
          normIdx++;
        }
      }
    }
  }

  // 使用 diff-match-patch 进行模糊匹配
  const halfMatch = dmp.diff_main(search, normalizedContent);
  dmp.diff_cleanupSemantic(halfMatch);

  // 查找连续匹配的最长片段
  let bestMatch = '';
  let matchStart = -1;
  let currentMatch = '';
  let currentStart = -1;

  let searchPos = 0;
  let contentPos = 0;

  for (const [op, text] of halfMatch) {
    if (op === 0) { // DIFF_EQUAL
      if (currentStart === -1) currentStart = contentPos;
      currentMatch += text;
    } else {
      if (currentMatch.length > bestMatch.length) {
        bestMatch = currentMatch;
        matchStart = currentStart;
      }
      currentMatch = '';
      currentStart = -1;
    }
    contentPos += text.length;
  }

  if (currentMatch.length > bestMatch.length) {
    bestMatch = currentMatch;
    matchStart = currentStart;
  }

  // 如果匹配度足够高
  const confidence = bestMatch.length / search.length;
  if (confidence > 0.8 && matchStart >= 0) {
    // 找到在原始内容中的对应位置
    let normIdx = 0;
    let origStart = 0;
    let foundStart = false;

    for (let i = 0; i <= content.length; i++) {
      if (!foundStart && normIdx === matchStart) {
        origStart = i;
        foundStart = true;
      }

      if (foundStart && normIdx === matchStart + bestMatch.length) {
        return { matchedText: content.substring(origStart, i), confidence };
      }

      if (i < content.length) {
        if (content[i] === '\r') {
          normIdx++;
        } else if (content[i] === '\n' && (i === 0 || content[i - 1] !== '\r')) {
          normIdx++;
        } else if (content[i] !== '\n') {
          normIdx++;
        }
      }
    }
  }

  return null;
}

export function editFile(filePath: string, edits: EditOperation[], createIfNotExists?: boolean): EditResult {
  const failedEdits: { index: number; reason: string; oldText: string }[] = [];

  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      if (createIfNotExists) {
        // 创建新文件
        if (edits.length === 1 && edits[0].oldText === '') {
          fs.writeFileSync(filePath, edits[0].newText, 'utf-8');
          return { success: true, message: '文件创建成功', appliedEdits: 1, totalEdits: 1 };
        }
        return {
          success: false,
          message: '新文件需要提供一个空的 oldText',
          appliedEdits: 0,
          totalEdits: edits.length,
          failedEdits: [{ index: 0, reason: '新文件需要 oldText 为空字符串', oldText: edits[0]?.oldText || '' }]
        };
      }
      return { success: false, message: '文件不存在', appliedEdits: 0, totalEdits: edits.length };
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    let appliedEdits = 0;

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];

      if (edit.oldText === '') {
        // 空的 oldText 表示在文件末尾追加
        content += edit.newText;
        appliedEdits++;
        continue;
      }

      // 使用 diff-match-patch 查找最佳匹配
      const match = findBestMatch(content, edit.oldText);

      if (!match) {
        failedEdits.push({
          index: i,
          reason: `未找到要替换的文本 (长度: ${edit.oldText.length} 字符)`,
          oldText: edit.oldText.substring(0, 100) + (edit.oldText.length > 100 ? '...' : '')
        });
        continue;
      }

      // 检查是否唯一匹配（使用规范化后的内容）
      const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const normalizedSearch = edit.oldText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const matches = normalizedContent.split(normalizedSearch).length - 1;

      if (matches > 1) {
        failedEdits.push({
          index: i,
          reason: `找到 ${matches} 个匹配，需要更精确的上下文`,
          oldText: edit.oldText.substring(0, 100) + (edit.oldText.length > 100 ? '...' : '')
        });
        continue;
      }

      // 执行替换
      content = content.replace(match.matchedText, edit.newText);
      appliedEdits++;
    }

    if (appliedEdits > 0) {
      fs.writeFileSync(filePath, content, 'utf-8');
    }

    // 构建详细的消息
    let message = appliedEdits === edits.length
      ? '所有编辑已应用'
      : `已应用 ${appliedEdits}/${edits.length} 个编辑`;

    if (failedEdits.length > 0) {
      const failureDetails = failedEdits.map(f =>
        `\n  - 编辑 #${f.index + 1}: ${f.reason}\n    文本: "${f.oldText}"`
      ).join('');
      message += `\n失败原因:${failureDetails}`;
    }

    return {
      success: appliedEdits === edits.length,
      message,
      appliedEdits,
      totalEdits: edits.length,
      failedEdits: failedEdits.length > 0 ? failedEdits : undefined
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

// 多文件编辑
export interface MultiFileEdit {
  filePath: string;
  edits: EditOperation[];
  createIfNotExists?: boolean;
}

export interface MultiFileEditResult {
  filePath: string;
  success: boolean;
  message: string;
  appliedEdits: number;
}

export function editMultipleFiles(edits: MultiFileEdit[]): MultiFileEditResult[] {
  return edits.map(edit => {
    const result = editFile(edit.filePath, edit.edits, edit.createIfNotExists);
    return {
      filePath: edit.filePath,
      success: result.success,
      message: result.message,
      appliedEdits: result.appliedEdits
    };
  });
}