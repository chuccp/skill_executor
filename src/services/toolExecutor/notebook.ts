/**
 * Notebook 工具处理器
 */

import { WebSocket } from 'ws';
import { readNotebook, editNotebookCell, addNotebookCell, deleteNotebookCell } from '../tools';
import { ToolContext } from '../toolExecutor/context';
import { resolveToWorkingDir } from './utils';

export async function handleNotebookTool(
  tool: { name: string; input?: any },
  ctx: ToolContext
): Promise<string | null> {
  const { ws } = ctx;

  switch (tool.name) {
    case 'notebook_read': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';

      if (!filePath) return '错误：文件路径为空';

      const notebook = readNotebook(filePath);
      if (!notebook) {
        return `无法读取 Notebook 文件: ${filePath}`;
      }

      const output = notebook.cells.map((cell, index) => {
        const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
        const type = cell.cell_type.toUpperCase();
        return `--- [${index}] ${type} ---\n${source}`;
      }).join('\n\n');

      if (ws) {
        ws.send(JSON.stringify({ type: 'notebook_read', path: filePath, cells: notebook.cells.length }));
      }

      return `Notebook: ${filePath} (${notebook.cells.length} 个单元格)\n\n${output}`;
    }

    case 'notebook_edit_cell': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      const cellIndex = tool.input?.cell_index;
      const newSource = tool.input?.new_source;
      const cellType = tool.input?.cell_type;

      if (!filePath || cellIndex === undefined || newSource === undefined) {
        return '错误：参数不完整';
      }

      const result = editNotebookCell(filePath, cellIndex, newSource, cellType);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'notebook_cell_edited', path: filePath, cellIndex }));
      }
      return result.message;
    }

    case 'notebook_add_cell': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      const cellType = tool.input?.cell_type as 'markdown' | 'code' | 'raw';
      const source = tool.input?.source;
      const position = tool.input?.position;

      if (!filePath || !cellType || source === undefined) {
        return '错误：参数不完整';
      }

      const result = addNotebookCell(filePath, cellType, source, position);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'notebook_cell_added', path: filePath }));
      }
      return result.message;
    }

    case 'notebook_delete_cell': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      const cellIndex = tool.input?.cell_index;

      if (!filePath || cellIndex === undefined) {
        return '错误：参数不完整';
      }

      const result = deleteNotebookCell(filePath, cellIndex);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'notebook_cell_deleted', path: filePath, cellIndex }));
      }
      return result.message;
    }

    default:
      return null;
  }
}