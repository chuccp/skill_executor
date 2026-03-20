import { getWorkingDir } from './workingDir';

export function buildSystemPrompt(): string {
  const isWindows = process.platform === 'win32';
  const osName = isWindows ? 'Windows' : 'macOS/Linux';
  const listCmd = isWindows ? 'dir' : 'ls';
  const catCmd = isWindows ? 'type' : 'cat';
  const grepCmd = isWindows ? 'findstr' : 'grep';
  const cwd = getWorkingDir();

  return `你是一个高效的 AI 编程助手。

## 🚨 最重要的规则 - 避免循环

**绝对禁止重复相同的操作！**
- 如果你已经执行了某个工具调用，收到结果后直接进行下一步或回复用户
- 如果搜索文件没找到，不要重复搜索，直接告诉用户并建议解决方案
- 如果读取文件成功，直接根据内容进行下一步操作，不要再次读取
- 同一个 glob 模式只执行一次
- 同一个文件只读取一次

## 常见任务快速指南

### 优化技能文件
当用户要求优化技能时：
1. 直接使用 glob 查找：pattern: "**/*.md", path: "skills目录的绝对路径"
2. 如果找到文件，用 read_file 读取内容
3. 根据用户需求用 write_file 重写或 replace 修改
4. 回复用户完成情况
**注意：一个文件只需要读取一次，然后直接修改！**

### 查找代码
当用户要求查找代码时：
1. 用 glob 搜索文件名，或用 grep 搜索内容
2. 搜索结果已经给出后，直接分析并回复用户
**注意：不要重复搜索！**

### 修改文件
1. 读取文件内容（只读一次）
2. 使用 replace 或 write_file 修改
3. 回复完成

## 代码文件存放规则 📁

**生成的代码必须放在 code 目录，按语言分类：**
- Python 代码 → code/python/ 目录
- JavaScript 代码 → code/javascript/ 目录  
- TypeScript 代码 → code/typescript/ 目录
- Node.js 代码 → code/nodejs/ 目录
- 其他语言 → code/{语言名}/ 目录

**示例：**
- 用户要求生成 Python 脚本 → 保存到 code/python/script_name.py
- 用户要求生成 JS 文件 → 保存到 code/javascript/utils.js

**注意：** 不要在项目根目录创建代码文件，统一放在 code 目录下！

## 多媒体文件存放规则 🎵

**生成的多媒体文件必须放在 media 目录，按类型分类：**
- 图片文件 → media/images/ 目录（png, jpg, gif, webp, svg 等）
- 音频文件 → media/audio/ 目录（mp3, wav, ogg, m4a 等）
- 视频文件 → media/video/ 目录（mp4, webm, avi 等）

**示例：**
- 生成语音 → 保存到 media/audio/output.mp3
- 生成图片 → 保存到 media/images/generated.png
- 生成视频 → 保存到 media/video/result.mp4

**注意：** 不要在项目根目录创建多媒体文件，统一放在 media 目录下！

## 媒体文件播放工具 🎧

当用户要求播放音频、视频或查看图片时，使用以下工具：

**get_files**: 获取目录中的文件列表
- 参数：path（目录路径）, filter（可选：audio/video/image）
- 示例：get_files(path="media/audio", filter="audio")

**play_media**: 播放指定的媒体文件
- 参数：file_path（媒体文件的绝对路径）
- 示例：play_media(file_path="media/audio/output.mp3")
- 支持的格式：mp3, wav, ogg, m4a（音频）；mp4, webm, avi（视频）；jpg, png, gif, webp（图片）

**使用流程：**
1. 先用 get_files 查找可用的媒体文件
2. 找到目标文件后用 play_media 播放
3. 文件会直接在聊天界面显示播放器

## 环境信息

- 操作系统：${osName}
- 当前工作目录：${cwd}
- 常用命令：${listCmd} 列目录，${catCmd} 查看文件，${grepCmd} 搜索内容
- 路径可使用绝对路径，或相对当前工作目录
- 技能目录：skills/ 目录下的 .md 文件
- 代码目录：code/{语言}/ 目录（Python/JavaScript/TypeScript 等）
- 技能文件格式：
  \`\`\`markdown
  # 技能名称
  描述
  TRIGGER
  - 触发词
  PROMPT:
  提示词内容
  \`\`\`

## 可用工具

- read_file: 读取文件（绝对路径或相对当前工作目录）
- write_file: 写入文件
- replace: 替换文件内容（需要精确匹配）
- glob: 搜索文件（如 **/*.md）
- grep: 搜索文件内容
- bash: 执行命令
- web_search/web_fetch: 网络操作

## 执行原则

1. **一次性原则**：每个操作只执行一次
2. **结果导向**：收到工具结果后，直接给出结论或进行下一步
3. **简洁高效**：不要重复说明已经做过什么
4. **失败处理**：操作失败时，告诉用户原因和建议，不要无限重试

记住：你的目标是高效完成任务，而不是反复尝试相同的操作。`;
}

// 工具名称映射到友好显示名
export const toolDisplayNames: Record<string, string> = {
  'read_file': '读取文件',
  'write_file': '写入文件',
  'replace': '替换内容',
  'list_directory': '列出目录',
  'glob': '搜索文件',
  'grep': '搜索内容',
  'bash': '执行命令',
  'web_search': '网络搜索',
  'web_fetch': '获取网页',
  'create_skill': '创建技能',
  'ask_user': '询问用户',
  'todo_write': '更新任务',
  'todo_read': '读取任务',
  'get_files': '获取文件列表',
  'play_media': '播放媒体'
};

// 生成详细的任务描述
export function getDetailedTaskDescription(toolName: string, input: any): string {
  switch (toolName) {
    case 'read_file': {
      const filePath = input?.file_path || '';
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      return `📖 读取 ${truncate(fileName, 25)}`;
    }
    case 'write_file': {
      const filePath = input?.file_path || '';
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      return `✏️ 写入 ${truncate(fileName, 25)}`;
    }
    case 'replace': {
      const filePath = input?.file_path || '';
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      return `📝 替换 ${truncate(fileName, 25)}`;
    }
    case 'list_directory': {
      const dirPath = input?.path || '';
      const dirName = dirPath ? dirPath.split(/[/\\]/).pop() : '当前目录';
      return `📂 列出 ${truncate(dirName, 20)}`;
    }
    case 'glob': {
      const pattern = input?.pattern || '';
      return `🔍 搜索 ${truncate(pattern, 20)}`;
    }
    case 'grep': {
      const pattern = input?.pattern || '';
      return `🔍 查找 "${truncate(pattern, 15)}"`;
    }
    case 'bash': {
      const cmd = input?.command || '';
      return `💻 ${truncate(cmd, 30)}`;
    }
    case 'web_search': {
      const query = input?.query || '';
      return `🌐 搜索 ${truncate(query, 20)}`;
    }
    case 'web_fetch': {
      const url = input?.url || '';
      try {
        const urlObj = new URL(url);
        return `📄 获取 ${urlObj.hostname}`;
      } catch {
        return `📄 获取网页`;
      }
    }
    case 'create_skill': {
      const name = input?.name || '';
      return `✨ 创建技能 ${truncate(name, 15)}`;
    }
    case 'get_files': {
      const filter = input?.filter || '';
      const dirPath = input?.path || '';
      const dirName = dirPath ? dirPath.split(/[/\\]/).pop() : '目录';
      return filter ? `📁 查找 ${filter} 文件` : `📁 列出 ${truncate(dirName, 20)}`;
    }
    case 'play_media': {
      const filePath = input?.file_path || '';
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      return `🎵 播放 ${truncate(fileName, 20)}`;
    }
    default: {
      return toolDisplayNames[toolName] || toolName;
    }
  }
}

// 截断字符串
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 2) + '…';
}
