# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## Build and Development Commands

```bash
# Install dependencies (root backend)
npm install

# Development with hot reload (backend, port 38592)
npm run dev

# Build TypeScript to dist/ (also copies web/public to dist/public)
npm run build

# Start production server
npm start

# Vue frontend (separate dev server)
cd web && npm install && npm run dev

# Build both backend + frontend
npm run build && npm run build:web

# Run both concurrently (kills ports first)
npm run dev:all

# Tauri desktop app (requires Rust + Tauri CLI)
npm run tauri:dev
npm run tauri:build
```

No test framework is configured in this project.

## Architecture Overview

Express + WebSocket backend serving as an AI coding assistant. The server exposes REST APIs and a WebSocket endpoint; the frontend communicates exclusively via WebSocket for chat (streaming) and REST for config/session management.

### Two Frontend Options

1. **`public/`** – Legacy vanilla JS/CSS/HTML frontend, served statically from `dist/public/` by the backend. Built by copying `web/public/` during `npm run build`.
2. **`web/`** – Vue 3 + Vite frontend (pnpm workspace). Used by Tauri as the embedded webview. Run independently via `npm run dev:web`.

### Core Backend Services (`src/services/`)

| File | Role |
|------|------|
| `websocket.ts` | WebSocket handler; routes message types and runs the multi-turn tool-calling loop (max 20 iterations) |
| `toolExecutor.ts` | **TOOLS array definition + `executeTool()`** – the single source of truth for all tool schemas and dispatch logic |
| `tools.ts` | Implementations of file, search, web, todo, notebook, task, plan, worktree utilities |
| `llm.ts` | LLM streaming via Anthropic-compatible API; dispatches by `provider` or `baseUrl` |
| `systemPrompt.ts` | Builds the default system prompt (`buildSystemPrompt()`); platform-aware (Windows vs macOS/Linux) |
| `conversation.ts` | Persistent conversation store with keyword-indexed memory chunks, auto-summarization, and debounced JSON writes |
| `commandExecutor.ts` | Shell command runner with a dangerous-command blocklist requiring user confirmation |
| `skillLoader.ts` | Parses `skills/*.md` files into `{ name, description, triggers, prompt }` |
| `configLoader.ts` | Loads model presets from `setting/settings.json` |
| `workingDir.ts` | Module-level singleton for the current working directory |

### Multi-turn Tool Calling Loop (`websocket.ts:handleChat`)

1. Streams LLM response; accumulates text and tool call events.
2. If tool calls are present, executes each via `executeTool()` and appends results as a user message.
3. Repeats until no tool calls remain or max 20 iterations reached.
4. Auto-generates `todo_updated` progress events for every tool call.

### Tool Architecture

Tools are defined in `toolExecutor.ts` as the exported `TOOLS` array (Anthropic tool schema format). `executeTool(name, input, context)` dispatches to implementations in `tools.ts` or `commandExecutor.ts`.

`ToolContext` carries `{ ws, conversationId, conversationManager, commandExecutor, skillLoader, pendingCommands, pendingQuestions }` — pass this when adding new tools that need WebSocket or session access.

### LLM Provider Selection (`llm.ts`)

- If `config.baseUrl` is set → `anthropicCompatibleChatStream()` (covers Alibaba DashScope and similar)
- Otherwise dispatches by `config.provider`: `'anthropic'` | `'openai'` | `'custom'`
- All streaming uses `content_block_start/delta/stop` SSE events

### Conversation Memory (`conversation.ts`)

- Messages are persisted to `data/conversations.json` with debounced writes
- When a conversation exceeds `SUMMARIZE_THRESHOLD` (50 msgs), older messages are chunked into `MemoryChunk` objects stored in `memory_index.json`
- `buildContextMessages()` does keyword retrieval to inject relevant memory chunks into the LLM context
- Constants controlling memory behavior are at the top of the file (e.g., `CONTEXT_CHAR_BUDGET = 20000`, `WORKING_MEMORY_SIZE = 20`)

### Skill System

Skills in `skills/*.md` follow this format:
```
# Skill Name
Description line

TRIGGER
- keyword
- not when: exclusion keyword

PROMPT:
System prompt content here...
```
When a skill is active, its prompt is prepended to the base system prompt: `skill.prompt + "\n\n" + buildSystemPrompt()`.

## Configuration

**`.env`** (or environment variables):
```
ANTHROPIC_AUTH_TOKEN=...
ANTHROPIC_BASE_URL=https://custom-endpoint  # optional
ANTHROPIC_MODEL=claude-sonnet-4-20250514
PORT=38592
API_TIMEOUT_MS=3000000
```

**`setting/settings.json`** – array of named model presets. The first preset is loaded as default on startup.

## Key Constraints

- File reads are truncated at 15,000 characters; grep results capped at 100 matches
- Dangerous shell commands (rm, del, format, etc.) in `commandExecutor.ts` require WebSocket `confirm_command` round-trip before execution
- The server kills any process occupying `PORT` on startup (`src/index.ts:checkAndFreePort`)
- TypeScript: strict mode, ES2020 target, CommonJS output to `dist/`
