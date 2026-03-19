# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Install dependencies
npm install

# Development (with hot reload via tsx)
npm run dev

# Build TypeScript to dist/
npm run build

# Start production server (runs from dist/)
npm start

# Tauri desktop app
npm run tauri:dev    # Development
npm run tauri:build  # Production build
```

The server runs on port 3000 by default. On startup, it automatically kills any process occupying that port.

## Architecture Overview

A web-based AI assistant with tool calling capabilities, built with Express + TypeScript + WebSocket.

### Core Services

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point, Express + WebSocket server setup |
| `src/services/websocket.ts` | WebSocket handler with multi-turn tool calling loop (max 20 iterations) |
| `src/services/llm.ts` | LLM API integration with streaming, supports Anthropic-compatible APIs |
| `src/services/commandExecutor.ts` | Shell command execution with safety checks |
| `src/services/tools.ts` | Tool implementations (glob, grep, web search, etc.) |
| `src/services/skillLoader.ts` | Skill file parsing from `skills/` directory |
| `src/services/configLoader.ts` | Model preset loading from `setting/settings.json` |
| `src/services/conversation.ts` | In-memory conversation management |

### Key Architecture Patterns

**Multi-turn Tool Calling** (`websocket.ts`): The `handleChat` function implements an iterative loop where tool results are fed back as user messages. Tool calls are aggregated from `input_json_delta` chunks until `content_block_stop`.

**LLM Streaming** (`llm.ts`): Handles Anthropic-compatible streaming with `content_block_start`, `content_block_delta`, and `content_block_stop` events. Supports custom `baseUrl` for providers like Alibaba Cloud DashScope.

**Skill System**: Markdown files in `skills/` with format:
```
# Skill Name
Description
TRIGGER
- keyword
PROMPT:
System prompt content
```
When a skill is selected, its prompt replaces the default `SYSTEM_PROMPT`.

## Model Configuration

Models are configured in `setting/settings.json`:
```json
[{
  "name": "display-name",
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "api-key",
    "ANTHROPIC_BASE_URL": "https://api-endpoint",
    "ANTHROPIC_MODEL": "model-id"
  }
}]
```

## Built-in Tools

Defined in `websocket.ts` with the `TOOLS` array:
- **File System**: `read_file`, `write_file`, `replace`, `list_directory`, `glob`, `grep`
- **Shell**: `bash` (dangerous commands require user confirmation)
- **Network**: `web_search`, `web_fetch`
- **Task Management**: `todo_write`, `todo_read`
- **Skills**: `create_skill`
- **User Interaction**: `ask_user`

## WebSocket Protocol

Client sends: `{"type": "chat", "conversationId": "id", "content": "message", "skillName": "optional"}`

Server message types: `text`, `tool_use`, `command_confirm`, `ask_user`, `done`, `error`

## Additional Documentation

See `AGENTS.md` for detailed API endpoints, WebSocket protocol, and tool specifications.