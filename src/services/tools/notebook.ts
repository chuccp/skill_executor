/**
 * Notebook 编辑工具
 */

import * as fs from 'fs';

// ==================== Notebook 编辑 ====================

export interface NotebookCell {
  cell_type: 'markdown' | 'code' | 'raw';
  source: string | string[];
  metadata?: Record<string, any>;
  execution_count?: number | null;
  outputs?: any[];
}

export interface Notebook {
  cells: NotebookCell[];
  metadata: Record<string, any>;
  nbformat: number;
  nbformat_minor: number;
}

export function readNotebook(filePath: string): Notebook | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Notebook;
  } catch {
    return null;
  }
}

export function writeNotebook(filePath: string, notebook: Notebook): boolean {
  try {
    fs.writeFileSync(filePath, JSON.stringify(notebook, null, 1), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export function editNotebookCell(
  filePath: string,
  cellIndex: number,
  newSource: string | string[],
  cellType?: 'markdown' | 'code' | 'raw'
): { success: boolean; message: string } {
  try {
    const notebook = readNotebook(filePath);
    if (!notebook) {
      return { success: false, message: '无法读取 Notebook 文件' };
    }

    if (cellIndex < 0 || cellIndex >= notebook.cells.length) {
      return { success: false, message: `无效的单元格索引: ${cellIndex}` };
    }

    notebook.cells[cellIndex].source = newSource;
    if (cellType) {
      notebook.cells[cellIndex].cell_type = cellType;
    }

    writeNotebook(filePath, notebook);
    return { success: true, message: `单元格 ${cellIndex} 已更新` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export function addNotebookCell(
  filePath: string,
  cellType: 'markdown' | 'code' | 'raw',
  source: string | string[],
  position?: number
): { success: boolean; message: string } {
  try {
    const notebook = readNotebook(filePath);
    if (!notebook) {
      return { success: false, message: '无法读取 Notebook 文件' };
    }

    const newCell: NotebookCell = {
      cell_type: cellType,
      source: source,
      metadata: {},
      execution_count: cellType === 'code' ? null : undefined,
      outputs: cellType === 'code' ? [] : undefined
    };

    if (position !== undefined && position >= 0 && position <= notebook.cells.length) {
      notebook.cells.splice(position, 0, newCell);
    } else {
      notebook.cells.push(newCell);
    }

    writeNotebook(filePath, notebook);
    return { success: true, message: `新单元格已添加` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export function deleteNotebookCell(
  filePath: string,
  cellIndex: number
): { success: boolean; message: string } {
  try {
    const notebook = readNotebook(filePath);
    if (!notebook) {
      return { success: false, message: '无法读取 Notebook 文件' };
    }

    if (cellIndex < 0 || cellIndex >= notebook.cells.length) {
      return { success: false, message: `无效的单元格索引: ${cellIndex}` };
    }

    notebook.cells.splice(cellIndex, 1);
    writeNotebook(filePath, notebook);
    return { success: true, message: `单元格 ${cellIndex} 已删除` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}