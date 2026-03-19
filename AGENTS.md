# skill_executor 项目上下文

## 项目概述

这是一个类似 iFlow/Claude Code 的网页版 AI 编程助手，支持 Skill 系统和多种大模型接入。

**核心功能：**
- 网页界面操作，实时流式响应
- 支持 Anthropic Claude / OpenAI / 自定义 API（如阿里云百炼）
- Skill 系统：通过 Markdown 文件定义自定义提示词和自动触发条件
- 会话管理，支持多会话、压缩、清理等操作
- WebSocket 实时双向通信
- 丰富的内置工具：文件操作、命令执行、网络搜索、任务管理等
- 工具调用（Function Calling）支持

**技术栈：**
- 后端：Node.js + Express + TypeScript + WebSocket
- 前端：原生 HTML/CSS/JavaScript
- 运行环境：Windows (使用 Windows 命令：dir, type, findstr)
- 开发工具：tsx (热重载)

## 构建与运行

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 构建生产版本
npm run build

# 生产模式运行
npm start
```

默认端口：3000  
访问地址：http://localhost:3000

## 目录结构

```
skill_executor/
├── src/
│   ├── index.ts              # 入口文件，服务启动
│   ├── types/index.ts        # TypeScript 类型定义
│   ├── routes/api.ts         # REST API 路由
│   ├── services/
│   │   ├── llm.ts            # LLM 服务（Anthropic/OpenAI/自定义）
│   │   ├── skillLoader.ts    # Skill 加载与解析
│   │   ├── websocket.ts      # WebSocket 通信与工具调用
│   │   ├── tools.ts          # 内置工具实现（glob/grep/web等）
│   │   ├── commandExecutor.ts # Shell 命令执行
│   │   ├── configLoader.ts   # 预设配置加载
│   │   └── conversation.ts   # 会话管理
│   └── utils/                # 工具函数（预留）
├── skills/                   # Skill 定义文件（.md）
│   ├── example.md            # 示例 Skill
│   ├── translate.md          # 翻译 Skill
│   ├── 代码格式化.md          # 代码格式化 Skill
│   ├── 文字转语音.md          # 文字转语音 Skill
│   └── text-to-speech.md     # 英文版文字转语音
├── setting/settings.json     # 模型预设配置
├── public/                   # 前端静态文件
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── data/                     # 数据存储
│   └── conversations.json    # 会话数据
└── dist/                     # 编译输出目录
```

## API 接口

### 会话管理
- `POST /api/conversations` - 创建新会话
- `GET /api/conversations` - 获取所有会话（完整数据）
- `GET /api/conversations/meta` - 获取会话元数据列表（用于列表显示）
- `GET /api/conversations/:id` - 获取单个会话
- `DELETE /api/conversations/:id` - 删除会话
- `DELETE /api/conversations/:id/messages` - 清空会话消息（保留会话）
- `POST /api/conversations/:id/compress` - 压缩会话
- `GET /api/conversations/stats` - 获取会话统计
- `POST /api/conversations/cleanup` - 清理旧会话（可指定保留数量）

### 消息
- `POST /api/conversations/:id/messages` - 发送消息（非流式）

### Skills
- `GET /api/skills` - 获取所有 Skills
- `POST /api/skills/reload` - 重新加载 Skills
- `POST /api/skills/check-trigger` - 检查触发的 Skills

### 配置
- `GET /api/llm/config` - 获取 LLM 配置
- `POST /api/llm/config` - 更新 LLM 配置
- `GET /api/presets` - 获取预设配置列表
- `POST /api/presets/:name/use` - 使用指定预设

## WebSocket 协议

### 发送消息类型

**聊天消息：**
```json
{
  "type": "chat",
  "conversationId": "会话ID",
  "content": "用户消息",
  "skillName": "可选，指定技能名称"
}
```

**命令确认：**
```json
{
  "type": "confirm_command",
  "confirmId": "确认ID",
  "approved": true/false
}
```

**回答问题：**
```json
{
  "type": "ask_response",
  "askId": "问题ID",
  "answer": "用户回答"
}
```

### 接收消息类型

**流式响应：**
- `text` - 流式文本片段
- `user_message` - 用户消息确认
- `done` - 响应完成
- `error` - 错误信息

**工具调用：**
- `tool_use` - 工具调用事件（包含 toolName, toolId, toolInput）

**命令相关：**
- `command_confirm` - 危险命令确认请求
- `command_start` - 命令开始执行
- `command_result` - 命令执行结果
- `command_cancelled` - 命令已取消

**文件操作：**
- `file_read` - 文件已读取
- `file_written` - 文件已写入
- `file_replaced` - 文件内容已替换

**搜索相关：**
- `glob_result` - 文件搜索结果
- `grep_result` - 内容搜索结果
- `directory_list` - 目录列表

**网络相关：**
- `search_start` / `search_result` - 网络搜索
- `fetch_start` / `fetch_result` - 网页获取

**任务管理：**
- `todo_updated` / `todo_read` - 任务列表更新（支持自动进度追踪）

**其他：**
- `ask_user` - 询问用户问题
- `skill_created` - 技能已创建

## Skill 系统

Skill 是存放在 `skills/` 目录下的 Markdown 文件：

```markdown
# Skill 名称

Skill 的描述说明。

TRIGGER
- 触发关键词1
- 触发关键词2
- not when: 排除条件

PROMPT:
你的系统提示词内容...
```

**字段说明：**
- 标题（`# 名称`）：Skill 名称
- 描述：标题后的第一行非空文本
- TRIGGER：触发条件
  - 普通行：匹配用户消息或代码中的关键词
  - `not when:`：排除条件
- PROMPT:：系统提示词

**现有 Skills：**
- `example.md` - 示例 Skill，演示基本结构
- `translate.md` - 翻译功能
- `代码格式化.md` - 代码格式化
- `文字转语音.md` / `text-to-speech.md` - 文字转语音

## 内置工具

系统内置以下工具供 LLM 调用：

### 文件系统工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `read_file` | 读取文件内容（支持文本、图片、PDF、DOCX、Excel） | `file_path`, `offset?`, `limit?` |
| `write_file` | 创建/覆盖文件 | `file_path`, `content` |
| `replace` | 精确替换文件内容（需唯一匹配） | `file_path`, `old_string`, `new_string` |
| `list_directory` | 列出目录内容 | `path` |
| `glob` | 文件模式搜索（支持 **, *, ?） | `pattern`, `path?` |
| `grep` | 内容正则搜索 | `pattern`, `path?`, `include?` |

### Shell 工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `bash` | 执行 shell 命令 | `command`, `description?` |

### 网络工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `web_search` | 网络搜索（DuckDuckGo） | `query` |
| `web_fetch` | 获取网页内容 | `url`, `prompt?` |

### 任务管理工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `todo_write` | 写入任务列表 | `todos[]` |
| `todo_read` | 读取任务列表 | - |

### 其他工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `create_skill` | 创建技能文件 | `name`, `description`, `prompt`, `triggers?` |
| `ask_user` | 询问用户 | `question`, `header?`, `options?` |

**命令执行安全：** 危险命令（如删除、格式化等）需要用户确认后才执行。

## 配置文件

### 环境变量 (.env)
```
ANTHROPIC_API_KEY=your_api_key
ANTHROPIC_MODEL=claude-sonnet-4-20250514
PORT=3000
```

### 预设配置 (setting/settings.json)
```json
[
  {
    "name": "预设名称",
    "env": {
      "ANTHROPIC_AUTH_TOKEN": "token",
      "ANTHROPIC_BASE_URL": "自定义API地址",
      "ANTHROPIC_MODEL": "模型名称",
      "API_TIMEOUT_MS": "3000000"
    }
  }
]
```

## LLM 服务架构

支持多种 API 格式：

1. **Anthropic 原生 API**：直接调用 Anthropic Claude API
2. **OpenAI 兼容 API**：支持 OpenAI 格式的 API
3. **自定义 API**：通过 `baseUrl` 配置，支持阿里云百炼等兼容 Anthropic 格式的 API

**流式响应支持：**
- SSE (Server-Sent Events) 格式
- 支持工具调用（Function Calling）
- 自动处理 content_block_start/delta/stop 事件

## 开发约定

- TypeScript 5.5.3 严格模式
- ES2020 目标
- CommonJS 模块
- 编译输出到 `dist/` 目录
- 自动生成类型声明文件 (`declaration: true`)
- 使用 tsx 进行开发模式热重载

## 注意事项

- 运行在 Windows 环境，使用 Windows 命令（dir 代替 ls，type 代替 cat）
- 服务启动时会自动释放被占用的端口
- WebSocket 流式响应支持工具调用（Function Calling）
- 最大工具调用轮次：20 次
- 文件读取自动截断超过 15000 字符的内容
- 搜索结果限制最多 100 个匹配
- 工具调用时自动进行进度追踪（todo_updated）
