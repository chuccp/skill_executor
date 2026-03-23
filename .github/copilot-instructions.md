# Workspace Instructions for Skill Executor

**Tauri 桌面客户端 + 嵌入式后端** — Agent-optimized guidance for stable client development.

## Quick Reference

| Aspect | Reference |
|--------|-----------|
| **Frontend (Vue)** | [web/](../web/)—Tauri webview + standalone dev server |
| **Embedded Backend** | [src/services/](../src/services/)—WebSocket, LLM streaming, tool calling |
| **Tauri Config** | [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json)—app settings, icons, permissions |
| **Feature Guide** | [README.md](../README.md)—Chinese; installation, quickstart, features overview |

## Build & Development

### Essential Commands

```bash
# ✅ Primary: Tauri desktop app (includes embedded backend + frontend)
npm run tauri:dev      # Development: live reload + debugging
npm run tauri:build    # Production: optimized binary (Windows/macOS/Linux)

# 🔧 Component Testing (if developing isolated components)
npm run dev            # Backend server only (port 38592)
npm run dev:web        # Vue frontend only (port 38593, separate Vite server)
npm run dev:all        # Both backend + frontend (for testing without Tauri wrapper)

# 📦 Build & Deploy
npm install            # Install all dependencies (root + web/)
npm run build          # Compile TypeScript + bundle assets
```

**Key behaviors:**
- Tauri dev mode: auto hot reload, debug console available
- `npm run tauri:dev` bundles backend + frontend automatically
- Embedded backend auto-kills port 38592 on startup (no port conflicts)
- Production builds: self-contained executable (no Node.js required on user machine)

## Architecture Overview

### Core Services (`src/services/`)

| File | Purpose | Stability Critical |
|---|---|---|
| `websocket.ts` | WebSocket message handler; **multi-turn tool-calling loop** (repeats up to 20 iterations: stream response → execute tools → append results → loop) | 🔴 YES |
| `toolExecutor.ts` | **TOOLS array definition + executeTool() dispatch**—single source of truth for all custom tools | 🔴 YES |
| `tools.ts` | Tool implementations (file ops, glob, grep, web fetch, notebooks, git, shell, tasks, plans) | 🟡 MEDIUM |
| `llm.ts` | LLM streaming (Anthropic/OpenAI/custom with `baseUrl`); dispatches by `provider` or `baseUrl` | 🔴 YES |
| `conversation.ts` | Persistent session storage; **auto-summarization + keyword-indexed memory** for conversations >50 messages | 🟡 MEDIUM |
| `skillLoader.ts` | Parses `skills/*.md` into `{name, description, triggers, prompt}` | 🟢 LOW |
| `configLoader.ts` | Loads model presets from `setting/settings.json` | 🟢 LOW |
| `commandExecutor.ts` | Shell command runner with dangerous-command blocklist | 🔴 YES |
| `systemPrompt.ts` | Builds default system prompt; platform-aware (Windows vs macOS/Linux) | 🟢 LOW |
| `workingDir.ts` | Module singleton for current working directory | 🟢 LOW |

### Frontend (`web/`)

- **Vue 3 + Vite** — Tauri webview (primary) or standalone dev server
- **Auto-reconnect logic** — WebSocket auto-reconnect with exponential backoff (handles network interruptions)
- **Streaming UI** — SSE event display, token usage tracking, error boundary for app stability

## Project Conventions

### Skills System

Skills are Markdown files in `skills/` (user) or `system/skills/` (built-in). Format:

```markdown
# Skill Name
Description of what this skill does

TRIGGER
- keyword1
- keyword2
- not when: exclusion_keyword

PROMPT:
The system prompt to inject when skill is active...
```

When active, the skill's prompt is prepended: `skill.prompt + "\n\n" + buildSystemPrompt()`.

### Key Constraints

| Constraint | Details |
|---|---|
| **File reads** | Truncated at ~15,000 characters; use grep/search for large files |
| **Grep results** | Capped at 100 matches |
| **Dangerous commands** | `rm`, `del`, `format`, etc. require WebSocket `confirm_command` user interaction |
| **Tool limits** | Max 20 iterations in multi-turn loop |
| **Memory chunks** | Auto-created when conversations exceed 50 messages |

### Naming Patterns

- **Classes:** PascalCase
- **Functions/methods:** camelCase
- **Constants:** UPPER_SNAKE_CASE
- **Tool names:** snake_case

### Configuration

**Environment (.env or shell):**
```bash
ANTHROPIC_AUTH_TOKEN=<api-key>
ANTHROPIC_BASE_URL=<optional-custom-endpoint>  # For DashScope, etc.
ANTHROPIC_MODEL=claude-sonnet-4-20250514
PORT=38592
API_TIMEOUT_MS=3000000
```

**Model Presets (`setting/settings.json`):**
```json
[{
  "name": "display-name",
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "...",
    "ANTHROPIC_BASE_URL": "...",
    "ANTHROPIC_MODEL": "..."
  }
}]
```
The first preset loads as default on startup.

## Common Development Tasks

### Adding a New Tool

1. Define tool schema in `src/services/toolExecutor.ts` (Anthropic format)
2. Implement handler in `src/services/tools.ts` or `src/services/toolExecutor/` subdirectories
3. Export implementation via `executeTool(name, input, context)` dispatch
4. If tool needs WebSocket/session access, use `ToolContext` parameter

### Creating a Skill

1. Create `.md` file in `skills/` with `# Name`, `TRIGGER`, `PROMPT` sections
2. Keywords in `TRIGGER` auto-activate the skill when mentioned in chat
3. Use `not when: keyword` to exclude activation in certain contexts
4. System skills in `system/skills/` are only loaded if constructor sets `loadSystemSkills=true`

### Understanding Tool Execution Flow

See [websocket.ts](../src/services/websocket.ts) `handleChat()`:
1. Stream LLM response; accumulate text + tool calls from SSE events
2. Once `content_block_stop`, extract all tool calls
3. Execute each via `executeTool()`
4. Append results as user message (assistant → tool → user)
5. Immediately repeat loop (max 20 iterations)

### Memory & Conversation Management

- Conversations persist to `data/conversations.json` with debounced writes
- When >50 messages, older messages are chunked into `MemoryChunk` objects in `memory_index.json`
- `buildContextMessages()` does keyword retrieval to inject relevant memory into LLM context
- Memory constants in [src/config/constants.ts](../src/config/constants.ts): `SUMMARIZE_THRESHOLD=100`, `CONTEXT_CHAR_BUDGET=20000`

### Debugging

- WebSocket events logged at each tool call
- Tool results aggregated from SSE `input_json_delta` chunks until `content_block_stop`
- Check `toolExecutor.ts` for tool dispatch and error handling
- File reads verify file exists and length before truncating
- Test with `npm run tauri:dev` and check browser console + desktop window logs

## Tauri Client Development

### Build & Release Workflow

```bash
# Development with hot reload and DevTools
npm run tauri:dev

# Production build (creates standalone executable)
npm run tauri:build

# Builds generated in src-tauri/target/release/
# Windows: *.msi, *.exe
# macOS: *.dmg, *.app
# Linux: *.deb, *.rpm, *.AppImage
```

### Key Tauri Configuration (`src-tauri/tauri.conf.json`)

- **Windows/macOS/Linux icons:** `src-tauri/icons/` (all platforms)
- **Permissions:** Check `capabilities/default.json` for allowed APIs
- **DevTools:** Enabled in dev mode, disabled for production
- **Auto-updater:** Configure release URL for auto-updates
- **App Title & Version:** Synced with `package.json`

### Client Stability Essentials

| Priority | Area | Action |
|----------|------|--------|
| 🔴 YES | WebSocket reconnection | Already implemented with exponential backoff; test network resilience |
| 🔴 YES | Error boundary (Vue) | Essential—wrap `<ChatContainer />` in error boundary to prevent white screen |
| 🔴 YES | Embedded backend crashes | Monitor process lifecycle; ensure restart-on-crash behavior |
| 🟡 IMPORTANT | LLM timeout handling | 50-min timeout configured; graceful degradation on timeout |
| 🟡 IMPORTANT | Local file operations | Ensure proper path handling across Windows/macOS/Linux |
| 🟢 NICE | State persistence | Already done via conversations.json; verify data survives app restart |

## Technology Stack

**Client:**
- Tauri 2.x (Rust + WebView2/WKWebKit)
- Vue 3 + TypeScript (Vite)
- Electron alternative (optional fallback)

**Embedded Backend:**
- Node.js + TypeScript (ES2020, strict mode)
- Express.js (WebSocket endpoints)
- LLM APIs: Anthropic, OpenAI, custom (DashScope-compatible)
- Utilities: `fast-glob`, `axios`, `simple-git`, `ts-morph`, `pino` logging

**Package Manager:** pnpm (workspace structure)

**Platform Support:** Windows, macOS, Linux (auto-updater via Tauri)

**No test framework configured.** Use manual testing or add Jest/Vitest as needed.

## Important Files & Directories

```
skill_executor_web/
├── src/                      # Embedded backend (Node.js)
│   ├── index.ts              # Entry point + WebSocket server
│   ├── services/             # Core logic
│   │   ├── websocket.ts      # 🔴 Multi-turn tool loop (critical)
│   │   ├── llm.ts            # LLM streaming integration
│   │   ├── conversation.ts   # Session persistence
│   │   └── tools.ts          # Tool implementations
│   └── config/constants.ts   # Memory & behavior thresholds
├── web/                      # Vue 3 frontend (Tauri webview)
│   ├── src/
│   │   ├── App.vue           # Root component (⚠️ add error boundary)
│   │   ├── components/       # UI components
│   │   └── services/         # WebSocket client
│   └── vite.config.ts        # Vite build configuration
├── src-tauri/                # Tauri desktop shell (Rust)
│   ├── tauri.conf.json       # App config, permissions, icons
│   ├── src/main.rs           # Rust main window setup
│   ├── capabilities/         # WebSocket/file access permissions
│   └── icons/                # App icons (all platforms)
├── skills/                   # User-defined skills (.md)
├── system/skills/            # Built-in skills
├── setting/settings.json     # Model presets (API keys)
├── data/conversations.json   # Persistent session data (local)
├── AGENTS.md                 # Architecture details
├── CLAUDE.md                 # Claude model guide
├── QWEN.md                   # Qwen/DashScope guide
└── README.md                 # User manual (Chinese)
```

## Development Gotchas

- ✅ **Port killing:** Automatic on startup—no manual intervention needed
- ✅ **No tests:** Project has no test framework; add Jest/Vitest or test manually
- ✅ **File size limits:** Large files require grep/search; don't read as plain text
- ✅ **Tool aggregation:** Wait for `content_block_stop` to collect all tool calls from SSE stream
- ✅ **System skills:** Only loaded if explicitly enabled; user skills in `skills/` always available
- ✅ **Working directory:** Singleton in `workingDir.ts`; track state across tool calls
- ✅ **Dangerous commands:** Check `commandExecutor.ts` blocklist; require confirmation for risky operations
- ✅ **WebSocket lifecycle:** Ensure proper cleanup on app exit; test reconnection logic on network interruption
- ✅ **Desktop build:** Always test with `npm run tauri:dev` before committing; Windows/macOS/Linux may behave differently
- ✅ **Embedded backend:** Monitor Node.js memory usage; set appropriate limits for target machines

## Useful Patterns

### Reading Large Files Safely

```typescript
// ❌ Don't: readFile() truncates at ~15KB
const content = fs.readFileSync('huge-file.js', 'utf-8');

// ✅ Do: Use grep() or search tools for specific content
const results = await grep('searchTerm', { includePattern: 'file.js' });
```

### Tool Context & WebSocket Access

```typescript
// Tool handlers receive ToolContext for WebSocket communication
export async function myTool(input: any, context: ToolContext) {
  const { ws, conversationId, conversationManager } = context;
  // Can send messages, check session state, etc.
}
```

### Skill Activation

```markdown
# MySkill
Helps with X

TRIGGER
- keyword1
- keyword2
- not when: avoid_keyword

PROMPT:
You are specialized in X. When helping with X, ...
```

## Next Steps for Agents

1. **Client Priority:** Focus on Tauri build, frontend stability, and embedded backend reliability
2. **Understand flow:** Review `src/services/websocket.ts` `handleChat()` for multi-turn loop and error handling
3. **Add safety:** Implement proper error boundaries in Vue frontend and error recovery in backend
4. **Test in desktop:** Always validate changes with `npm run tauri:dev` before production builds
5. **Keep it lean:** Minimize dependencies; embedded backend must run efficiently on user machines

---

**Last updated:** 2026-03-23  
**Version:** skill_executor_web (multi-model AI assistant with WebSocket streaming)