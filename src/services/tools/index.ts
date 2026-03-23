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

// 代码质量
export { formatCode, analyzeCode, lintCode } from './codeQuality';
export type { FormatOptions, CodeMetrics, LintResult } from './codeQuality';

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

// 智能编辑
export { editFile as smartEditFile, findText, getDiff } from './smartEdit';

// 快速搜索
export { fastGlob, findCodeFiles, findConfigFiles, findRecentFiles } from './fastSearch';
export type { FastGlobOptions } from './fastSearch';

// 多格式文件读取
export {
  getImageInfo,
  resizeImage,
  imageToBase64,
  readFileAuto,
  openWithSystemApp
} from './fileReaders';
export type { ImageInfo, ImageResizeOptions } from './fileReaders';

// Web 抓取
export {
  httpRequest,
  parseHtml,
  htmlToMarkdown,
  scrapeWebPage,
  fetchJson,
  postJson
} from './webScraper';
export type { FetchOptions, ParsedHtml, WebScrapeResult } from './webScraper';

// Git 操作增强
export {
  getGitStatus,
  getGitLog,
  getGitBranches,
  gitAdd,
  gitCommit,
  gitPush,
  gitPull,
  gitCheckout,
  gitCreateBranch,
  gitMerge,
  getGitDiff,
  getGitRemotes,
  gitFetch,
  gitStash,
  gitStashPop,
  gitStashList
} from './gitOps';
export type { GitStatus } from './gitOps';

// 命令执行增强
export {
  execCommand,
  execShell,
  execStreaming,
  execBackground,
  execPipe,
  execWithTimeout
} from './execEnhanced';
export type { ExecOptions, ExecResult, StreamingExecOptions, BackgroundProcess } from './execEnhanced';

// Markdown 处理
export {
  parseMarkdown,
  readMarkdownFile,
  writeMarkdownFile,
  markdownToHtml,
  extractMarkdownHeadings,
  parseSkillFile,
  parseSkillContent
} from './markdown';
export type { ParsedMarkdown, MarkdownFile, SkillFile } from './markdown';

// 日志工具
export { createLogger, logger, log, createModuleLogger } from './logger';

// 参数验证
export {
  z,
  validators,
  validate,
  validateOrThrow,
  validateToolInput,
  createValidator,
  filePathSchema,
  dirPathSchema,
  editSchema,
  multiEditSchema,
  bashSchema,
  globSchema,
  grepSchema,
  webFetchSchema,
  webSearchSchema
} from './validation';
export type { ValidationResult } from './validation';

// HTTP 客户端
export {
  ky,
  defaultClient,
  createHttpClient,
  httpGet,
  httpPost,
  httpPut,
  httpDelete,
  httpGetText,
  httpGetBuffer,
  downloadFile,
  httpGetWithRetry
} from './http';
export type { HttpClientOptions, HttpResponse } from './http';