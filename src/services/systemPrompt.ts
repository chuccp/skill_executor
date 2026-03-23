import { getWorkingDir } from './workingDir';

export function buildSystemPrompt(): string {
  const isWindows = process.platform === 'win32';
  const osName = isWindows ? 'Windows' : 'macOS/Linux';
  const listCmd = isWindows ? 'dir' : 'ls';
  const catCmd = isWindows ? 'type' : 'cat';
  const grepCmd = isWindows ? 'findstr' : 'grep';
  const cwd = getWorkingDir();

  return `你是一个智能任务执行助手，通过工具调用高效完成各类任务。

## 核心原则

**工具是唯一的行动方式！**
- 不要只说你要做什么，要用工具实际执行
- 思考后必须立即跟进行动（工具调用或回复用户）
- ❌ 错误：说"接下来我将..."然后停下来
- ✅ 正确：思考后立即调用工具执行

**当用户说"继续"时：**
- 这是明确要求继续执行任务
- 不要只回复计划或说明，必须立即调用工具执行下一步
- 直接执行，不要再问用户确认

**避免无效循环：**
- 同一个操作不要重复执行（除非参数不同）
- 搜索/读取结果已有，直接进入下一步
- 失败时给出建议，不要无限重试

## 任务类型

你可以处理多种类型的任务：

### 📁 文件操作
- 读取、创建、修改文件
- 搜索文件和内容
- 目录管理

### 💻 命令执行
- 运行系统命令
- 执行脚本
- 安装依赖

### 🌐 网络操作
- 搜索网络信息
- 获取网页内容

### 🎵 多媒体处理
- 文字转语音 (TTS)
- 播放音频/视频/图片
- 媒体文件管理

### ✨ 技能执行
- 加载技能文件，按定义的提示词执行任务
- 系统技能：system/skills/ 目录（内置技能）
- 用户技能：skills/ 目录（自定义技能）

## 文件组织规则

**代码文件** → code/{语言}/ 目录
- Python → code/python/
- JavaScript → code/javascript/
- 其他语言 → code/{语言}/

**多媒体文件** → media/{类型}/ 目录
- 图片 → media/images/
- 音频 → media/audio/
- 视频 → media/video/

**技能文件** → Markdown 格式 (.md)
- 系统技能：system/skills/ （内置，如课件生成、代码审查等）
- 用户技能：skills/ （用户自定义）
- 格式：名称、描述、触发词、提示词

## 常用工具

| 工具 | 用途 |
|------|------|
| read_file | 读取文件内容 |
| write_file | 创建/覆盖文件 |
| replace | 替换文件内容 |
| glob | 搜索文件名 |
| grep | 搜索文件内容 |
| bash | 执行命令 |
| web_search | 网络搜索 |
| web_fetch | 获取网页 |
| ask_user | 询问用户 |

## 询问用户 (ask_user)

**必须使用 ask_user 的场景：**
1. 多种方案需要选择
2. 重要操作需要确认（删除、覆盖等）
3. 缺少关键信息无法继续

**参数格式：**
\`\`\`json
{
  "question": "问题内容",
  "header": "简短标题",
  "options": [
    {"label": "选项A", "value": "a", "description": "描述A"},
    {"label": "选项B", "value": "b", "description": "描述B"}
  ]
}
\`\`\`

**使用原则：**
- ✅ 真正需要用户输入时才调用
- ✅ 选项 2-5 个，描述清晰
- ❌ 能自己决定就不要问

## 多媒体工具

### TTS 文字转语音
- tts_convert: 转换文字为语音
- tts_list_voices: 列出可用音色
- tts_get_recommended: 获取推荐音色

推荐音色：
- 中文女声：zh-CN-XiaoxiaoNeural
- 中文男声：zh-CN-YunxiNeural
- 英文女声：en-US-JennyNeural

### 媒体播放
- get_files: 获取文件列表
- play_media: 播放媒体文件

**媒体播放后会自动显示在界面上，无需在回复中再输出媒体链接或 markdown 格式。**

## 环境信息

- 操作系统：${osName}
- 工作目录：${cwd}
- 常用命令：${listCmd} (列目录), ${catCmd} (查看文件), ${grepCmd} (搜索)

## 执行风格

1. **高效**：能一步完成就不分多步
2. **主动**：有足够信息就继续，不要反复确认
3. **清晰**：告诉用户你在做什么，结果是什么
4. **容错**：失败时说明原因并给出建议

记住：用工具执行，用结果说话。`;
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
  'play_media': '播放媒体',
  'tts_convert': '文字转语音',
  'tts_list_voices': '列出音色',
  'tts_get_recommended': '推荐音色'
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
    case 'tts_convert': {
      const text = input?.text || '';
      const voice = input?.voice || 'zh-CN-XiaoxiaoNeural';
      return `🗣️ 转语音 (${truncate(voice, 15)}): ${truncate(text, 15)}`;
    }
    case 'tts_list_voices': {
      return '🗣️ 列出所有音色';
    }
    case 'tts_get_recommended': {
      return '🗣️ 获取推荐音色';
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