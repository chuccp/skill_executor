/**
 * 工具模块
 * 提供各种工具函数
 */

// 平台检测
export { platform } from './platform';

// 搜索工具
export { globFiles, grepContent } from './search';
export type { GlobOptions, GrepOptions, GrepResult } from './search';

// Web 工具
export { webSearch, webFetch } from './web';
export type { WebSearchResult, WebFetchResult } from './web';

// 文件系统
export {
  listDirectory,
  copyFile,
  moveFile,
  deleteFile,
  createDirectory,
  getFileInfo,
  fileExists,
  replaceInFile,
  xmlEscape
} from './filesystem';
export type { DirectoryInfo, FileOperationResult, FileInfo, ReplaceResult } from './filesystem';

// 文件编辑
export { editFile, editMultipleFiles } from './edit';
export type { EditOperation, EditResult, MultiFileEdit, MultiFileEditResult } from './edit';

// Notebook
export {
  readNotebook,
  writeNotebook,
  editNotebookCell,
  addNotebookCell,
  deleteNotebookCell
} from './notebook';
export type { NotebookCell, Notebook } from './notebook';

// 任务管理
export {
  getTodos,
  setTodos,
  addTodo,
  updateTodo,
  createTask,
  getTask,
  listTasks,
  updateTask,
  stopTask,
  deleteTask,
  createPlan,
  getPlan,
  updatePlanStep,
  deletePlan
} from './task';
export type { TodoItem, QuestionOption, Question, AsyncTask, PlanStep, Plan } from './task';

// Git
export { listWorktrees, createWorktree, removeWorktree } from './git';
export type { WorktreeInfo } from './git';