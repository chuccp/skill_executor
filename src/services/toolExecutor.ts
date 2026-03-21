import * as fs from 'fs';
import * as path from 'path';
import { WebSocket } from 'ws';
import { CommandExecutor } from './commandExecutor';
import { SkillLoader } from './skillLoader';
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
  // Notebook
  readNotebook,
  writeNotebook,
  editNotebookCell,
  addNotebookCell,
  deleteNotebookCell,
  // Task
  createTask,
  getTask,
  listTasks,
  updateTask,
  stopTask,
  AsyncTask,
  // Plan
  createPlan,
  getPlan,
  updatePlanStep,
  deletePlan,
  // Worktree
  listWorktrees,
  createWorktree,
  removeWorktree
} from './tools';
import { getWorkingDir } from './workingDir';

// ==================== 工具定义 ====================

export const TOOLS = [
  // ========== 文件系统工具 ==========
  {
    name: 'read_file',
    description: '读取文件内容。支持文本文件、图片、PDF、DOCX、Excel 等。对于大文件会自动截断。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '文件路径（绝对路径，或相对当前工作目录）' },
        offset: { type: 'number', description: '可选：起始行号（0-based）' },
        limit: { type: 'number', description: '可选：读取的最大行数' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'write_file',
    description: '创建新文件或覆盖现有文件的内容。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '文件路径（绝对路径，或相对当前工作目录）' },
        content: { type: 'string', description: '要写入的内容' }
      },
      required: ['file_path', 'content']
    }
  },
  {
    name: 'replace',
    description: '在文件中替换文本。需要提供精确的 old_string 和 new_string。old_string 必须唯一匹配。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '文件路径（绝对路径，或相对当前工作目录）' },
        old_string: { type: 'string', description: '要替换的原始文本（必须精确匹配）' },
        new_string: { type: 'string', description: '替换后的新文本' }
      },
      required: ['file_path', 'old_string', 'new_string']
    }
  },
  {
    name: 'edit',
    description: '高级文件编辑工具。支持多个编辑操作，可在文件中应用多个修改。比 replace 更灵活，支持多行编辑和创建新文件。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '文件路径（绝对路径，或相对当前工作目录）' },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              oldText: { type: 'string', description: '要替换的原始文本（空字符串表示创建新文件或追加到文件末尾）' },
              newText: { type: 'string', description: '替换后的新文本' }
            },
            required: ['oldText', 'newText']
          },
          description: '编辑操作列表'
        },
        create_if_not_exists: { type: 'boolean', description: '如果文件不存在是否创建（默认 false）' }
      },
      required: ['file_path', 'edits']
    }
  },
  {
    name: 'multi_edit',
    description: '批量编辑多个文件。一次调用可以修改多个文件，每个文件可以有多个编辑操作。',
    input_schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: '文件路径' },
              edits: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    oldText: { type: 'string', description: '要替换的原始文本' },
                    newText: { type: 'string', description: '替换后的新文本' }
                  },
                  required: ['oldText', 'newText']
                },
                description: '编辑操作列表'
              },
              create_if_not_exists: { type: 'boolean', description: '如果文件不存在是否创建' }
            },
            required: ['path', 'edits']
          },
          description: '要编辑的文件列表'
        }
      },
      required: ['files']
    }
  },
  {
    name: 'list_directory',
    description: '列出目录中的文件和子目录。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径（绝对路径，或相对当前工作目录）' }
      },
      required: []
    }
  },
  {
    name: 'glob',
    description: '使用 glob 模式搜索文件。支持 ** (递归)、* (任意字符)、? (单个字符)。',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob 模式，如 **/*.ts、src/**/*.js' },
        path: { type: 'string', description: '可选：搜索的根目录，默认为项目根目录' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'grep',
    description: '在文件内容中搜索正则表达式模式。返回匹配的文件、行号和内容。',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '正则表达式模式' },
        path: { type: 'string', description: '可选：搜索的目录路径' },
        include: { type: 'string', description: '可选：文件 glob 模式，如 *.ts' }
      },
      required: ['pattern']
    }
  },
  // ========== Shell 工具 ==========
  {
    name: 'bash',
    description: '执行单条 shell 命令。用于安装软件、运行脚本、Git 操作等。避免多条命令拼接；危险命令需要用户确认。',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的 shell 命令' },
        description: { type: 'string', description: '可选：命令的简短描述' }
      },
      required: ['command']
    }
  },
  // ========== 网络工具 ==========
  {
    name: 'web_search',
    description: '在网络上搜索信息。返回搜索结果列表。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询' }
      },
      required: ['query']
    }
  },
  {
    name: 'web_fetch',
    description: '获取网页内容并提取信息。',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要获取的 URL' },
        prompt: { type: 'string', description: '可选：提取信息的提示' }
      },
      required: ['url']
    }
  },
  // ========== 任务管理工具 ==========
  {
    name: 'todo_write',
    description: '写入或更新任务列表。用于跟踪多步骤任务的进度。',
    input_schema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '任务 ID' },
              task: { type: 'string', description: '任务描述' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'] },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] }
            },
            required: ['id', 'task', 'status']
          },
          description: '任务列表'
        }
      },
      required: ['todos']
    }
  },
  {
    name: 'todo_read',
    description: '读取当前的任务列表。',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  // ========== Skill 工具 ==========
  {
    name: 'create_skill',
    description: '创建一个新的技能（Skill）。Skill 是 Markdown 文件，定义了特定的 AI 行为。',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '技能名称' },
        description: { type: 'string', description: '技能的简短描述' },
        prompt: { type: 'string', description: '技能的系统提示词' },
        triggers: { type: 'array', items: { type: 'string' }, description: '可选：触发关键词列表' }
      },
      required: ['name', 'description', 'prompt']
    }
  },
  // ========== 询问用户工具 ==========
  {
    name: 'ask_user',
    description: '向用户提问并等待回复。用于需要用户决策、选择方案、确认操作等场景。支持多选项选择。',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '要问用户的问题' },
        header: { type: 'string', description: '问题的简短标题（最多12字符）' },
        options: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: '选项标签（显示给用户）' },
              value: { type: 'string', description: '选项值（返回给 AI）' },
              description: { type: 'string', description: '选项详细描述' }
            },
            required: ['label', 'value']
          },
          description: '可选的选项列表（2-5 个选项）'
        }
      },
      required: ['question']
    }
  },
  // ========== 媒体文件工具 ==========
  {
    name: 'get_files',
    description: '获取指定目录的文件列表，支持按类型过滤。用于查找可播放的媒体文件。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径（绝对路径或相对路径）' },
        filter: { type: 'string', description: '可选：文件类型过滤，可选值：audio, video, image, document, code' }
      },
      required: ['path']
    }
  },
  {
    name: 'play_media',
    description: '播放指定的媒体文件（音频或视频）。会返回可在界面上播放的媒体信息。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '媒体文件的绝对路径' }
      },
      required: ['file_path']
    }
  },
  // ========== 文件操作工具 ==========
  {
    name: 'copy_file',
    description: '复制文件到指定位置。如果目标目录不存在会自动创建。',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: '源文件路径' },
        destination: { type: 'string', description: '目标文件路径' }
      },
      required: ['source', 'destination']
    }
  },
  {
    name: 'move_file',
    description: '移动或重命名文件。可以用于文件重命名或移动到不同目录。',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: '源文件路径' },
        destination: { type: 'string', description: '目标文件路径' }
      },
      required: ['source', 'destination']
    }
  },
  {
    name: 'delete_file',
    description: '删除文件或目录。删除目录时会递归删除所有内容。危险操作，需谨慎使用。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '要删除的文件或目录路径' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'create_directory',
    description: '创建新目录。支持递归创建父目录。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要创建的目录路径' }
      },
      required: ['path']
    }
  },
  {
    name: 'file_info',
    description: '获取文件的详细信息，包括大小、创建时间、修改时间、权限等。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '文件路径' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'file_exists',
    description: '检查文件或目录是否存在。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '要检查的路径' }
      },
      required: ['file_path']
    }
  },
  // ========== XML 转义工具 ==========
  {
    name: 'xml_escape',
    description: '对文本进行 XML/HTML 转义，将特殊字符转换为实体。用于生成安全的 XML 或 HTML 内容。',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要转义的文本' }
      },
      required: ['text']
    }
  },
  // ========== Notebook 编辑工具 ==========
  {
    name: 'notebook_read',
    description: '读取 Jupyter Notebook (.ipynb) 文件的内容。返回所有单元格及其类型、源代码和输出。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Notebook 文件路径' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'notebook_edit_cell',
    description: '编辑 Jupyter Notebook 中指定单元格的内容。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Notebook 文件路径' },
        cell_index: { type: 'number', description: '单元格索引（从 0 开始）' },
        new_source: { type: 'string', description: '新的单元格内容' },
        cell_type: { type: 'string', enum: ['markdown', 'code', 'raw'], description: '可选：单元格类型' }
      },
      required: ['file_path', 'cell_index', 'new_source']
    }
  },
  {
    name: 'notebook_add_cell',
    description: '在 Jupyter Notebook 中添加新的单元格。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Notebook 文件路径' },
        cell_type: { type: 'string', enum: ['markdown', 'code', 'raw'], description: '单元格类型' },
        source: { type: 'string', description: '单元格内容' },
        position: { type: 'number', description: '可选：插入位置（默认添加到末尾）' }
      },
      required: ['file_path', 'cell_type', 'source']
    }
  },
  {
    name: 'notebook_delete_cell',
    description: '删除 Jupyter Notebook 中指定的单元格。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Notebook 文件路径' },
        cell_index: { type: 'number', description: '要删除的单元格索引' }
      },
      required: ['file_path', 'cell_index']
    }
  },
  // ========== 异步任务工具 ==========
  {
    name: 'task_create',
    description: '创建一个新的异步任务。用于跟踪长时间运行的操作。',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '任务唯一标识符' },
        name: { type: 'string', description: '任务名称' }
      },
      required: ['task_id', 'name']
    }
  },
  {
    name: 'task_get',
    description: '获取指定任务的详细信息和状态。',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '任务 ID' }
      },
      required: ['task_id']
    }
  },
  {
    name: 'task_list',
    description: '列出所有任务或指定状态的任务。',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'cancelled'], description: '可选：按状态过滤' }
      },
      required: []
    }
  },
  {
    name: 'task_update',
    description: '更新任务的状态、进度或结果。',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '任务 ID' },
        status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'cancelled'], description: '新状态' },
        progress: { type: 'number', description: '进度百分比（0-100）' },
        result: { type: 'string', description: '任务结果' },
        error: { type: 'string', description: '错误信息' }
      },
      required: ['task_id']
    }
  },
  {
    name: 'task_stop',
    description: '停止正在运行的任务。',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '任务 ID' }
      },
      required: ['task_id']
    }
  },
  // ========== Plan 模式工具 ==========
  {
    name: 'plan_create',
    description: '创建一个新的执行计划，包含多个步骤。',
    input_schema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string', description: '计划唯一标识符' },
        title: { type: 'string', description: '计划标题' },
        steps: { type: 'array', items: { type: 'string' }, description: '计划步骤列表' }
      },
      required: ['plan_id', 'title', 'steps']
    }
  },
  {
    name: 'plan_get',
    description: '获取指定计划的详细信息。',
    input_schema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string', description: '计划 ID' }
      },
      required: ['plan_id']
    }
  },
  {
    name: 'plan_update_step',
    description: '更新计划中某个步骤的状态。',
    input_schema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string', description: '计划 ID' },
        step_id: { type: 'string', description: '步骤 ID' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: '新状态' }
      },
      required: ['plan_id', 'step_id', 'status']
    }
  },
  // ========== Git 增强工具 ==========
  {
    name: 'git_status',
    description: '查看 Git 仓库的当前状态（修改、暂存、未跟踪的文件）。',
    input_schema: {
      type: 'object',
      properties: {
        repo_path: { type: 'string', description: '仓库路径（默认当前目录）' }
      },
      required: []
    }
  },
  {
    name: 'git_diff',
    description: '查看工作区与暂存区或上一次提交之间的差异。',
    input_schema: {
      type: 'object',
      properties: {
        repo_path: { type: 'string', description: '仓库路径（默认当前目录）' },
        staged: { type: 'boolean', description: '是否查看暂存区的差异（默认 false，查看工作区）' },
        file_path: { type: 'string', description: '可选：只看特定文件的差异' }
      },
      required: []
    }
  },
  {
    name: 'git_log',
    description: '查看 Git 提交历史。',
    input_schema: {
      type: 'object',
      properties: {
        repo_path: { type: 'string', description: '仓库路径（默认当前目录）' },
        max_count: { type: 'number', description: '最大显示条数（默认 10）' }
      },
      required: []
    }
  },
  {
    name: 'git_branch',
    description: '列出 Git 仓库的所有分支。',
    input_schema: {
      type: 'object',
      properties: {
        repo_path: { type: 'string', description: '仓库路径（默认当前目录）' },
        remote: { type: 'boolean', description: '是否显示远程分支（默认 false）' }
      },
      required: []
    }
  },
  {
    name: 'git_checkout',
    description: '切换 Git 分支或标签。需要提供分支名称。',
    input_schema: {
      type: 'object',
      properties: {
        repo_path: { type: 'string', description: '仓库路径（默认当前目录）' },
        branch_name: { type: 'string', description: '要切换到的分支或标签名称' },
        create_new: { type: 'boolean', description: '是否创建新分支（默认 false）' }
      },
      required: ['branch_name']
    }
  },
  {
    name: 'git_add',
    description: '将文件添加到 Git 暂存区。',
    input_schema: {
      type: 'object',
      properties: {
        repo_path: { type: 'string', description: '仓库路径（默认当前目录）' },
        files: { type: 'array', items: { type: 'string' }, description: '要添加的文件列表，或使用 "." 添加所有' }
      },
      required: ['files']
    }
  },
  {
    name: 'git_commit',
    description: '提交 Git 暂存区的更改。需要用户确认。',
    input_schema: {
      type: 'object',
      properties: {
        repo_path: { type: 'string', description: '仓库路径（默认当前目录）' },
        message: { type: 'string', description: '提交信息' },
        amend: { type: 'boolean', description: '是否修正上一次提交（默认 false）' }
      },
      required: ['message']
    }
  },
  // ========== Worktree 工具 ==========
  {
    name: 'worktree_list',
    description: '列出 Git 仓库中的所有工作树。',
    input_schema: {
      type: 'object',
      properties: {
        repo_path: { type: 'string', description: '仓库路径（默认当前目录）' }
      },
      required: []
    }
  },
  {
    name: 'worktree_create',
    description: '创建一个新的 Git 工作树。用于并行开发多个分支。',
    input_schema: {
      type: 'object',
      properties: {
        repo_path: { type: 'string', description: '仓库路径（默认当前目录）' },
        branch_name: { type: 'string', description: '新分支名称' },
        worktree_path: { type: 'string', description: '工作树路径' }
      },
      required: ['branch_name', 'worktree_path']
    }
  },
  {
    name: 'worktree_remove',
    description: '删除指定的 Git 工作树。',
    input_schema: {
      type: 'object',
      properties: {
        repo_path: { type: 'string', description: '仓库路径（默认当前目录）' },
        worktree_path: { type: 'string', description: '要删除的工作树路径' }
      },
      required: ['worktree_path']
    }
  },
  // ========== 项目索引工具 ==========
  {
    name: 'project_index',
    description: '生成项目的索引，包括目录结构、文件类型统计和入口点分析。帮助快速理解代码库结构。',
    input_schema: {
      type: 'object',
      properties: {
        root_path: { type: 'string', description: '项目根路径（默认当前工作目录）' },
        max_depth: { type: 'number', description: '最大遍历深度（默认 5）' },
        include_patterns: { type: 'array', items: { type: 'string' }, description: '可选：包含的文件模式，如 ["*.ts", "*.js"]' }
      },
      required: []
    }
  },
  {
    name: 'find_entry_points',
    description: '查找项目的入口文件（如 main.ts, index.js, app.py 等）。',
    input_schema: {
      type: 'object',
      properties: {
        root_path: { type: 'string', description: '项目根路径（默认当前工作目录）' }
      },
      required: []
    }
  },
  {
    name: 'analyze_dependencies',
    description: '分析项目的依赖关系（读取 package.json, requirements.txt 等）。',
    input_schema: {
      type: 'object',
      properties: {
        root_path: { type: 'string', description: '项目根路径（默认当前工作目录）' }
      },
      required: []
    }
  },
    // ========== TTS 工具 ==========
  {
    name: 'tts_list_voices',
    description: '列出所有可用的 TTS 音色。使用微软 Edge TTS 引擎（推荐 Python edge-tts）。',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'tts_convert',
    description: '将文字转换为语音。使用微软 Edge TTS 引擎（推荐 Python edge-tts，更稳定）。支持中文和英文多种音色。',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要转换的文字' },
        voice: { type: 'string', description: '音色名称，默认 zh-CN-XiaoxiaoNeural（中文女声）' },
        rate: { type: 'number', description: '语速调整，范围 -100 到 100，默认 0' },
        pitch: { type: 'number', description: '音调调整，范围 -100 到 100，默认 0' },
        output_file: { type: 'string', description: '输出文件路径（可选，默认保存到 media/audio/ 目录）' }
      },
      required: ['text']
    }
  },
  {
    name: 'tts_get_recommended',
    description: '获取推荐的 TTS 音色列表（中文/英文男女声）。',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
// ========== Agent 工具 ==========
  {
    name: 'agent_spawn',
    description: '创建一个子代理来执行特定任务。子代理可以并行工作，处理独立的研究或操作。',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: '代理唯一标识符' },
        task: { type: 'string', description: '代理要执行的任务描述' },
        agent_type: { type: 'string', enum: ['explore', 'code', 'research'], description: '代理类型' }
      },
      required: ['agent_id', 'task']
    }
  }
];

// ==================== 工具执行上下文 ====================

export interface ToolContext {
  conversationId: string;
  commandExecutor: CommandExecutor;
  skillsDir: string;
  skillLoader: SkillLoader;
  conversationManager: ConversationManager;
  ws?: WebSocket;  // WebSocket 模式下用于发送事件
  pendingCommands?: Map<string, any>;
  pendingQuestions?: Map<string, any>;
  agentOrchestrator?: import('./agentOrchestrator').AgentOrchestrator;  // 可选的代理编排器
}

// ==================== 工具执行函数 ====================

export async function executeTool(
  tool: { name: string; input?: any },
  ctx: ToolContext
): Promise<string> {
  const { conversationId, commandExecutor, skillsDir, skillLoader, conversationManager, ws, pendingCommands, pendingQuestions } = ctx;

  switch (tool.name) {
    // ========== 文件系统工具 ==========
    case 'read_file': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      if (!filePath) return '错误：文件路径为空';

      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const offset = tool.input?.offset || 0;
        const limit = tool.input?.limit;

        let lines = fileContent.split('\n');
        if (offset > 0 || limit) {
          lines = lines.slice(offset, limit ? offset + limit : undefined);
        }

        const content = lines.join('\n');
        const truncatedContent = content.length > 15000
          ? content.substring(0, 15000) + '\n... (内容过长，已截断)'
          : content;

        if (ws) {
          ws.send(JSON.stringify({ type: 'file_read', path: filePath, content: truncatedContent }));
        }

        return `文件内容 (${filePath}):\n\`\`\`\n${truncatedContent}\n\`\`\``;
      } catch (e: any) {
        const errMsg = `读取文件失败: ${e.message}`;
        if (ws) ws.send(JSON.stringify({ type: 'error', content: errMsg }));
        return errMsg;
      }
    }

    case 'write_file': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      const fileContent = tool.input?.content;
      if (!filePath || fileContent === undefined) return '错误：参数不完整';

      try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, fileContent, 'utf-8');
        if (ws) ws.send(JSON.stringify({ type: 'file_written', path: filePath }));
        return `写入文件成功: ${filePath}`;
      } catch (e: any) {
        const errMsg = `写入文件失败: ${e.message}`;
        if (ws) ws.send(JSON.stringify({ type: 'error', content: errMsg }));
        return errMsg;
      }
    }

    case 'replace': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      const oldString = tool.input?.old_string;
      const newString = tool.input?.new_string;

      if (!filePath || oldString === undefined || newString === undefined) {
        return '错误：参数不完整';
      }

      const result = replaceInFile(filePath, oldString, newString);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'file_replaced', path: filePath, matches: result.matches }));
      }
      return result.success
        ? `替换成功: ${filePath} (${result.matches} 处)`
        : `替换失败: ${result.message}`;
    }

    case 'edit': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      const edits = tool.input?.edits as EditOperation[];
      const createIfNotExists = tool.input?.create_if_not_exists;

      if (!filePath || !edits || !Array.isArray(edits)) {
        return '错误：参数不完整';
      }

      const result = editFile(filePath, edits, createIfNotExists);
      if (result.success && ws) {
        ws.send(JSON.stringify({
          type: 'file_edited',
          path: filePath,
          appliedEdits: result.appliedEdits,
          totalEdits: result.totalEdits
        }));
      }
      return result.success
        ? `编辑成功: ${filePath} (已应用 ${result.appliedEdits}/${result.totalEdits} 个编辑)`
        : `编辑部分失败: ${result.message}`;
    }

    case 'multi_edit': {
      const files = tool.input?.files;

      if (!files || !Array.isArray(files)) {
        return '错误：参数不完整';
      }

      const multiEdits = files.map((f: any) => ({
        filePath: resolveToWorkingDir(f.path),
        edits: f.edits as EditOperation[],
        createIfNotExists: f.create_if_not_exists
      }));

      const results = editMultipleFiles(multiEdits);
      const successCount = results.filter(r => r.success).length;

      if (ws) {
        ws.send(JSON.stringify({
          type: 'multi_file_edited',
          results: results.map(r => ({
            path: r.filePath,
            success: r.success,
            appliedEdits: r.appliedEdits
          }))
        }));
      }

      const summary = results.map(r =>
        `${r.filePath}: ${r.success ? '成功' : '失败'} (${r.appliedEdits} 个编辑)`
      ).join('\n');

      return `批量编辑完成 (${successCount}/${results.length} 成功):\n${summary}`;
    }

    case 'list_directory': {
      const dirPath = resolveToWorkingDir(tool.input?.path);
      if (!dirPath) return '错误：目录路径为空';

      try {
        const items = listDirectory(dirPath);
        const result = items.map(item => {
          const type = item.type === 'directory' ? '[DIR]' : '[FILE]';
          const size = item.size ? ` (${formatBytes(item.size)})` : '';
          return `${type} ${item.name}${size}`;
        }).join('\n');

        if (ws) ws.send(JSON.stringify({ type: 'directory_list', path: dirPath, items }));
        return `目录内容 (${dirPath}):\n${result}`;
      } catch (e: any) {
        return `列出目录失败: ${e.message}`;
      }
    }

    case 'glob': {
      const pattern = tool.input?.pattern;
      const searchPath = resolveToWorkingDir(tool.input?.path);

      if (!pattern) return '错误：模式为空';

      const files = globFiles({ pattern, path: searchPath });

      if (files.length === 0) {
        return `未找到匹配 "${pattern}" 的文件`;
      }

      const result = files.slice(0, 50).join('\n');
      if (ws) ws.send(JSON.stringify({ type: 'glob_result', pattern, files: files.slice(0, 50) }));
      return `找到 ${files.length} 个文件匹配 "${pattern}":\n${result}${files.length > 50 ? '\n... (结果已截断)' : ''}`;
    }

    case 'grep': {
      const pattern = tool.input?.pattern;
      const searchPath = resolveToWorkingDir(tool.input?.path);
      const include = tool.input?.include;

      if (!pattern) return '错误：搜索模式为空';

      const results = grepContent({ pattern, path: searchPath, include });

      if (results.length === 0) {
        return `未找到匹配 "${pattern}" 的内容`;
      }

      const output = results.map(r => `${r.file}:${r.line}: ${r.content}`).join('\n');
      if (ws) ws.send(JSON.stringify({ type: 'grep_result', pattern, results }));
      return `找到 ${results.length} 个匹配:\n${output}`;
    }

    // ========== Shell 工具 ==========
    case 'bash': {
      const cmd = tool.input?.command;
      if (!cmd) return '错误：命令为空';

      if (!commandExecutor.isSafeCommand(cmd)) {
        // SSE 模式：返回需要确认的提示
        if (!ws || !pendingCommands) {
          return `需要用户确认命令: ${cmd}`;
        }
        // WebSocket 模式：等待用户确认
        return new Promise((resolve) => {
          const confirmId = `${conversationId}-${Date.now()}`;
          pendingCommands.set(confirmId, { command: cmd, ws, conversationId, resolve });
          ws.send(JSON.stringify({ type: 'command_confirm', confirmId, command: cmd }));
        });
      }

      if (ws) ws.send(JSON.stringify({ type: 'command_start', command: cmd }));
      const result = await commandExecutor.execute(cmd);
      if (ws) {
        ws.send(JSON.stringify({
          type: 'command_result',
          command: cmd,
          success: result.success,
          stdout: result.stdout,
          stderr: result.stderr
        }));
      }

      const output = result.success
        ? (result.stdout || '(无输出)')
        : `错误: ${result.stderr || result.stdout}`;
      return `命令: ${cmd}\n${output}`;
    }

    // ========== 网络工具 ==========
    case 'web_search': {
      const query = tool.input?.query;
      if (!query) return '错误：搜索查询为空';

      if (ws) ws.send(JSON.stringify({ type: 'search_start', query }));

      try {
        const results = await webSearch(query);
        const output = results.map((r, i) =>
          `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`
        ).join('\n\n');

        if (ws) ws.send(JSON.stringify({ type: 'search_result', query, results }));
        return `搜索结果:\n${output}`;
      } catch (e: any) {
        return `搜索失败: ${e.message}`;
      }
    }

    case 'web_fetch': {
      const url = tool.input?.url;
      const prompt = tool.input?.prompt;

      if (!url) return '错误：URL 为空';

      if (ws) ws.send(JSON.stringify({ type: 'fetch_start', url }));

      try {
        const result = await webFetch(url, prompt);

        if (result.error) {
          return `获取失败: ${result.error}`;
        }

        if (ws) ws.send(JSON.stringify({ type: 'fetch_result', url, title: result.title }));
        return `网页内容 (${result.title}):\n${result.content}`;
      } catch (e: any) {
        return `获取失败: ${e.message}`;
      }
    }

    // ========== 任务管理工具 ==========
    case 'todo_write': {
      const todos = tool.input?.todos as TodoItem[];
      if (!todos || !Array.isArray(todos)) return '错误：任务列表格式无效';

      setTodos(conversationId, todos);

      const output = todos.map((t, i) => {
        const status = { 'pending': '⏳', 'in_progress': '🔄', 'completed': '✅', 'failed': '❌' }[t.status] || '⏳';
        return `${status} ${i + 1}. ${t.task}`;
      }).join('\n');

      if (ws) ws.send(JSON.stringify({ type: 'todo_updated', todos }));
      return `任务列表已更新:\n${output}`;
    }

    case 'todo_read': {
      const todos = getTodos(conversationId);

      if (todos.length === 0) {
        return '当前没有任务';
      }

      const output = todos.map((t, i) => {
        const status = { 'pending': '⏳', 'in_progress': '🔄', 'completed': '✅', 'failed': '❌' }[t.status] || '⏳';
        return `${status} ${i + 1}. ${t.task}`;
      }).join('\n');

      if (ws) ws.send(JSON.stringify({ type: 'todo_read', todos }));
      return `当前任务:\n${output}`;
    }

    // ========== Skill 工具 ==========
    case 'create_skill': {
      const skillName = tool.input?.name;
      const skillDesc = tool.input?.description || '';
      const skillPrompt = tool.input?.prompt;
      const triggers = tool.input?.triggers || [];

      if (!skillName || !skillPrompt) {
        return '错误：技能名称和提示词不能为空';
      }

      try {
        let skillContent = `# ${skillName}\n\n${skillDesc}\n\n`;

        if (triggers.length > 0) {
          skillContent += `TRIGGER\n`;
          for (const trigger of triggers) {
            skillContent += `- ${trigger}\n`;
          }
          skillContent += '\n';
        }

        skillContent += `PROMPT:\n${skillPrompt}\n`;

        const safeName = skillName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_');
        const skillPath = path.join(skillsDir, `${safeName}.md`);

        if (!fs.existsSync(skillsDir)) {
          fs.mkdirSync(skillsDir, { recursive: true });
        }

        fs.writeFileSync(skillPath, skillContent, 'utf-8');
        skillLoader.loadAll();

        if (ws) {
          ws.send(JSON.stringify({ type: 'skill_created', name: skillName, path: skillPath }));
        }
        return `技能创建成功: ${skillName} (${skillPath})`;
      } catch (e: any) {
        const errMsg = `创建技能失败: ${e.message}`;
        if (ws) ws.send(JSON.stringify({ type: 'error', content: errMsg }));
        return errMsg;
      }
    }

    // ========== 询问用户工具 ==========
    case 'ask_user': {
      const question = tool.input?.question;
      const header = tool.input?.header || '问题';
      const options = tool.input?.options;

      if (!question) return '错误：问题为空';

      // SSE 模式：不支持实时交互
      if (!ws || !pendingQuestions) {
        return `需要用户输入: ${question}`;
      }

      // WebSocket 模式：等待用户回复
      return new Promise((resolve) => {
        const askId = `${conversationId}-${Date.now()}`;
        pendingQuestions.set(askId, { resolve });
        ws.send(JSON.stringify({ type: 'ask_user', askId, question, header, options: options || null }));
      });
    }

    // ========== 媒体文件工具 ==========
    case 'get_files': {
      const rawPath = tool.input?.path;
      const filter = tool.input?.filter as string | undefined;
      const dirPath = rawPath ? resolveToWorkingDir(rawPath) : '';

      if (!dirPath) return '错误：目录路径为空';

      try {
        if (!fs.existsSync(dirPath)) {
          return `错误：目录不存在: ${dirPath}`;
        }

        if (!fs.statSync(dirPath).isDirectory()) {
          return `错误：路径不是目录: ${dirPath}`;
        }

        const filterExtensions: Record<string, string[]> = {
          audio: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma'],
          video: ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.wmv', '.flv'],
          image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'],
          document: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md'],
          code: ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.css', '.html', '.json', '.xml']
        };

        const files = fs.readdirSync(dirPath);
        const fileList: any[] = [];

        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stat = fs.statSync(filePath);
          const ext = path.extname(file).toLowerCase();

          if (filter && filterExtensions[filter]) {
            if (!stat.isDirectory() && !filterExtensions[filter].includes(ext)) {
              continue;
            }
          }

          fileList.push({
            name: file,
            path: filePath.replace(/\\/g, '/'),
            size: stat.size,
            isDirectory: stat.isDirectory(),
            extension: ext
          });
        }

        fileList.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

        const output = fileList.map(f => {
          const type = f.isDirectory ? '[DIR]' : `[${f.extension || 'FILE'}]`;
          const size = f.size ? ` (${formatBytes(f.size)})` : '';
          return `${type} ${f.name}${size}`;
        }).join('\n');

        return `目录 ${dirPath} 中的文件 (${fileList.length} 个):\n${output}`;
      } catch (e: any) {
        return `获取文件列表失败: ${e.message}`;
      }
    }

    case 'play_media': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';

      if (!filePath) return '错误：文件路径为空';

      try {
        if (!fs.existsSync(filePath)) {
          return `错误：文件不存在: ${filePath}`;
        }

        const ext = path.extname(filePath).toLowerCase();
        const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
        const videoExts = ['.mp4', '.webm', '.avi', '.mov', '.mkv'];
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];

        let mediaType = 'unknown';
        if (audioExts.includes(ext)) mediaType = 'audio';
        else if (videoExts.includes(ext)) mediaType = 'video';
        else if (imageExts.includes(ext)) mediaType = 'image';

        if (mediaType === 'unknown') {
          return `错误：不支持的媒体类型: ${ext}`;
        }

        const fileName = path.basename(filePath);
        const stat = fs.statSync(filePath);
        const fileSize = formatBytes(stat.size);

        // 生成媒体文件 URL（通过后端 API 代理访问）
        const mediaUrl = `/api/file?path=${encodeURIComponent(filePath)}`;

        return `MEDIA_INFO:${JSON.stringify({
          type: mediaType,
          path: filePath,
          name: fileName,
          size: fileSize,
          url: mediaUrl
        })}`;
      } catch (e: any) {
        return `播放媒体失败: ${e.message}`;
      }
    }

    // ========== 文件操作工具 ==========
    case 'copy_file': {
      const source = resolveToWorkingDir(tool.input?.source);
      const destination = resolveToWorkingDir(tool.input?.destination);

      if (!source || !destination) {
        return '错误：源路径和目标路径不能为空';
      }

      const result = copyFile(source, destination);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'file_copied', source, destination }));
      }
      return result.message;
    }

    case 'move_file': {
      const source = resolveToWorkingDir(tool.input?.source);
      const destination = resolveToWorkingDir(tool.input?.destination);

      if (!source || !destination) {
        return '错误：源路径和目标路径不能为空';
      }

      const result = moveFile(source, destination);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'file_moved', source, destination }));
      }
      return result.message;
    }

    case 'delete_file': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';

      if (!filePath) return '错误：文件路径为空';

      // 危险操作，需要确认
      if (!commandExecutor.isSafeCommand(`rm ${filePath}`)) {
        if (!ws || !pendingCommands) {
          return `需要用户确认删除操作: ${filePath}`;
        }
        return new Promise((resolve) => {
          const confirmId = `${conversationId}-${Date.now()}`;
          pendingCommands.set(confirmId, { 
            command: `删除: ${filePath}`, 
            action: 'delete', 
            path: filePath, 
            ws, 
            conversationId, 
            resolve 
          });
          ws.send(JSON.stringify({ type: 'command_confirm', confirmId, command: `删除: ${filePath}` }));
        });
      }

      const result = deleteFile(filePath);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'file_deleted', path: filePath }));
      }
      return result.message;
    }

    case 'create_directory': {
      const dirPath = resolveToWorkingDir(tool.input?.path);

      if (!dirPath) return '错误：目录路径为空';

      const result = createDirectory(dirPath);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'directory_created', path: dirPath }));
      }
      return result.message;
    }

    case 'file_info': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';

      if (!filePath) return '错误：文件路径为空';

      const info = getFileInfo(filePath);
      if (!info) {
        return `文件不存在: ${filePath}`;
      }

      const output = [
        `路径: ${info.path}`,
        `名称: ${info.name}`,
        `类型: ${info.isDirectory ? '目录' : '文件'}`,
        `扩展名: ${info.extension || '(无)'}`,
        `大小: ${info.sizeFormatted}`,
        `创建时间: ${info.created.toLocaleString()}`,
        `修改时间: ${info.modified.toLocaleString()}`,
        `访问时间: ${info.accessed.toLocaleString()}`,
        `权限: ${info.permissions}`
      ].join('\n');

      return `文件信息:\n${output}`;
    }

    case 'file_exists': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';

      if (!filePath) return '错误：文件路径为空';

      const exists = fileExists(filePath);
      return exists ? `存在: ${filePath}` : `不存在: ${filePath}`;
    }

    // ========== XML 转义工具 ==========
    case 'xml_escape': {
      const text = tool.input?.text;
      if (text === undefined || text === null) {
        return '错误：文本不能为空';
      }
      const escaped = xmlEscape(text);
      return `转义结果:\n${escaped}`;
    }

    // ========== Notebook 编辑工具 ==========
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

    // ========== 异步任务工具 ==========
    case 'task_create': {
      const taskId = tool.input?.task_id;
      const name = tool.input?.name;

      if (!taskId || !name) {
        return '错误：缺少任务 ID 或名称';
      }

      const task = createTask(taskId, name);
      if (ws) {
        ws.send(JSON.stringify({ type: 'task_created', taskId, name }));
      }
      return `任务已创建: ${taskId} - ${name}`;
    }

    case 'task_get': {
      const taskId = tool.input?.task_id;
      if (!taskId) return '错误：缺少任务 ID';

      const task = getTask(taskId);
      if (!task) {
        return `任务不存在: ${taskId}`;
      }

      return `任务详情:\nID: ${task.id}\n名称: ${task.name}\n状态: ${task.status}\n创建时间: ${task.createdAt.toLocaleString()}\n更新时间: ${task.updatedAt.toLocaleString()}${task.progress ? `\n进度: ${task.progress}%` : ''}${task.result ? `\n结果: ${task.result}` : ''}${task.error ? `\n错误: ${task.error}` : ''}`;
    }

    case 'task_list': {
      const status = tool.input?.status as AsyncTask['status'] | undefined;
      const tasks = listTasks(status);

      if (tasks.length === 0) {
        return status ? `没有状态为 ${status} 的任务` : '没有任务';
      }

      const output = tasks.map(t => {
        const statusIcon = { pending: '⏳', running: '🔄', completed: '✅', failed: '❌', cancelled: '🚫' }[t.status];
        return `${statusIcon} ${t.id}: ${t.name} (${t.status})`;
      }).join('\n');

      if (ws) {
        ws.send(JSON.stringify({ type: 'task_list', tasks: tasks.map(t => ({ id: t.id, name: t.name, status: t.status })) }));
      }
      return `任务列表 (${tasks.length} 个):\n${output}`;
    }

    case 'task_update': {
      const taskId = tool.input?.task_id;
      const status = tool.input?.status;
      const progress = tool.input?.progress;
      const result = tool.input?.result;
      const error = tool.input?.error;

      if (!taskId) return '错误：缺少任务 ID';

      const updates: any = {};
      if (status) updates.status = status;
      if (progress !== undefined) updates.progress = progress;
      if (result !== undefined) updates.result = result;
      if (error !== undefined) updates.error = error;

      const task = updateTask(taskId, updates);
      if (!task) {
        return `任务不存在: ${taskId}`;
      }

      if (ws) {
        ws.send(JSON.stringify({ type: 'task_updated', taskId, status: task.status, progress: task.progress }));
      }
      return `任务已更新: ${taskId} (${task.status})`;
    }

    case 'task_stop': {
      const taskId = tool.input?.task_id;
      if (!taskId) return '错误：缺少任务 ID';

      const task = stopTask(taskId);
      if (!task) {
        return `任务不存在: ${taskId}`;
      }

      if (ws) {
        ws.send(JSON.stringify({ type: 'task_stopped', taskId }));
      }
      return `任务已停止: ${taskId}`;
    }

    // ========== Plan 模式工具 ==========
    case 'plan_create': {
      const planId = tool.input?.plan_id;
      const title = tool.input?.title;
      const steps = tool.input?.steps as string[];

      if (!planId || !title || !steps || !Array.isArray(steps)) {
        return '错误：参数不完整';
      }

      const plan = createPlan(planId, title, steps);
      if (ws) {
        ws.send(JSON.stringify({ type: 'plan_created', planId, title, stepCount: steps.length }));
      }

      const stepsList = steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
      return `计划已创建: ${title}\n\n步骤:\n${stepsList}`;
    }

    case 'plan_get': {
      const planId = tool.input?.plan_id;
      if (!planId) return '错误：缺少计划 ID';

      const plan = getPlan(planId);
      if (!plan) {
        return `计划不存在: ${planId}`;
      }

      const stepsList = plan.steps.map((s, i) => {
        const statusIcon = { pending: '⏳', in_progress: '🔄', completed: '✅' }[s.status];
        return `${statusIcon} ${i + 1}. ${s.content}`;
      }).join('\n');

      return `计划: ${plan.title}\n\n步骤:\n${stepsList}`;
    }

    case 'plan_update_step': {
      const planId = tool.input?.plan_id;
      const stepId = tool.input?.step_id;
      const status = tool.input?.status;

      if (!planId || !stepId || !status) {
        return '错误：参数不完整';
      }

      const plan = updatePlanStep(planId, stepId, status);
      if (!plan) {
        return `计划或步骤不存在`;
      }

      if (ws) {
        ws.send(JSON.stringify({ type: 'plan_step_updated', planId, stepId, status }));
      }
      return `步骤已更新: ${stepId} -> ${status}`;
    }

    // ========== Git Worktree 工具 ==========
    case 'worktree_list': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path);

      const worktrees = await listWorktrees(repoPath);
      if (worktrees.length === 0) {
        return `未找到工作树，或不是 Git 仓库`;
      }

      const output = worktrees.map(w => {
        const mainTag = w.isMain ? ' [MAIN]' : '';
        return `${mainTag} ${w.path}\n    分支: ${w.branch || '(detached)'}\n    HEAD: ${w.head?.substring(0, 8)}`;
      }).join('\n\n');

      return `Git 工作树 (${worktrees.length} 个):\n\n${output}`;
    }

    case 'worktree_create': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path);
      const branchName = tool.input?.branch_name;
      const worktreePath = tool.input?.worktree_path;

      if (!branchName || !worktreePath) {
        return '错误：缺少分支名称或工作树路径';
      }

      const result = await createWorktree(repoPath, branchName, worktreePath);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'worktree_created', branchName, worktreePath }));
      }
      return result.message;
    }

    case 'worktree_remove': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path);
      const worktreePath = tool.input?.worktree_path;

      if (!worktreePath) {
        return '错误：缺少工作树路径';
      }

      const result = await removeWorktree(repoPath, worktreePath);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'worktree_removed', worktreePath }));
      }
      return result.message;
    }

    // ========== Agent 工具 ==========
    case 'agent_spawn': {
      const agentId = tool.input?.agent_id;
      const task = tool.input?.task;
      const agentType = tool.input?.agent_type || 'explore';

      if (!agentId || !task) {
        return '错误：缺少代理 ID 或任务描述';
      }

      if (ctx.agentOrchestrator) {
        try {
          const agent = await ctx.agentOrchestrator.spawn({
            id: agentId,
            type: agentType as 'explore' | 'code' | 'research',
            task,
            parentConversationId: ctx.conversationId
          });

          if (ctx.ws) {
            ctx.ws.send(JSON.stringify({
              type: 'agent_spawned',
              agentId,
              task,
              agentType,
              status: 'running'
            }));
          }

          return `代理已创建：${agentId}\n类型：${agentType}\n任务：${task}\n\n代理正在后台执行，使用 task_get 查询进度。`;
        } catch (error: any) {
          return `代理创建失败：${error.message}`;
        }
      }

      // 降级处理：仅创建任务跟踪
      const agentTask = createTask(agentId, `[Agent] ${task}`);
      updateTask(agentId, { status: 'running' });

      if (ctx.ws) {
        ctx.ws.send(JSON.stringify({
          type: 'agent_spawned',
          agentId,
          task,
          agentType,
          status: 'running'
        }));
      }

      // 注意：实际的代理执行逻辑需要在 LLM 循环中处理
      return `代理已创建: ${agentId}\n类型: ${agentType}\n任务: ${task}\n\n注意：未初始化 AgentOrchestrator，代理不会实际执行。`;
    }


    // ========== Git 增强工具 ==========
    case 'git_status': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path) || getWorkingDir();
      
      try {
        const { execSync } = require('child_process');
        const result = execSync('git status --short', { cwd: repoPath, encoding: 'utf-8' });
        
        if (!result.trim()) {
          return 'Git 状态：工作区干净，没有未提交的更改';
        }
        
        return `Git 状态 (${repoPath}):
${result}`;
      } catch (e: any) {
        return `获取 Git 状态失败：${e.message}`;
      }
    }

    case 'git_diff': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path) || getWorkingDir();
      const staged = tool.input?.staged ? '--staged' : '';
      const filePath = tool.input?.file_path || '';
      
      try {
        const { execSync } = require('child_process');
        const cmd = `git diff ${staged} ${filePath}`.trim();
        const result = execSync(cmd, { cwd: repoPath, encoding: 'utf-8' });
        
        if (!result.trim()) {
          return `Git 差异：${staged ? '暂存区' : '工作区'} 没有变化`;
        }
        
        return `Git 差异 (${repoPath}):
${result}`;
      } catch (e: any) {
        return `获取 Git 差异失败：${e.message}`;
      }
    }

    case 'git_log': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path) || getWorkingDir();
      const maxCount = tool.input?.max_count || 10;
      
      try {
        const { execSync } = require('child_process');
        const format = '--pretty=format:"%h - %an, %ar : %s"';
        const result = execSync(`git log ${format} -n ${maxCount}`, { cwd: repoPath, encoding: 'utf-8' });
        
        if (!result.trim()) {
          return 'Git 日志：没有找到提交记录';
        }
        
        return `Git 提交历史 (${repoPath}, 最近 ${maxCount} 条):
${result}`;
      } catch (e: any) {
        return `获取 Git 日志失败：${e.message}`;
      }
    }

    case 'git_branch': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path) || getWorkingDir();
      const remote = tool.input?.remote ? '-r' : '';
      
      try {
        const { execSync } = require('child_process');
        const result = execSync(`git branch ${remote}`, { cwd: repoPath, encoding: 'utf-8' });
        
        if (!result.trim()) {
          return 'Git 分支：没有找到分支';
        }
        
        return `Git 分支 (${repoPath}):
${result}`;
      } catch (e: any) {
        return `获取 Git 分支失败：${e.message}`;
      }
    }

    case 'git_checkout': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path) || getWorkingDir();
      const branchName = tool.input?.branch_name;
      const createNew = tool.input?.create_new || false;
      
      if (!branchName) {
        return '错误：分支名称不能为空';
      }
      
      try {
        const { execSync } = require('child_process');
        const cmd = createNew ? `git checkout -b ${branchName}` : `git checkout ${branchName}`;
        const result = execSync(cmd, { cwd: repoPath, encoding: 'utf-8' });
        
        return `Git 切换分支：${createNew ? '创建并切换到' : '已切换到'} ${branchName}
${result}`;
      } catch (e: any) {
        return `Git 切换分支失败：${e.message}`;
      }
    }

    case 'git_add': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path) || getWorkingDir();
      const files = tool.input?.files || [];
      
      if (!files.length) {
        return '错误：文件列表不能为空';
      }
      
      try {
        const { execSync } = require('child_process');
        const cmd = `git add ${files.join(' ')}`;
        execSync(cmd, { cwd: repoPath, encoding: 'utf-8' });
        
        return `Git 添加文件成功：${files.join(', ')}`;
      } catch (e: any) {
        return `Git 添加文件失败：${e.message}`;
      }
    }

    case 'git_commit': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path) || getWorkingDir();
      const message = tool.input?.message;
      const amend = tool.input?.amend || false;
      
      if (!message) {
        return '错误：提交信息不能为空';
      }
      
      // 危险操作，需要确认
      if (!ctx.ws || !ctx.pendingCommands) {
        return `需要用户确认提交：${message}`;
      }
      
      return new Promise((resolve) => {
        const confirmId = `${conversationId}-${Date.now()}`;
        ctx.pendingCommands!.set(confirmId, { 
          command: `git commit ${amend ? '--amend' : ''} -m "${message}"`, 
          action: 'git_commit',
          ws: ctx.ws, 
          conversationId, 
          resolve 
        });
        ctx.ws!.send(JSON.stringify({ 
          type: 'command_confirm', 
          confirmId, 
          command: `Git 提交：${message}${amend ? ' (修正上一次提交)' : ''}` 
        }));
      });
    }


    // ========== 项目索引工具 ==========
    case 'project_index': {
      const rootPath = resolveToWorkingDir(tool.input?.root_path) || getWorkingDir();
      const maxDepth = tool.input?.max_depth || 5;
      
      try {
        const { execSync } = require('child_process');
        
        let structure = '';
        try {
          const treeCmd = process.platform === 'win32' ? 'tree /F' : 'find . -type f | head -200';
          structure = execSync(treeCmd, { cwd: rootPath, encoding: 'utf-8', maxBuffer: 1024 * 1024 });
        } catch (e) {
          structure = '无法生成树状图';
        }
        
        const fileTypes: Record<string, number> = {};
        const { readdirSync } = require('fs');
        const { extname } = require('path');
        
        function countFiles(dir: string, depth: number) {
          if (depth > maxDepth) return;
          
          let items;
          try {
            items = readdirSync(dir, { withFileTypes: true });
          } catch (e) {
            return;
          }
          
          for (const item of items) {
            if (item.name.startsWith('.') || item.name === 'node_modules') continue;
            
            if (item.isDirectory()) {
              countFiles(path.join(dir, item.name), depth + 1);
            } else if (item.isFile()) {
              const ext = extname(item.name).toLowerCase() || '(无扩展名)';
              fileTypes[ext] = (fileTypes[ext] || 0) + 1;
            }
          }
        }
        
        countFiles(rootPath, 0);
        
        const typeSummary = Object.entries(fileTypes)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(function(entry) { return '  ' + entry[0] + ': ' + entry[1] + ' 个文件'; })
          .join('\n');
        
        const totalFiles = Object.values(fileTypes).reduce(function(a: number, b: number) { return a + b; }, 0);
        
        return '项目索引 (' + rootPath + '):\n\n' +
          '📁 目录结构:\n' + structure + '\n\n' +
          '📊 文件类型统计 (共 ' + totalFiles + ' 个文件):\n' + typeSummary;
      } catch (e: any) {
        return '生成项目索引失败：' + e.message;
      }
    }

    case 'find_entry_points': {
      const rootPath = resolveToWorkingDir(tool.input?.root_path) || getWorkingDir();
      
      try {
        const { readdirSync, existsSync, readFileSync } = require('fs');
        const { join } = require('path');
        
        const entryNames = [
          'main.ts', 'main.js', 'main.py', 'main.go', 'main.rs',
          'index.ts', 'index.js', 'index.py',
          'app.ts', 'app.js', 'app.py',
          'server.ts', 'server.js', 'server.py'
        ];
        
        const entries: string[] = [];
        
        function findEntries(dir: string, depth: number) {
          if (depth > 3) return;
          
          let items;
          try {
            items = readdirSync(dir, { withFileTypes: true });
          } catch (e) {
            return;
          }
          
          for (const item of items) {
            if (item.name.startsWith('.') || item.name === 'node_modules') continue;
            
            const fullPath = join(dir, item.name);
            
            if (item.isDirectory()) {
              if (entryNames.includes(item.name)) {
                entries.push('[DIR] ' + fullPath);
              }
              findEntries(fullPath, depth + 1);
            } else if (item.isFile() && entryNames.includes(item.name)) {
              entries.push('[FILE] ' + fullPath);
            }
          }
        }
        
        findEntries(rootPath, 0);
        
        const pkgPath = join(rootPath, 'package.json');
        if (existsSync(pkgPath)) {
          try {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
            if (pkg.main) {
              entries.unshift('[npm main] ' + pkg.main);
            }
          } catch (e: any) {}
        }
        
        if (entries.length === 0) {
          return '未找到明显的入口点文件';
        }
        
        return '项目入口点 (' + rootPath + '):\n' + entries.join('\n');
      } catch (e: any) {
        return '查找入口点失败：' + e.message;
      }
    }

    case 'analyze_dependencies': {
      const rootPath = resolveToWorkingDir(tool.input?.root_path) || getWorkingDir();
      
      try {
        const { readFileSync, existsSync } = require('fs');
        const { join } = require('path');
        
        const deps: string[] = [];
        
        const pkgPath = join(rootPath, 'package.json');
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
          const depCount = pkg.dependencies ? Object.keys(pkg.dependencies).length : 0;
          const devDepCount = pkg.devDependencies ? Object.keys(pkg.devDependencies).length : 0;
          deps.push('Node.js 项目：' + (pkg.name || 'unknown') + '@' + (pkg.version || '0.0.0') + ' - 生产依赖：' + depCount + ' 个，开发依赖：' + devDepCount + ' 个');
        }
        
        const reqPath = join(rootPath, 'requirements.txt');
        if (existsSync(reqPath)) {
          const content = readFileSync(reqPath, 'utf-8');
          const packages = content.split('\n').filter(function(line: string) { return line.trim() && !line.startsWith('#'); }).length;
          deps.push('Python 项目：' + packages + ' 个依赖包');
        }
        
        const goPath = join(rootPath, 'go.mod');
        if (existsSync(goPath)) {
          const content = readFileSync(goPath, 'utf-8');
          const moduleMatch = content.match(/module\s+(\S+)/);
          deps.push('Go 模块：' + (moduleMatch ? moduleMatch[1] : 'unknown'));
        }
        
        const cargoPath = join(rootPath, 'Cargo.toml');
        if (existsSync(cargoPath)) {
          const content = readFileSync(cargoPath, 'utf-8');
          const nameMatch = content.match(/^name\s*=\s*"([^"]+)"/m);
          deps.push('Rust 项目：' + (nameMatch ? nameMatch[1] : 'unknown'));
        }
        
        if (deps.length === 0) {
          return '未找到常见的依赖配置文件';
        }
        
        return '项目依赖分析 (' + rootPath + '):\n\n' + deps.join('\n');
      } catch (e: any) {
        return '分析依赖失败：' + e.message;
      }
    }


  
    // ========== TTS 工具 ==========
    case 'tts_list_voices': {
      try {
        const { execSync } = require('child_process');
        // 优先使用 Python edge-tts
        const result = execSync('edge-tts --list-voices', { 
          encoding: 'utf-8',
          cwd: process.cwd()
        });
        return result;
      } catch (e: any) {
        // Python 版本失败时尝试 Node.js 版本
        try {
          const { execSync } = require('child_process');
          const result = execSync('tsx src/utils/tts-runner.ts --list-voices', { 
            encoding: 'utf-8',
            cwd: process.cwd()
          });
          return result;
        } catch (e2: any) {
          return '获取音色列表失败：' + e2.message + '\n请安装 edge-tts: pip install edge-tts';
        }
      }
    }

    case 'tts_convert': {
      const text = tool.input?.text;
      const voice = tool.input?.voice || 'zh-CN-XiaoxiaoNeural';
      const rate = tool.input?.rate;
      const pitch = tool.input?.pitch;
      const outputFile = tool.input?.output_file;

      if (!text) {
        return '错误：文字不能为空';
      }

      try {
        const { execSync } = require('child_process');
        const path = require('path');
        const fs = require('fs');

        // 确保输出目录存在
        const audioDir = path.join(process.cwd(), 'media', 'audio');
        if (!fs.existsSync(audioDir)) {
          fs.mkdirSync(audioDir, { recursive: true });
        }

        // 生成输出文件路径
        let outputPath = outputFile;
        if (!outputPath) {
          const timestamp = Date.now();
          outputPath = path.join(audioDir, `tts_${timestamp}.mp3`);
        }

        // 构建 edge-tts 命令（Python 版本）
        let cmd = `edge-tts --text ${JSON.stringify(text)} --voice ${voice}`;
        
        if (rate !== undefined) {
          const rateStr = rate > 0 ? `+${rate}%` : `${rate}%`;
          cmd += ` --rate ${rateStr}`;
        }
        if (pitch !== undefined) {
          const pitchStr = pitch > 0 ? `+${pitch}%` : `${pitch}%`;
          cmd += ` --pitch ${pitchStr}`;
        }
        
        cmd += ` --write-media ${outputPath}`;

        const result = execSync(cmd, {
          encoding: 'utf-8',
          cwd: process.cwd()
        });

        // 生成媒体文件 URL（通过后端 API 代理访问）
        const mediaUrl = `/api/file?path=${encodeURIComponent(outputPath)}`;

        return `MEDIA_INFO:${JSON.stringify({
          type: 'audio',
          path: outputPath,
          name: path.basename(outputPath),
          url: mediaUrl
        })}`;
      } catch (e: any) {
        // Python 版本失败时尝试 Node.js 版本
        try {
          const { execSync } = require('child_process');
          const path = require('path');

          let nodeCmd = 'tsx src/utils/tts-runner.ts --text ' + JSON.stringify(text);
          if (voice) nodeCmd += ' --voice ' + voice;
          if (rate !== undefined) nodeCmd += ' --rate ' + rate;
          if (pitch !== undefined) nodeCmd += ' --pitch ' + pitch;
          if (outputFile) nodeCmd += ' --output ' + outputFile;

          const result = execSync(nodeCmd, {
            encoding: 'utf-8',
            cwd: process.cwd()
          });

          // 解析输出获取文件路径
          const pathMatch = result.match(/OUTPUT_PATH=(.+)/);
          const outPath = pathMatch ? pathMatch[1].trim() : null;

          // 生成媒体文件 URL（通过后端 API 代理访问）
          const mediaUrl = outPath ? `/api/file?path=${encodeURIComponent(outPath)}` : '';

          return `MEDIA_INFO:${JSON.stringify({
            type: 'audio',
            path: outPath || '',
            name: outPath ? path.basename(outPath) : '',
            url: mediaUrl
          })}`;
        } catch (e2: any) {
          return '文字转语音失败：' + e2.message + '\n请确保已安装 edge-tts: pip install edge-tts';
        }
      }
    }

    case 'tts_get_recommended': {
      const recommended = {
        '中文女声': { name: 'zh-CN-XiaoxiaoNeural', desc: '温暖、亲切，适合日常对话' },
        '中文男声': { name: 'zh-CN-YunxiNeural', desc: '沉稳、专业，适合正式场合' },
        '中文新闻男声': { name: 'zh-CN-YunyangNeural', desc: '新闻播报风格' },
        '中文活泼女声': { name: 'zh-CN-XiaoyiNeural', desc: '活泼、年轻' },
        '英文女声': { name: 'en-US-JennyNeural', desc: '清晰、友好，美式发音' },
        '英文男声': { name: 'en-US-GuyNeural', desc: '自然、流畅，美式发音' }
      };

      const summary = Object.entries(recommended).map(([label, info]) =>
        label + ': ' + info.name + '\n  ' + info.desc
      ).join('\n\n');

      return '推荐音色:\n\n' + summary +
        '\n\n使用 tts_convert 工具时，可通过 voice 参数指定这些音色';
    }

    default:
      return `未知工具: ${tool.name}`;
  }
}

// ==================== 辅助函数 ====================

/**
 * 验证解析后的路径是否在工作目录内（防止路径遍历攻击）
 */
function validatePath(resolvedPath: string, workingDir: string): boolean {
  const normalizedResolved = path.normalize(resolvedPath);
  const normalizedWorking = path.normalize(workingDir);
  // 确保解析后的路径以工作目录开头（考虑 Windows 盘符大小写）
  return normalizedResolved.toLowerCase().startsWith(normalizedWorking.toLowerCase());
}

/**
 * 将目标路径解析到工作目录，并进行安全验证
 * @throws Error 如果路径遍历到工作目录外
 */
function resolveToWorkingDir(target?: string): string {
  const workingDir = getWorkingDir();
  
  if (!target) return workingDir;
  
  const resolvedPath = path.isAbsolute(target) ? target : path.resolve(workingDir, target);
  
  // 安全检查：防止路径遍历攻击（如 ../../../etc/passwd）
  if (!validatePath(resolvedPath, workingDir)) {
    throw new Error(`路径不允许：${target} - 无法访问工作目录外的文件`);
  }
  
  return resolvedPath;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
