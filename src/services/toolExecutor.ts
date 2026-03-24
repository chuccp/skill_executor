/**
 * 工具执行器
 * 分发工具调用到各个处理器模块
 */

import * as fs from 'fs';
import * as path from 'path';
import { WebSocket } from 'ws';
import { CommandExecutor } from './commandExecutor';
import { SkillLoader } from './skillLoader';
import { createModuleLogger } from './tools/logger';

const logger = createModuleLogger('tool');
import { ConversationManager } from './conversation';
import {
  globFiles,
  grepContent,
  webSearch,
  webFetch,
  getTodos,
  setTodos,
  listDirectory,
  replaceInFile,
  TodoItem,
  copyFile,
  moveFile,
  deleteFile,
  createDirectory,
  getFileInfo,
  fileExists,
  xmlEscape,
  editFile,
  editMultipleFiles,
  EditOperation,
  readNotebook,
  writeNotebook,
  editNotebookCell,
  addNotebookCell,
  deleteNotebookCell,
  createTask,
  getTask,
  listTasks,
  updateTask,
  stopTask,
  AsyncTask,
  createPlan,
  getPlan,
  updatePlanStep,
  deletePlan,
  listWorktrees,
  createWorktree,
  removeWorktree
} from './tools';
import { getWorkingDir } from './workingDir';
import { ToolContext } from './toolExecutor/context';
import { handleFilesystemTool } from './toolExecutor/filesystem';
import { handleShellTool } from './toolExecutor/shell';
import { handleWebTool } from './toolExecutor/web';
import { handleTaskTool } from './toolExecutor/task';
import { handleNotebookTool } from './toolExecutor/notebook';
import { handleSkillTool } from './toolExecutor/skill';
import { handleGitTool } from './toolExecutor/git';
import { handleAgentTool } from './toolExecutor/agent';
import { handleTtsTool } from './toolExecutor/tts';
import { handleProjectTool } from './toolExecutor/project';
import { handleCodeQualityTool } from './toolExecutor/codeQuality';

// 导出工具定义和上下文类型
export { TOOLS } from './toolExecutor/definitions';
export type { ToolContext } from './toolExecutor/context';

// 导出辅助函数
export { resolveToWorkingDir, formatBytes, validatePath } from './toolExecutor/utils';

// ==================== 工具执行函数 ====================

export async function executeTool(
  tool: { name: string; input?: any },
  ctx: ToolContext
): Promise<string> {
  const { ws } = ctx;

  try {
    // 尝试各个处理器
    let result: string | null;

    // 文件系统工具
    result = await handleFilesystemTool(tool, ctx);
    if (result !== null) return result;

    // Shell 工具
    result = await handleShellTool(tool, ctx);
    if (result !== null) return result;

    // Web 工具
    result = await handleWebTool(tool, ctx);
    if (result !== null) return result;

    // 任务管理工具
    result = await handleTaskTool(tool, ctx);
    if (result !== null) return result;

    // Notebook 工具
    result = await handleNotebookTool(tool, ctx);
    if (result !== null) return result;

    // Skill 和用户交互工具
    result = await handleSkillTool(tool, ctx);
    if (result !== null) return result;

    // Git 工具
    result = await handleGitTool(tool, ctx);
    if (result !== null) return result;

    // Agent 工具
    result = await handleAgentTool(tool, ctx);
    if (result !== null) return result;

    // TTS 工具
    result = await handleTtsTool(tool, ctx);
    if (result !== null) return result;

    // 项目分析工具
    result = await handleProjectTool(tool, ctx);
    if (result !== null) return result;

    // 代码质量工具
    result = await handleCodeQualityTool(tool, ctx);
    if (result !== null) return result;

    // 未知工具
    return `未知工具: ${tool.name}`;
  } catch (error: any) {
    const errMsg = `工具执行错误 (${tool.name}): ${error.message || error}`;
    logger.error('[ToolExecutor] Error:', errMsg);
    if (ws) {
      ws.send(JSON.stringify({ type: 'error', content: errMsg }));
    }
    return errMsg;
  }
}