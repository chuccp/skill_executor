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
}

export function editFile(filePath: string, edits: EditOperation[], createIfNotExists?: boolean): EditResult {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      if (createIfNotExists) {
        // 创建新文件
        if (edits.length === 1 && edits[0].oldText === '') {
          fs.writeFileSync(filePath, edits[0].newText, 'utf-8');
          return { success: true, message: '文件创建成功', appliedEdits: 1, totalEdits: 1 };
        }
        return { success: false, message: '新文件需要提供一个空的 oldText', appliedEdits: 0, totalEdits: edits.length };
      }
      return { success: false, message: '文件不存在', appliedEdits: 0, totalEdits: edits.length };
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    let appliedEdits = 0;

    for (const edit of edits) {
      if (edit.oldText === '') {
        // 空的 oldText 表示在文件末尾追加
        content += edit.newText;
        appliedEdits++;
        continue;
      }

      // 检查是否存在匹配
      if (!content.includes(edit.oldText)) {
        continue;
      }

      // 检查是否唯一匹配
      const matches = content.split(edit.oldText).length - 1;
      if (matches > 1) {
        // 多个匹配，尝试使用更精确的上下文
        continue;
      }

      // 执行替换
      content = content.replace(edit.oldText, edit.newText);
      appliedEdits++;
    }

    if (appliedEdits > 0) {
      fs.writeFileSync(filePath, content, 'utf-8');
    }

    return {
      success: appliedEdits === edits.length,
      message: appliedEdits === edits.length
        ? '所有编辑已应用'
        : `已应用 ${appliedEdits}/${edits.length} 个编辑`,
      appliedEdits,
      totalEdits: edits.length
    };
  } catch (error: any) {
    return { success: false, message: error.message, appliedEdits: 0, totalEdits: edits.length };
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