# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Install dependencies
npm install

# Development (with hot reload)
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start
```

The server runs on port 3000 by default. On startup, it automatically kills any process occupying that port.

## Architecture Overview

This is a web-based AI assistant similar to Claude Code CLI, built with:

- **Backend**: Express + TypeScript + WebSocket (ws)
- **Frontend**: Vanilla HTML/CSS/JavaScript in `public/`
- **LLM Integration**: Anthropic-compatible API with streaming support

### Core Components

```
src/
├── index.ts              # Entry point, Express + WebSocket server setup
├── types/index.ts        # TypeScript interfaces (Skill, ChatMessage, LLMConfig, etc.)
├── routes/api.ts         # REST API endpoints
└── services/
    ├── websocket.ts      # WebSocket handler with tool calling logic
    ├── llm.ts            # LLM API integration with streaming
    ├── commandExecutor.ts # Shell command execution with safety checks
    ├── skillLoader.ts    # Skill file parsing from skills/ directory
    ├── configLoader.ts   # Model preset loading from setting/settings.json
    ├── conversation.ts   # In-memory conversation management
    └── tools.ts          # Tool implementations (glob, grep, web search, etc.)
```

### Key Architecture Patterns

**Multi-turn Tool Calling**: The `handleChat` function in `websocket.ts` implements an iterative loop (max 20 iterations) where tool results are fed back as user messages, allowing the AI to execute multi-step tasks.

**Streaming Response Parsing**: `llm.ts` handles Anthropic-compatible streaming with `content_block_start`, `content_block_delta`, and `content_block_stop` events. Tool calls aggregate `input_json_delta` chunks until complete.

**Skill System**: Skills are Markdown files in `skills/` with a specific format parsed by `skillLoader.ts`. When a skill is selected, its prompt replaces the default `SYSTEM_PROMPT`.

**Command Safety**: `commandExecutor.ts` checks commands against dangerous patterns (rm -rf, disk operations, etc.) and requires user confirmation via WebSocket.

## Model Configuration

Models are configured in `setting/settings.json`:

```json
[
  {
    "name": "display-name",
    "env": {
      "ANTHROPIC_AUTH_TOKEN": "api-key",
      "ANTHROPIC_BASE_URL": "https://api-endpoint",
      "ANTHROPIC_MODEL": "model-id"
    }
  }
]
```

The system uses Anthropic-compatible API format. Alibaba Cloud DashScope and other providers work if they support this format.

## Skill File Format

Skills are Markdown files in `skills/`:

```markdown
# Skill Name

Description text (first non-empty line after title)

TRIGGER
- keyword1
- keyword2

PROMPT:
System prompt content here...
```

- Only the first `#` heading is used as the skill name
- TRIGGER keywords enable auto-activation (currently informational)
- PROMPT section becomes the system prompt when skill is active

## Tool System

The AI has access to these tools defined in `websocket.ts`:

- **File System**: `read_file`, `write_file`, `replace`, `list_directory`, `glob`, `grep`
- **Shell**: `bash` (with safety checks for dangerous commands)
- **Network**: `web_search`, `web_fetch`
- **Task Management**: `todo_write`, `todo_read`
- **Skills**: `create_skill`
- **User Interaction**: `ask_user`

Tool execution results are sent back as user messages for the AI to continue processing.

## Windows Compatibility

The system runs on Windows. The SYSTEM_PROMPT instructs the AI to use Windows commands (dir, type, findstr) instead of Unix ones. The `commandExecutor.ts` handles GBK encoding for Chinese Windows output using `iconv-lite`.

## WebSocket Protocol

Client sends:
```json
{"type": "chat", "conversationId": "id", "content": "message", "skillName": "optional"}
```

Server sends:
- `text`: Streaming text chunks
- `tool_use`: Tool execution notifications
- `command_confirm`: Dangerous command approval request
- `ask_user`: Question for user
- `done`: Response complete
- `error`: Error message