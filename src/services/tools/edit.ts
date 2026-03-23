/**
 * 文件编辑工具
 */

import * as fs from 'fs';

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

      // 检查是否存在匹配
      if (!content.includes(edit.oldText)) {
        failedEdits.push({
          index: i,
          reason: `未找到要替换的文本 (长度: ${edit.oldText.length} 字符)`,
          oldText: edit.oldText.substring(0, 100) + (edit.oldText.length > 100 ? '...' : '')
        });
        continue;
      }

      // 检查是否唯一匹配
      const matches = content.split(edit.oldText).length - 1;
      if (matches > 1) {
        failedEdits.push({
          index: i,
          reason: `找到 ${matches} 个匹配，需要更精确的上下文`,
          oldText: edit.oldText.substring(0, 100) + (edit.oldText.length > 100 ? '...' : '')
        });
        continue;
      }

      // 执行替换
      content = content.replace(edit.oldText, edit.newText);
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