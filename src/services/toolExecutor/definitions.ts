/**
 * 工具定义
 * 定义所有可用的工具及其参数 schema
 */

export const TOOLS = [
  // ========== 文件系统工具 ==========
  {
    name: 'read_file',
    description: '读取文件内容。支持文本文件、图片、DOCX 等。对于 PDF、Excel 等无法直接读取的文件，请使用 open_file 工具。对于大文件会自动截断。',
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
          description: '编辑操作列表',
          items: {
            type: 'object',
            properties: {
              oldText: { type: 'string', description: '要替换的文本' },
              newText: { type: 'string', description: '替换后的文本' }
            },
            required: ['oldText', 'newText']
          }
        },
        create_if_not_exists: { type: 'boolean', description: '如果文件不存在是否创建' }
      },
      required: ['file_path', 'edits']
    }
  },
  {
    name: 'edit_multiple',
    description: '批量编辑多个文件。可以一次性对多个文件执行编辑操作。',
    input_schema: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          description: '文件编辑列表',
          items: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: '文件路径' },
              edits: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    oldText: { type: 'string' },
                    newText: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      },
      required: ['edits']
    }
  },
  {
    name: 'list_directory',
    description: '列出目录内容。返回目录下的文件和子目录列表。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径（绝对路径，或相对当前工作目录）' }
      },
      required: ['path']
    }
  },
  {
    name: 'glob',
    description: '使用模式匹配搜索文件。支持 ** 和 * 通配符。',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '匹配模式，如 **/*.ts' },
        path: { type: 'string', description: '搜索路径（可选，默认当前工作目录）' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'grep',
    description: '在文件内容中搜索匹配的文本。支持正则表达式。',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '搜索模式（支持正则）' },
        path: { type: 'string', description: '搜索路径（可选）' },
        include: { type: 'string', description: '文件匹配模式（可选）' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'copy_file',
    description: '复制文件或目录。',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: '源文件路径' },
        destination: { type: 'string', description: '目标路径' }
      },
      required: ['source', 'destination']
    }
  },
  {
    name: 'move_file',
    description: '移动或重命名文件或目录。',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: '源路径' },
        destination: { type: 'string', description: '目标路径' }
      },
      required: ['source', 'destination']
    }
  },
  {
    name: 'delete_file',
    description: '删除文件或目录。危险操作，需要用户确认。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '要删除的文件或目录路径' }
      },
      required: ['path']
    }
  },
  {
    name: 'create_directory',
    description: '创建新目录。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径' }
      },
      required: ['path']
    }
  },
  {
    name: 'get_file_info',
    description: '获取文件或目录的详细信息。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件或目录路径' }
      },
      required: ['path']
    }
  },
  {
    name: 'file_exists',
    description: '检查文件或目录是否存在。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件或目录路径' }
      },
      required: ['path']
    }
  },
  {
    name: 'open_file',
    description: '使用系统默认程序打开文件。适用于 PDF、Excel、PPT、视频、音频等无法直接读取的文件。如果系统没有安装相应的软件，会提示用户下载。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '要打开的文件路径' }
      },
      required: ['file_path']
    }
  },

  // ========== Shell 工具 ==========
  {
    name: 'bash',
    description: '执行 Shell 命令。危险命令（如删除、强制推送等）需要用户确认。',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的命令' },
        timeout: { type: 'number', description: '超时时间（毫秒，可选）' }
      },
      required: ['command']
    }
  },

  // ========== Web 工具 ==========
  {
    name: 'web_search',
    description: '搜索网络信息。',
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
    description: '获取网页内容。',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '网页 URL' },
        prompt: { type: 'string', description: '提取提示（可选）' }
      },
      required: ['url']
    }
  },

  // ========== 任务管理工具 ==========
  {
    name: 'todo_write',
    description: '更新任务列表。用于跟踪正在进行的任务。',
    input_schema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: '任务列表',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '任务 ID' },
              task: { type: 'string', description: '任务描述' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'] },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] }
            },
            required: ['id', 'task', 'status']
          }
        }
      },
      required: ['todos']
    }
  },
  {
    name: 'todo_read',
    description: '读取当前任务列表。',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },

  // ========== Notebook 工具 ==========
  {
    name: 'notebook_read',
    description: '读取 Jupyter Notebook 文件。',
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
    description: '编辑 Jupyter Notebook 单元格。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Notebook 文件路径' },
        cell_index: { type: 'number', description: '单元格索引' },
        new_source: { type: 'string', description: '新的单元格内容' },
        cell_type: { type: 'string', enum: ['markdown', 'code', 'raw'] }
      },
      required: ['file_path', 'cell_index', 'new_source']
    }
  },
  {
    name: 'notebook_add_cell',
    description: '在 Jupyter Notebook 中添加单元格。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Notebook 文件路径' },
        cell_type: { type: 'string', enum: ['markdown', 'code', 'raw'] },
        source: { type: 'string', description: '单元格内容' },
        position: { type: 'number', description: '插入位置（可选）' }
      },
      required: ['file_path', 'cell_type', 'source']
    }
  },
  {
    name: 'notebook_delete_cell',
    description: '删除 Jupyter Notebook 单元格。',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Notebook 文件路径' },
        cell_index: { type: 'number', description: '要删除的单元格索引' }
      },
      required: ['file_path', 'cell_index']
    }
  },

  // ========== 技能工具 ==========
  {
    name: 'create_skill',
    description: '创建新技能文件。',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '技能名称' },
        description: { type: 'string', description: '技能描述' },
        triggers: {
          type: 'array',
          description: '触发关键词',
          items: { type: 'string' }
        },
        prompt: { type: 'string', description: '技能的系统提示' }
      },
      required: ['name', 'description', 'prompt']
    }
  },

  // ========== Git 工具 ==========
  {
    name: 'git_commit',
    description: '创建 Git 提交。需要用户确认。',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '提交信息' }
      },
      required: ['message']
    }
  },
  {
    name: 'git_status',
    description: '获取 Git 状态。',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'git_diff',
    description: '查看 Git 差异。',
    input_schema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '文件路径（可选）' }
      }
    }
  },
  {
    name: 'git_log',
    description: '查看 Git 日志。',
    input_schema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: '显示数量（可选，默认10）' }
      }
    }
  },
  {
    name: 'git_worktree_list',
    description: '列出 Git Worktree。',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'git_worktree_create',
    description: '创建 Git Worktree。',
    input_schema: {
      type: 'object',
      properties: {
        branch_name: { type: 'string', description: '分支名称' },
        path: { type: 'string', description: 'Worktree 路径' }
      },
      required: ['branch_name', 'path']
    }
  },
  {
    name: 'git_worktree_remove',
    description: '删除 Git Worktree。',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Worktree 路径' }
      },
      required: ['path']
    }
  },

  // ========== 媒体工具 ==========
  {
    name: 'play_media',
    description: '播放媒体文件。',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '媒体 URL 或文件路径' },
        type: { type: 'string', enum: ['audio', 'video', 'image'], description: '媒体类型' }
      },
      required: ['url', 'type']
    }
  },
  {
    name: 'tts',
    description: '文本转语音。',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要朗读的文本' },
        voice: { type: 'string', description: '语音（可选）' }
      },
      required: ['text']
    }
  },

  // ========== 用户交互工具 ==========
  {
    name: 'ask_user',
    description: '向用户提问并等待回答。用于获取额外信息或确认。',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '问题内容' },
        header: { type: 'string', description: '问题标题（可选）' },
        options: {
          type: 'array',
          description: '选项列表（可选）',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: '选项标签' },
              description: { type: 'string', description: '选项描述' }
            }
          }
        },
        multi_select: { type: 'boolean', description: '是否多选' }
      },
      required: ['question']
    }
  },

  // ========== Agent 工具 ==========
  {
    name: 'agent_spawn',
    description: '创建并启动一个子代理来执行特定任务。',
    input_schema: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          enum: ['planner', 'executor', 'reviewer', 'explorer', 'researcher'],
          description: '代理角色'
        },
        task: { type: 'string', description: '任务描述' }
      },
      required: ['role', 'task']
    }
  },
  {
    name: 'agent_plan',
    description: '创建执行计划。将复杂任务分解为子任务。',
    input_schema: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: '总体目标' }
      },
      required: ['goal']
    }
  },
  {
    name: 'agent_execute_plan',
    description: '执行已创建的计划。',
    input_schema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string', description: '计划 ID' }
      },
      required: ['plan_id']
    }
  },
  {
    name: 'agent_get',
    description: '获取代理状态。',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '代理 ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'agent_list',
    description: '列出所有代理。',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'agent_memory_search',
    description: '搜索代理的长期记忆。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询' },
        limit: { type: 'number', description: '返回数量（可选）' }
      },
      required: ['query']
    }
  }
];