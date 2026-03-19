# QWEN.md - Skill Executor Project Context

## Project Overview

**Skill Executor** is a web-based AI programming assistant similar to iFlow/Claude Code. It features a Skill system for custom prompts and supports multiple LLM providers (Anthropic Claude, OpenAI, and custom APIs like Alibaba Cloud Bailian).

### Core Features
- Web-based UI with real-time streaming responses
- Multi-LLM support: Anthropic Claude / OpenAI / Custom APIs
- **Skill System**: Define custom prompts and auto-trigger conditions via Markdown files
- Session management with compression, cleanup, and multi-session support
- WebSocket real-time bidirectional communication
- Rich built-in tools: file operations, command execution, web search, task management
- Function Calling / Tool Use support

### Tech Stack
- **Backend**: Node.js + Express + TypeScript + WebSocket
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Desktop**: Tauri (recommended) and Electron support
- **Cross-platform**: Windows / macOS / Linux
- **Dev Tooling**: tsx (hot reload)

## Building and Running

```bash
# Install dependencies
npm install

# Development mode (hot reload)
npm run dev

# Build production version
npm run build

# Run production server
npm start
# or
npm run dev:server
```

**Default Port**: 3000  
**Access URL**: http://localhost:3000

### Desktop Application (Tauri)

```bash
# Development mode
npm run tauri:dev

# Build production desktop app
npm run tauri:build
```

## Directory Structure

```
skill_executor_web/
├── src/
│   ├── index.ts              # Entry point, server startup
│   ├── types/index.ts        # TypeScript type definitions
│   ├── routes/api.ts         # REST API routes
│   ├── electron/             # Electron desktop app
│   │   ├── main.ts           # Electron main process
│   │   └── preload.ts        # Electron preload script
│   └── services/
│       ├── llm.ts            # LLM service (Anthropic/OpenAI/Custom)
│       ├── skillLoader.ts    # Skill loading and parsing
│       ├── websocket.ts      # WebSocket communication & tool calls
│       ├── streamChat.ts     # SSE streaming chat handling
│       ├── tools.ts          # Built-in tool implementations
│       ├── commandExecutor.ts # Shell command execution
│       ├── configLoader.ts   # Preset configuration loading
│       ├── conversation.ts   # Session/conversation management
│       └── workingDir.ts     # Working directory management
├── skills/                   # Skill definition files (.md)
├── setting/
│   └── settings.json         # Model preset configurations
├── public/                   # Frontend static files
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── data/
│   └── conversations.json    # Session data storage
├── dist/                     # Compiled output directory
└── src-tauri/                # Tauri desktop app
    ├── src/                  # Rust source code
    ├── icons/                # App icons
    ├── tauri.conf.json       # Tauri configuration
    └── Cargo.toml            # Rust dependencies
```

## API Endpoints

### Conversation Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/conversations` | Create new conversation |
| GET | `/api/conversations` | Get all conversations (full data) |
| GET | `/api/conversations/meta` | Get conversation metadata list |
| GET | `/api/conversations/:id` | Get single conversation |
| DELETE | `/api/conversations/:id` | Delete conversation |
| DELETE | `/api/conversations/:id/messages` | Clear messages (keep conversation) |
| POST | `/api/conversations/:id/compress` | Compress conversation |
| GET | `/api/conversations/stats` | Get conversation statistics |
| POST | `/api/conversations/cleanup` | Cleanup old conversations |

### Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/conversations/:id/messages` | Send message (non-streaming) |

### Skills
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/skills` | Get all skills |
| POST | `/api/skills/reload` | Reload skills |
| POST | `/api/skills/check-trigger` | Check triggered skills |

### Configuration
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/llm/config` | Get LLM configuration |
| POST | `/api/llm/config` | Update LLM configuration |
| GET | `/api/presets` | Get preset list |
| POST | `/api/presets/:name/use` | Use specified preset |

## WebSocket Protocol

### Client Message Types

**Chat Message:**
```json
{
  "type": "chat",
  "conversationId": "conversation-id",
  "content": "User message",
  "skillName": "optional skill name"
}
```

**Command Confirmation:**
```json
{
  "type": "confirm_command",
  "confirmId": "confirmation-id",
  "approved": true/false
}
```

**Answer Response:**
```json
{
  "type": "ask_response",
  "askId": "question-id",
  "answer": "User answer"
}
```

### Server Message Types

| Type | Description |
|------|-------------|
| `text` | Streaming text chunk |
| `user_message` | User message acknowledgment |
| `done` | Response complete |
| `error` | Error message |
| `tool_use` | Tool call event |
| `tool_result` | Tool execution result |
| `command_confirm` | Dangerous command confirmation request |
| `command_start` / `command_result` / `command_cancelled` | Command lifecycle |
| `file_read` / `file_written` / `file_replaced` | File operations |
| `glob_result` / `grep_result` / `directory_list` | Search results |
| `search_start` / `search_result` | Web search |
| `fetch_start` / `fetch_result` | Web fetch |
| `todo_updated` / `todo_read` / `todo` | Task list updates |
| `ask_user` | Ask user question |
| `skill_created` | Skill created |

## Skill System

Skills are Markdown files in the `skills/` directory:

```markdown
# Skill Name

Skill description.

TRIGGER
- trigger keyword 1
- trigger keyword 2
- not when: exclusion condition

PROMPT:
Your system prompt content...
```

**Fields:**
- Title (`# Name`): Skill name
- Description: First non-empty line after title
- TRIGGER: Trigger conditions
  - Regular lines: Match keywords in user messages or code
  - `not when:`: Exclusion conditions
- PROMPT:: System prompt content

## Built-in Tools

### File System Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `read_file` | Read file content (text, images, PDF, DOCX, Excel) | `file_path`, `offset?`, `limit?` |
| `write_file` | Create/overwrite file | `file_path`, `content` |
| `replace` | Exact string replacement (must be unique) | `file_path`, `old_string`, `new_string` |
| `list_directory` | List directory contents | `path` |
| `glob` | File pattern search (**, *, ?) | `pattern`, `path?` |
| `grep` | Content regex search | `pattern`, `path?`, `include?` |

### Shell Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `bash` | Execute shell command | `command`, `description?` |

### Network Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `web_search` | Web search (DuckDuckGo) | `query` |
| `web_fetch` | Fetch web content | `url`, `prompt?` |

### Task Management Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `todo_write` | Write task list | `todos[]` |
| `todo_read` | Read task list | - |

### Other Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `create_skill` | Create skill file | `name`, `description`, `prompt`, `triggers?` |
| `ask_user` | Ask user | `question`, `header?`, `options?` |

**Security:** Dangerous commands (delete, format, etc.) require user confirmation before execution.

## Configuration

### Environment Variables (.env)
```env
ANTHROPIC_API_KEY=your_api_key
ANTHROPIC_MODEL=claude-sonnet-4-20250514
PORT=3000
```

### Preset Configuration (setting/settings.json)
```json
[
  {
    "name": "Preset Name",
    "env": {
      "ANTHROPIC_AUTH_TOKEN": "token",
      "ANTHROPIC_BASE_URL": "custom-api-url",
      "ANTHROPIC_MODEL": "model-name",
      "API_TIMEOUT_MS": "3000000"
    }
  }
]
```

## LLM Service Architecture

Supports multiple API formats:

1. **Anthropic Native API**: Direct Claude API calls
2. **OpenAI Compatible API**: OpenAI-format API support
3. **Custom API**: Via `baseUrl` config (e.g., Alibaba Cloud Bailian with Anthropic-compatible format)

**Streaming Support:**
- SSE (Server-Sent Events) format
- Function Calling / Tool Use support
- Auto-handles content_block_start/delta/stop events

## Development Conventions

- TypeScript 5.5.3 strict mode
- ES2020 target
- CommonJS modules
- Output to `dist/` directory
- Auto-generate type declarations (`declaration: true`)
- tsx for development hot reload

## Important Notes

- **Cross-platform command differences:**
  - Windows: `dir`, `type`, `findstr`
  - macOS/Linux: `ls`, `cat`, `grep`
- Server auto-releases occupied ports on startup
- Max tool call rounds: 20
- File reading auto-truncates content > 15000 chars
- Search results limited to 100 matches
- Auto progress tracking on tool calls (`todo_updated`)
