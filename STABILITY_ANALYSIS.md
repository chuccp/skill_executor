# Multi-Turn Tool Calling Loop: Stability Analysis

**Analysis Date:** 2026-03-23  
**Scope:** `src/services/websocket/handlers.ts::handleChat()` and integrated services

---

## Executive Summary

The multi-turn tool-calling loop is **architecturally sound** but has **significant stability gaps** that could cause:
- Silent failures in tool execution with partial state corruption
- Resource leaks (file handles, process children) on error
- Race conditions when tools modify shared state (working directory)
- Infinite loops or stuck conversations with no detection mechanism
- Database contention from rapid writes during parallel execution

**Priority Issues:** 🔴 **4 Critical**, 🟡 **6 High**, 🟢 **5 Medium**

---

## 1. Current Implementation Analysis

### 1.1 handleChat() Flow

**File:** [src/services/websocket/handlers.ts](src/services/websocket/handlers.ts#L23)

```
┌─ Stream LLM response
│  ├─ Accumulate text + tool calls from SSE
│  └─ Parse content_block_delta until content_block_stop
│
├─ If no tool calls → Save message, break loop
│
└─ FOR iteration 1..20:
   ├─ Group tools by dependencies (groupToolsForParallelExecution)
   ├─ FOR each group (serial):
   │  ├─ Add progress tasks
   │  ├─ Execute group in parallel (Promise.all)
   │  ├─ Process results
   │  └─ Append as user message
   └─ Loop to next LLM call
```

**Max Iterations:** 20 (hardcoded, no configuration)  
**Loop Control:** Checked at [line 130](src/services/websocket/handlers.ts#L130) and during streaming  
**Tool Execution:** Parallel within groups at [line 240](src/services/websocket/handlers.ts#L240)

### 1.2 SSE Tool Call Aggregation

**File:** [src/services/llm.ts](src/services/llm.ts#L160-L250)

| Event | Handling | Risk |
|-------|----------|------|
| `content_block_start` (tool_use) | Initialize `currentToolCall` with name, id | ✅ Safe |
| `content_block_delta` (input_json_delta) | Accumulate `partial_json` | ⚠️ See issue [#1.2a](#121a---sseparser-robustness) |
| `content_block_stop` | Parse accumulated JSON, yield tool event | ⚠️ Silent failure if JSON invalid |
| Unknown events | Silently ignored (`catch {}` at line 238) | 🔴 **CRITICAL** |

#### 1.2a - SSE Parser Robustness

**Issue:** JSON parsing errors at [line 235](src/services/llm.ts#L235) are caught silently.

```typescript
try {
  const input = JSON.parse(currentToolCall.inputJson);
  // ...
} catch (e) {
  console.error('[LLM Stream] 工具输入解析失败:', currentToolCall.inputJson);
  // ⚠️ MISSING: Yield error event to client, signal loop to skip
}
```

**Impact:** 
- Malformed tool input is logged but not reported to LLM (loop continues)
- Client never learns about parsing failure
- Next iteration uses stale tool call from previous iteration

**Reproduction:**
```javascript
// If LLM returns malformed input_json_delta chunks
"input_json_delta": "{ incomplete json without closing brace"
```

### 1.3 Tool Result Appending

**File:** [src/services/websocket/handlers.ts](src/services/websocket/handlers.ts#L253-L280)

Results are appended as **user messages** created by `conversationManager.addMessage()`:

```typescript
await conversationManager.addMessage(
  actualConversationId, 
  'user', 
  `[工具结果] ${result}`
);
```

**Issues:**
- ✅ Results are persisted
- ⚠️ Message truncated at 8000 chars ([MAX_MESSAGE_LENGTH](src/config/constants.ts#L6))
- 🔴 **NO VERIFICATION** that message was written (no error handling on DB write)
- 🔴 If write fails, loop continues with stale context

---

## 2. Error Handling Assessment

### 2.1 Tool Execution Error Handling

**File:** [src/services/toolExecutor.ts](src/services/toolExecutor.ts#L73-L150)

```typescript
export async function executeTool(
  tool: { name: string; input?: any },
  ctx: ToolContext
): Promise<string> {
  try {
    // Try each handler
    let result = await handleFilesystemTool(tool, ctx);
    if (result !== null) return result;
    
    // ... more handlers ...
    
    return `未知工具: ${tool.name}`;
  } catch (error: any) {
    const errMsg = `工具执行错误 (${tool.name}): ${error.message || error}`;
    console.error('[ToolExecutor] Error:', errMsg);
    if (ws) {
      ws.send(JSON.stringify({ type: 'error', content: errMsg }));
    }
    return errMsg;  // ⚠️ Returns error as result string
  }
}
```

**Issues:**
- ✅ Generic catch-all exists
- ⚠️ **Error is returned as a string**, not re-thrown
- 🔴 **In Promise.all() groups, individual errors don't fail the group** (line 240)
- 🔴 **No cleanup of partial state** if tool crashes mid-execution

**Example:** If a file write fails halfway:

```typescript
// Tool crashes after partial write
// Promise.all() still resolves because executeTool() catches it
const results = await Promise.all(group.map(executeToolWithCtx));
// results = [{ toolId: "X", result: "错误: 写入失败" }, ...]
// Loop continues, LLM thinks tool succeeded
```

### 2.2 Timeout Error Handling

**Command timeout:** [src/services/commandExecutor.ts](src/services/commandExecutor.ts#L55-L60)

```typescript
const timer = setTimeout(() => {
  timedOut = true;
  child.kill();
  stderr += '\n命令执行超时';  // ✅ Timeout is captured
}, timeout);
```

**Issues:**
- ✅ Commands have 60-second timeout
- ⚠️ **No per-tool timeout** (only bash commands are timed)
- 🔴 File I/O operations can hang indefinitely (read_file, write_file, glob, grep)
- 🔴 LLM streaming has **no timeout** (can hang forever on network failure)

**LLM streaming timeout:** Missing entirely in [llm.ts](src/services/llm.ts#L70-L120)

```typescript
async *anthropicChatStream(messages: any[], tools?: any[]): AsyncGenerator<StreamEvent> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    // ⚠️ NO AbortController, NO timeout configuration
  });
  
  while (true) {
    const { done, value } = await reader.read();  // ⚠️ Can block indefinitely
    if (done) break;
    // ...
  }
}
```

**Impact:** If network stalls, entire conversation hangs (frontend must timeout + reconnect).

### 2.3 Database Errors During Tool Loop

**Conversation message writes:** [src/services/conversation.ts](src/services/conversation.ts#L174-L210)

```typescript
async addMessage(conversationId: string, role: ChatMessage['role'], content: string) {
  const conv = await this.db!.get('SELECT id FROM conversations WHERE id = ?', [conversationId]);
  if (!conv) return null;  // ⚠️ Returns null, not thrown
  
  await this.db!.execute(
    'INSERT INTO messages (...) VALUES (...)',
    // ⚠️ If this fails, exception propagates but is caught in handleChat() catch-all
  );
}
```

**Issues:**
- 🔴 If `addMessage()` throws (DB locked, disk full), the exception is caught in [line 328](src/services/websocket/handlers.ts#L328) generic `catch (error)`
- 🔴 Loop state is inconsistent (tool result not persisted, but loop continues)
- 🔴 No partial rollback mechanism

**In the multi-tool group execution:**

```typescript
const results = await Promise.all(group.map(executeToolWithCtx));

for (const { toolId, result } of results) {
  // ...
  await conversationManager.addMessage(actualConversationId, 'user', `[工具结果] ${result}`);
  // ⚠️ If this throws on 3rd of 5 results, first 2 are persisted, last 2 are not
}
```

---

## 3. Edge Cases & Resource Leaks

### 3.1 Working Directory State Management

**Singleton:** [src/services/workingDir.ts](src/services/workingDir.ts)

```typescript
let workingDir = process.cwd();

export function getWorkingDir(): string {
  return workingDir;
}

export function setWorkingDir(dir: string): void {
  workingDir = dir;  // ⚠️ Global state
}
```

**Problem:** If parallel tools both call `setWorkingDir()`:

```
Tool A: setWorkingDir('/home/user/projectA')
  ├─ Starts async operation expecting /home/user/projectA
  └─ Waits for I/O
  
  [Meanwhile] Tool B: setWorkingDir('/home/user/projectB')
  ├─ Changes global state
  └─ Tool A's operation now uses /home/user/projectB
```

**Risk:** 🔴 **CRITICAL** if any tool calls `setWorkingDir()` during parallel execution.

**Current state:** No tools appear to call `setWorkingDir()` directly, but **this is not enforced**.

### 3.2 File Handle Leaks

**Risk Points:**

| Tool | Issue | Line |
|------|-------|------|
| `read_file` | File closed by sync `readFileSync()` ✅ | [L30](src/services/toolExecutor/filesystem.ts#L30) |
| `write_file` | File closed by sync `writeFileSync()` ✅ | [L64](src/services/toolExecutor/filesystem.ts#L64) |
| `glob` (fast-glob) | May not clean up on exception | [tools/glob.ts](src/services/tools/glob.ts) |
| `grep` | May not clean up on exception | [tools/grep.ts](src/services/tools/grep.ts) |
| `notebook` editing | JSON file operations, potential handle leak on error | [tools/notebook.ts](src/services/tools/notebook.ts) |

**Example:** If `glob()` throws after opening file handles:

```typescript
// In parallel group
Promise.all([
  glob('**/*.js'),  // ⚠️ May leak handles if it crashes
  glob('**/*.ts'),  // ⚠️ May leak handles
  glob('**/*.py')   // ⚠️ May leak handles
])
// If any process crashes, file descriptors accumulate
```

### 3.3 Process/Child Process Leaks

**bash tool:** [src/services/commandExecutor.ts](src/services/commandExecutor.ts#L45-L80)

```typescript
const child = spawn(command, [], { ... });

const timer = setTimeout(() => {
  timedOut = true;
  child.kill();  // ✅ Kills process
  stderr += '\n命令执行超时';
}, timeout);

child.on('close', (code) => {
  clearTimeout(timer);  // ✅ Cleanup
  resolve({ success, stdout, stderr });
});
```

**Issue:** If command spawns child processes, `child.kill()` may not terminate them:

```bash
# Command: npm install
# spawn() kills npm, but npm's child processes (node_modules download) may remain orphaned
```

**Risk:** 🟡 Long-running parallel commands can accumulate zombie processes.

### 3.4 Memory Accumulation in Tool Results

**In the loop:** [line 240](src/services/websocket/handlers.ts#L240)

```typescript
for (const [groupIndex, group] of toolGroups.entries()) {
  // For each tool, create detailed task description
  for (const tool of group) {
    const detailedTask = getDetailedTaskDescription(tool.name, tool.input);
    // ⚠️ autoProgress.tasks grows indefinitely
    autoProgress.tasks.push({
      id: currentTaskId,
      task: detailedTask,
      status: 'in_progress'
    });
  }
  
  // Cleanup happens only if tasks > 10
  if (autoProgress.tasks.length > 10) {
    autoProgress.tasks = autoProgress.tasks.filter(t => t.status === 'in_progress');
  }
}
```

**Issue:** 🟡 With 20 iterations × 5 tools/iteration = 100+ tasks before cleanup.

### 3.5 Circular Tool Call Prevention

**Risk:** 🔴 **CRITICAL** - No check for infinite loops.

**Scenario:**
```
Iteration 1: Tool A → Result "Please use tool B"
Iteration 2: LLM → "Use Tool B" → Tool B → Result "Please use Tool A"
Iteration 3: LLM → "Use Tool A" → Tool A ... (infinite loop)
```

**Current defense:** Only the 20-iteration limit (hardcoded, no configuration).

---

## 4. Concurrency Issues

### 4.1 Promise.all() Error Isolation

**Issue:** In [line 240](src/services/websocket/handlers.ts#L240):

```typescript
const results = await Promise.all(group.map(executeToolWithCtx));
```

**Problem:** If one tool throws an uncaught error:
- ✅ `executeTool()` catches it (no exception propagates)
- ⚠️ But **individual tool failures are silently merged** into results

```typescript
// Example: 5 tools, tool #3 fails
results = [
  { toolId: '1', result: 'Success' },
  { toolId: '2', result: 'Success' },
  { toolId: '3', result: '工具执行错误: ...' },  // Treated as normal result
  { toolId: '4', result: 'Success' },
  { toolId: '5', result: 'Success' }
]
```

**Impact:** LLM receives error as a tool result, may retry same tool indefinitely.

### 4.2 Race Conditions in Tool Dependency Analysis

**File:** [src/services/websocket/utils.ts](src/services/websocket/utils.ts#L50-L90)

```typescript
const TOOL_DEPENDENCIES: Record<string, string[]> = {
  'write_file': ['read_file'],
  'replace': ['read_file'],
  'edit': ['read_file'],
  // ⚠️ Incomplete - many tools missing
};

export function groupToolsForParallelExecution(toolCalls: any[]): any[][] {
  // ... dependency checking ...
  for (let i = 0; i < remaining.length; i++) {
    const tool = remaining[i];
    const deps = TOOL_DEPENDENCIES[tool.name] || [];  // ⚠️ Empty array if not declared
    // ...
  }
}
```

**Issues:**
- 🟡 `web_search` + `web_fetch` not marked as dependent (but both do network I/O)
- 🟡 `grep` depends on glob results (not captured)
- 🟡 `bash` can have any dependencies (marked as independent) ❌
- 🟡 Missing tools: `create_skill`, `ask_user`, `todo_write`, all notebook tools, git tools, etc.

**Result:** Tools run in parallel that shouldn't:

```javascript
// These could conflict:
Promise.all([
  bash('cd /home/user/projectA && npm install'),
  bash('cd /home/user/projectB && npm install')
])
// Both use global working directory, may interfere
```

### 4.3 WebSocket Message Ordering

**Issue:** With parallel tool execution + rapid WebSocket sends:

```typescript
// Tool A completes → sends message
// Tool B completes → sends message
// But network reorders them
// Client receives B's message before A's

// Also, context compression can happen mid-group execution:
```

**Race:** At [line 100](src/services/websocket/handlers.ts#L100):

```typescript
// Check context before tools
if (contextPercent > CONTEXT_PERCENT_THRESHOLD) {
  const compressed = await conversationManager.compress(...);
}

// Then group execution at line 240
// Tool results are appended
// But context may have been compressed while tools were executing
```

---

## 5. Monitoring & Debugging Gaps

### 5.1 Logging Deficiencies

| Event | Logged | Details | Actionable |
|-------|--------|---------|-----------|
| Iteration start | ✅ Line 122 | `第 ${iteration} 轮调用...` | ⚠️ Only iteration number |
| Tool grouping | ✅ Line 193 | `工具分组：${toolGroups.length} 组` | ✅ Shows parallelization |
| Tool execution | ✅ Line 198 | Tool name + input | ✅ Useful |
| Tool result | ✅ Line 272 | Just the result | ⚠️ No tool name, duration |
| SSE parse error | ✅ Line 235 | JSON string | ❌ Huge if malformed |
| LLM error | ✅ Line 160 | `流式错误:` | ❌ No error code, context |
| Loop timeout | ❌ MISSING | No log when iteration limit hit | 🔴 **CRITICAL** |
| DB errors | ❌ MISSING | Silent failure at line 280 | 🔴 **CRITICAL** |

### 5.2 Missing Metrics

| Metric | Current | Recommended |
|--------|---------|-------------|
| Iteration count | Manual log | Export to client in `done` message |
| Tool execution time | None | Add per-tool duration tracking |
| LLM tokens used | Sent to client ✅ | Missing context tokens on error |
| Error rate | None | Track failures per conversation |
| Loop stuck detection | None | Warn if iteration N == iteration N-1 (same tools called) |

### 5.3 Client Visibility Issues

**WebSocket doesn't send:**
- ❌ Final iteration count (client can't tell if hit limit)
- ❌ Tool execution times (frustrating UX)
- ❌ Structured error information (just `{ type: 'error', content: string }`)
- ❌ Retry information (client doesn't know if tool will be retried)

---

## 6. Integration Point Issues

### 6.1 Conversation Persistence Under Load

**File:** [src/services/conversation.ts](src/services/conversation.ts#L174-L210)

```typescript
async addMessage(conversationId: string, role, content) {
  await this.db!.execute(`INSERT INTO messages ...`);
  await this.db!.execute(`UPDATE conversations SET ...`);
  await this.db!.execute(`UPDATE conversations SET first_user_message ...`);
  // ⚠️ 3 sequential DB operations
}
```

**In multi-tool loop:** [line 280](src/services/websocket/handlers.ts#L280)

```typescript
// For each tool result in parallel execution
for (const { toolId, result } of results) {
  // These serialize, not parallel
  await conversationManager.addMessage(...);  // 3 DB ops x 5 tools = potential bottleneck
}
```

**Issue:** 🟡 If tools return results at roughly same time:
- 5 tools × 3 DB ops each = 15 queued operations
- Database lock contention (SQLite is particularly vulnerable)
- Later tool results may timeout or hang

### 6.2 WebSocket Backpressure

**Issue:** [line 205-220](src/services/websocket/handlers.ts#L205-L220)

```typescript
ws.send(JSON.stringify({ type: 'text', content: event.content }));
ws.send(JSON.stringify({ type: 'tool_use', ... }));
ws.send(JSON.stringify({ type: 'usage', ... }));
```

**With fast LLM (500+ tokens/sec):**
- 500 tokens → 500 `text` messages sent
- Frontend's message queue can overflow
- Browser becomes unresponsive

**Current mitigation:** None. Frontend must handle queue internally.

### 6.3 Context Compression Race

**Issue:** [line 100](src/services/websocket/handlers.ts#L100)

```typescript
// Before tool loop
if (contextPercent > CONTEXT_PERCENT_THRESHOLD) {
  await conversationManager.compress(...);  // Deletes old messages, creates summary
}

// Then later
for (const [groupIndex, group] of toolGroups.entries()) {
  for (const { toolId, result } of results) {
    await conversationManager.addMessage(...);  // Appends to possibly-compressed conversation
  }
}
```

**Issue:** 🟡 **Race condition** if compression deletes messages that tools are about to reference.

**Example:**
```
Initial: [M1, M2, ..., M100] (100 messages, 85% context used)
Compress: [Summary(M1-M80), M81-M100]
Tool result: append to [Summary, M81-M100, M121]
LLM's next iteration: Can only see last 20 messages + summary
```

---

## 7. Detailed Improvement Opportunities

### Priority Issues Summary

| Priority | Count | Issues |
|----------|-------|--------|
| 🔴 CRITICAL | 4 | SSE parser, DB errors, loop detection, timeout |
| 🟡 HIGH | 6 | Tool error isolation, file handle cleanup, process zombies, race conditions, tool dependencies, monitoring |
| 🟢 MEDIUM | 5 | WebSocket backpressure, memory accumulation, context compression, logging, metrics |

---

### 🔴 CRITICAL: Fix SSE Parser Robustness

**File:** [src/services/llm.ts](src/services/llm.ts#L235)

**Current:**
```typescript
} catch (e) {
  console.error('[LLM Stream] 工具输入解析失败:', currentToolCall.inputJson);
}
```

**Recommended:**
```typescript
} catch (e) {
  console.error('[LLM Stream] 工具输入解析失败:', {
    toolName: currentToolCall.name,
    inputLength: currentToolCall.inputJson.length,
    head: currentToolCall.inputJson.substring(0, 100),
    error: e.message
  });
  // Signal to handler that this tool call failed
  yield {
    type: 'error',
    content: `Tool parsing failed: ${currentToolCall.name} - ${e.message}`
  };
  currentToolCall = null;
}
```

---

### 🔴 CRITICAL: Handle Tool Result Persistence Failures

**File:** [src/services/websocket/handlers.ts](src/services/websocket/handlers.ts#L253-L280)

**Current:**
```typescript
for (const { toolId, result } of results) {
  // ...
  await conversationManager.addMessage(actualConversationId, 'user', `[工具结果] ${result}`);
  // ⚠️ No error handling
}
```

**Recommended:**
```typescript
const failedResults: string[] = [];
for (const { toolId, result } of results) {
  try {
    await conversationManager.addMessage(actualConversationId, 'user', `[工具结果] ${result}`);
  } catch (e) {
    console.error(`[WS] Failed to persist tool result for ${toolId}:`, e);
    failedResults.push(toolId);
    ws.send(JSON.stringify({
      type: 'error',
      content: `Failed to persist result for tool ${toolId}: ${(e as Error).message}`
    }));
  }
}

if (failedResults.length > 0) {
  // Option 1: Skip iteration (safer)
  console.warn(`[WS] Skipping iteration due to persistence failures: ${failedResults.join(',')}`);
  ws.send(JSON.stringify({ type: 'done' }));
  return;
  
  // Option 2: Continue with warning (risking partial state)
  // ws.send(JSON.stringify({
  //   type: 'warning',
  //   content: `Some results were not persisted: ${failedResults.join(',')}`
  // }));
}
```

---

### 🔴 CRITICAL: Add Loop Stall Detection

**File:** [src/services/websocket/handlers.ts](src/services/websocket/handlers.ts#L115-L330)

**Current:**
```typescript
let iteration = 0;

while (iteration < MAX_ITERATIONS) {
  iteration++;
  console.log(`[WS] 第 ${iteration} 轮调用...`);
  // ... tool execution ...
}
```

**Recommended:**
```typescript
interface IterationState {
  iteration: number;
  toolNames: string[];
  toolCount: number;
  timestamp: number;
}

const iterationHistory: IterationState[] = [];
const MAX_ITERATIONS = 20;
const MAX_REPEATED_ITERATIONS = 3;  // Warn if same tools called 3 times

while (iteration < MAX_ITERATIONS) {
  iteration++;
  console.log(`[WS] 第 ${iteration} 轮调用...`);
  
  // ... streaming & tool collection ...
  
  const currentToolNames = toolCalls.map(t => t.name).sort();
  const currentToolCount = toolCalls.length;
  
  iterationHistory.push({
    iteration,
    toolNames: currentToolNames,
    toolCount: currentToolCount,
    timestamp: Date.now()
  });
  
  // Keep only last 5 iterations
  if (iterationHistory.length > 5) {
    iterationHistory.shift();
  }
  
  // Check for stall pattern
  if (iterationHistory.length >= MAX_REPEATED_ITERATIONS) {
    const recent = iterationHistory.slice(-MAX_REPEATED_ITERATIONS);
    const allSame = recent.every(it =>
      JSON.stringify(it.toolNames) === JSON.stringify(currentToolNames)
    );
    
    if (allSame && currentToolCount > 0) {
      console.warn(`[WS] 检测到工具循环: ${currentToolNames.join(', ')} 重复 ${MAX_REPEATED_ITERATIONS} 轮`, {
        iterations: recent.map(it => it.iteration)
      });
      
      ws.send(JSON.stringify({
        type: 'warning',
        content: `Tool loop detected after ${iteration} iterations. Stopping to prevent infinite loop. Tools: ${currentToolNames.join(', ')}`
      }));
      
      await conversationManager.addMessage(
        actualConversationId,
        'assistant',
        `[System Note] Loop detected at iteration ${iteration}. Stopping to prevent infinite recursion.`
      );
      ws.send(JSON.stringify({ type: 'done' }));
      return;
    }
  }
  
  // ... rest of loop ...
}

// After loop ends normally
if (iteration >= MAX_ITERATIONS) {
  console.warn(`[WS] 达到最大迭代次数 ${MAX_ITERATIONS}`, {
    lastToolCount: toolCalls.length,
    conversationId: actualConversationId
  });
  
  ws.send(JSON.stringify({
    type: 'warning',
    content: `Reached maximum iterations (${MAX_ITERATIONS}). Stopping.`
  }));
}
```

---

### 🔴 CRITICAL: Add LLM Streaming Timeout

**File:** [src/services/llm.ts](src/services/llm.ts#L70-L120)

**Current:**
```typescript
private async *anthropicChatStream(
  messages: any[],
  tools?: any[]
): AsyncGenerator<StreamEvent> {
  // ⚠️ No timeout
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    // ...
  });
}
```

**Recommended:**
```typescript
private async *anthropicChatStream(
  messages: any[],
  tools?: any[]
): AsyncGenerator<StreamEvent> {
  const LLM_TIMEOUT_MS = 300000;  // 5 minutes
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { /* ... */ },
      body: JSON.stringify({ /* ... */ }),
      signal: controller.signal  // ✅ Enable cancellation
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', content: 'No response body' };
      return;
    }
    
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      // Add timeout to reader.read()
      const readPromise = reader.read();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Reader timeout')), 30000)
      );
      
      const { done, value } = await Promise.race([readPromise, timeoutPromise]) as any;
      if (done) break;
      
      // ... rest of parsing ...
    }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      yield { type: 'error', content: `LLM request timeout after 5 minutes` };
    } else {
      yield { type: 'error', content: `LLM stream error: ${e.message}` };
    }
  } finally {
    clearTimeout(timeoutHandle);
    controller.abort();
  }
}
```

---

### 🟡 HIGH: Isolate Tool Errors Properly

**File:** [src/services/websocket/handlers.ts](src/services/websocket/handlers.ts#L240-L300)

**Current:**
```typescript
const results = await Promise.all(group.map(executeToolWithCtx));

for (const { toolId, result } of results) {
  // Process as if all succeeded
}
```

**Recommended:**
```typescript
interface ToolResult {
  toolId: string;
  toolName: string;
  success: boolean;
  result: string;
  duration: number;
}

const toolPromises = group.map(async (tool): Promise<ToolResult> => {
  const startTime = Date.now();
  try {
    const ctx: ToolContext = { /* ... */ };
    const result = await executeTool(tool, ctx);
    
    // Check if result is an error message
    const isError = result.startsWith('错误:') || result.startsWith('工具执行错误');
    
    return {
      toolId: tool.id,
      toolName: tool.name,
      success: !isError,
      result,
      duration: Date.now() - startTime
    };
  } catch (e: any) {
    // Shouldn't happen (executeTool catches), but defensive
    return {
      toolId: tool.id,
      toolName: tool.name,
      success: false,
      result: `Unexpected error: ${(e as Error).message}`,
      duration: Date.now() - startTime
    };
  }
});

const results: ToolResult[] = await Promise.all(toolPromises);

// Track failed tools
const failedTools = results.filter(r => !r.success);
const successfulTools = results.filter(r => r.success);

// Log with metrics
for (const result of results) {
  const status = result.success ? 'OK' : 'FAILED';
  console.log(`[WS] Tool ${result.toolName}[${result.toolId}] ${status} (${result.duration}ms)`);
}

// Process results differently based on success
for (const toolResult of results) {
  // Mark task
  const currentTaskId = taskIds.get(toolResult.toolId);
  if (currentTaskId) {
    const task = autoProgress.tasks.find(t => t.id === currentTaskId);
    if (task) {
      task.status = toolResult.success ? 'completed' : 'failed';
      ws.send(JSON.stringify({ type: 'todo_updated', todos: autoProgress.tasks }));
    }
  }
  
  // Send result to client
  ws.send(JSON.stringify({
    type: 'tool_result',
    name: toolResult.toolName,
    result: toolResult.result,
    success: toolResult.success,
    duration: toolResult.duration
  }));
  
  // Only persist successful results
  if (toolResult.success) {
    try {
      await conversationManager.addMessage(
        actualConversationId,
        'user',
        `[工具结果] ${toolResult.result}`
      );
    } catch (e) {
      console.error(`Failed to persist result for ${toolResult.toolName}`);
      failedTools.push(toolResult);
    }
  } else {
    // Don't add failed tool results to conversation? Or mark differently?
    try {
      await conversationManager.addMessage(
        actualConversationId,
        'user',
        `[工具失败] ${toolResult.toolName}: ${toolResult.result}`
      );
    } catch (e) {
      console.error(`Failed to persist error for ${toolResult.toolName}`);
    }
  }
}

// If too many failures, consider stopping
if (failedTools.length > group.length * 0.5) {  // >50% failure
  console.warn(`[WS] High failure rate (${failedTools.length}/${group.length}). Stopping.`);
  ws.send(JSON.stringify({
    type: 'error',
    content: `Too many tool failures: ${failedTools.map(t => t.toolName).join(', ')}`
  }));
  return;
}
```

---

### 🟡 HIGH: Fix Tool Dependency Analysis

**File:** [src/services/websocket/utils.ts](src/services/websocket/utils.ts#L50-L90)

**Current:**
```typescript
const TOOL_DEPENDENCIES: Record<string, string[]> = {
  'write_file': ['read_file'],
  'replace': ['read_file'],
  'edit': ['read_file'],
};
```

**Recommended:** Complete dependency map + validation:

```typescript
const TOOL_DEPENDENCIES: Record<string, string[]> = {
  // File operations
  'write_file': ['read_file'],    // Often need context
  'replace': ['read_file'],
  'edit': ['read_file'],
  
  // Web operations - can run in parallel with each other
  // web_search and web_fetch are independent
  
  // Shell commands - VERY conservative: treat as potentially conflicting
  'bash': ['bash'],  // Can't run bash in parallel (shared working dir, env)
  
  // Notebook operations
  'read_notebook': [],
  'write_notebook': ['read_notebook'],
  'edit_notebook_cell': ['read_notebook'],
  'add_notebook_cell': ['read_notebook'],
  'delete_notebook_cell': ['read_notebook'],
  
  // Git operations
  'git_status': [],
  'git_commit': ['git_status', 'bash'],  // Dangerous, serialize with bash
  'git_push': ['git_commit'],  // Should push after commit
  'git_pull': ['bash'],  // Can conflict with bash
  
  // Task operations
  'todo_write': ['todo_read'],
  
  // Ask user - must be serial (user can only answer one question at a time)
  'ask_user': ['ask_user'],  // Conflict with other ask_user
  
  // Skill operations
  'create_skill': [],
};

/**
 * Validate that dependencies are acyclic
 */
function validateDependencies() {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  function visit(tool: string): boolean {
    if (recursionStack.has(tool)) return false;  // Cycle detected
    if (visited.has(tool)) return true;  // Already validated
    
    recursionStack.add(tool);
    const deps = TOOL_DEPENDENCIES[tool] || [];
    
    for (const dep of deps) {
      if (!visit(dep)) return false;
    }
    
    recursionStack.delete(tool);
    visited.add(tool);
    return true;
  }
  
  for (const tool of Object.keys(TOOL_DEPENDENCIES)) {
    if (!visit(tool)) {
      throw new Error(`Circular dependency detected for tool: ${tool}`);
    }
  }
}

// Validate on startup
validateDependencies();

/**
 * Enhanced grouping with proper conflict detection
 */
export function groupToolsForParallelExecution(toolCalls: any[]): any[][] {
  if (toolCalls.length === 0) return [];
  
  const groups: any[][] = [];
  const remaining = toolCalls.map((t, idx) => ({ ...t, _index: idx }));
  const completed = new Set<number>();
  
  while (remaining.length > 0) {
    const currentGroup: any[] = [];
    const toRemove: number[] = [];
    
    for (let i = 0; i < remaining.length; i++) {
      const tool = remaining[i];
      const deps = TOOL_DEPENDENCIES[tool.name];
      
      // If no dependencies found, assume incompatible (conservative)
      if (!deps) {
        console.warn(`[WS] Unknown tool for dependency analysis: ${tool.name}. Executing serially.`);
        // Add as singleton group
        if (i === 0 || currentGroup.length === 0) {
          currentGroup.push(tool);
          toRemove.push(i);
        }
        continue;
      }
      
      // Check if dependencies are satisfied
      const depsSatisfied = deps.every(dep => {
        // Dependency satisfied if:
        // 1. It's been executed (in completed set), OR
        // 2. It's not in remaining tools (not called), OR
        // 3. It's in current group (will execute together)
        return completed.has(toolCalls.findIndex(t => t.name === dep)) ||
               !remaining.some(t => t.name === dep) ||
               currentGroup.some(t => t.name === dep);
      });
      
      // Check for conflicts with tools in current group
      const hasConflict = currentGroup.some(existing => {
        const existingDeps = TOOL_DEPENDENCIES[existing.name] || [];
        return existingDeps.includes(tool.name) ||
               (deps.includes(existing.name));
      });
      
      if (depsSatisfied && !hasConflict) {
        currentGroup.push(tool);
        toRemove.push(i);
      }
    }
    
    // If no progress, add one tool anyway (prevents infinite loop)
    if (currentGroup.length === 0 && remaining.length > 0) {
      currentGroup.push(remaining[0]);
      toRemove.push(0);
      console.warn(`[WS] Could not resolve dependencies, executing serially: ${remaining[0].name}`);
    }
    
    // Remove processed tools
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      const origIndex = remaining[idx]._index;
      completed.add(origIndex);
      remaining.splice(idx, 1);
    }
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
  }
  
  console.log(`[WS] Tool grouping: ${groups.length} groups, sizes: [${groups.map(g => g.length).join(', ')}]`);
  return groups;
}
```

---

### 🟡 HIGH: Clean Up File Handles

**Add utility function:**

```typescript
// src/services/tools/cleanup.ts
export async function safeGlobExecution(pattern: string): Promise<string[]> {
  let files: string[] = [];
  try {
    files = await globFiles(pattern);
  } catch (e) {
    console.error(`Glob failed: ${pattern}`, e);
    // Ensure cleanup happens
    // (fast-glob should handle this, but be defensive)
  }
  return files;
}

export async function safeGrepExecution(query: string, opts: any): Promise<any[]> {
  let results: any[] = [];
  try {
    results = await grepContent(query, opts);
  } catch (e) {
    console.error(`Grep failed: ${query}`, e);
  }
  return results;
}
```

**And update handlers:**

```typescript
// In toolExecutor/filesystem.ts
case 'glob': {
  const pattern = tool.input?.pattern;
  if (!pattern) return '错误：pattern 为空';
  
  try {
    const files = await safeGlobExecution(pattern);
    return files.length > 0
      ? `Found ${files.length} files:\n${files.slice(0, 100).join('\n')}`
      : 'No files matched';
  } catch (e) {
    return `Glob error: ${(e as Error).message}`;
  }
}
```

---

### 🟡 HIGH: Detect and Prevent Process Zombies

**Add process cleanup:**

```typescript
// src/services/processManager.ts
export class ProcessManager {
  private processes: Map<string, { process: ChildProcess; createdAt: number }> = new Map();
  private cleanupInterval: NodeJS.Timer | null = null;
  
  constructor() {
    // Periodic cleanup of stale processes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, { process, createdAt }] of this.processes) {
        const age = now - createdAt;
        if (age > 5 * 60 * 1000) {  // 5 minute timeout
          console.warn(`[ProcessManager] Killing stale process ${id} (age: ${age}ms)`);
          process.kill();
          this.processes.delete(id);
        }
      }
    }, 30000);  // Check every 30 seconds
  }
  
  trackProcess(process: ChildProcess): string {
    const id = `process-${Date.now()}-${Math.random()}`;
    this.processes.set(id, { process, createdAt: Date.now() });
    return id;
  }
  
  untrackProcess(id: string) {
    this.processes.delete(id);
  }
  
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    // Kill all remaining processes
    for (const { process } of this.processes.values()) {
      process.kill();
    }
    this.processes.clear();
  }
}
```

---

### 🟢 MEDIUM: Add WebSocket Backpressure

**File:** [src/services/websocket/handlers.ts](src/services/websocket/handlers.ts#L150-L170)

**Current:**
```typescript
for await (const event of llmService.chatStream(...)) {
  if (event.type === 'text' && event.content) {
    fullResponse += event.content;
    ws.send(JSON.stringify({ type: 'text', content: event.content })); // ⚠️ No flow control
  }
}
```

**Recommended:**
```typescript
// Add a queue with backpressure
const messageQueue: any[] = [];
let draining = false;

async function sendWithBackpressure(message: any) {
  return new Promise<void>((resolve) => {
    messageQueue.push({ message, resolve });
    drainQueue();
  });
}

function drainQueue() {
  if (draining || messageQueue.length === 0) return;
  draining = true;
  
  while (messageQueue.length > 0) {
    const { message, resolve } = messageQueue.shift()!;
    
    if (ws.readyState !== 1) {  // OPEN
      resolve();
      continue;
    }
    
    // Non-blocking send with buffering check
    const bufferedAmount = (ws as any).bufferedAmount || 0;
    if (bufferedAmount > 1024 * 1024) {  // 1MB buffered
      console.warn(`[WS] Backpressure: ${bufferedAmount} bytes buffered`);
      messageQueue.unshift({ message, resolve });  // Put back
      break;
    }
    
    ws.send(JSON.stringify(message), (err) => {
      if (err) console.error('[WS] Send error:', err);
      resolve();
    });
  }
  
  draining = false;
  
  // Schedule next drain if queue not empty
  if (messageQueue.length > 0) {
    setImmediate(() => drainQueue());
  }
}

// Use in streaming loop
for await (const event of llmService.chatStream(...)) {
  if (event.type === 'text' && event.content) {
    fullResponse += event.content;
    await sendWithBackpressure({ type: 'text', content: event.content });
  }
}
```

---

### 🟢 MEDIUM: Monitor Memory in Tool Progress

**File:** [src/services/websocket/handlers.ts](src/services/websocket/handlers.ts#L225-L235)

**Current:**
```typescript
if (autoProgress.tasks.length > 10) {
  autoProgress.tasks = autoProgress.tasks.filter(t => t.status === 'in_progress');
}
```

**Recommended:**
```typescript
// Limit tasks more aggressively + track memory
const MAX_ACTIVE_TASKS = 10;
const MAX_TASK_HISTORY = 50;  // Keep recent history for client

if (autoProgress.tasks.length > MAX_TASK_HISTORY) {
  // Keep completed tasks but only recent ones
  const completed = autoProgress.tasks
    .filter(t => t.status === 'completed')
    .sort((a, b) => (new Date(b.completedAt || 0)).getTime() - (new Date(a.completedAt || 0)).getTime())
    .slice(0, 10);
  
  const inProgress = autoProgress.tasks.filter(t => => t.status === 'in_progress');
  
  autoProgress.tasks = [...inProgress, ...completed];
}

// Send to client with memory usage estimate
const taskMemory = JSON.stringify(autoProgress.tasks).length;
if (taskMemory > 100 * 1024) {  // 100KB
  console.warn(`[WS] Task memory high: ${taskMemory} bytes`);
}
```

---

### 🟢 MEDIUM: Improve Error Reporting

**Add error context to WebSocket:**

```typescript
interface ErrorEvent {
  type: 'error';
  code: string;  // e.g., 'TOOL_EXEC_FAILED', 'LLM_TIMEOUT', 'DB_ERROR'
  message: string;
  context: {
    tool?: string;
    iteration?: number;
    timestamp: string;
    [key: string]: any;
  };
  recoverable: boolean;  // Can user retry?
}

// Usage in handlers:
ws.send(JSON.stringify({
  type: 'error',
  code: 'TOOL_EXEC_FAILED',
  message: `Tool ${tool.name} failed: ${error.message}`,
  context: {
    tool: tool.name,
    iteration,
    duration: Date.now() - iterationStart,
    toolInput: JSON.stringify(tool.input).substring(0, 200)
  },
  recoverable: true
}));
```

---

## 8. Implementation Roadmap

### Phase 1: Critical Stability (Week 1)
- [ ] Add LLM streaming timeout (30-60 sec)
- [ ] Fix SSE parser error reporting
- [ ] Add loop stall detection
- [ ] Handle tool result persistence failures
- [ ] Validate tool dependencies

### Phase 2: Error Isolation (Week 2)
- [ ] Wrap individual tool execution with detailed error tracking
- [ ] Add per-tool timeout (fallback: 60 sec)
- [ ] Implement tool failure metrics
- [ ] Add process cleanup manager

### Phase 3: Observability (Week 3)
- [ ] Add iteration metrics (iteration count, tool count, timing)
- [ ] Export detailed error information to client
- [ ] Implement WebSocket backpressure
- [ ] Add conversation-level metrics (success rate, avg iterations)

### Phase 4: Polish (Week 4)
- [ ] Memory management for task progress
- [ ] Context compression race condition fix
- [ ] Tool dependency completion
- [ ] Documentation updates

---

## Appendix: Test Scenarios

### Scenario A: Tool Parser Failure
```javascript
// Mock LLM returning invalid JSON
"input_json_delta": "{ incomplete"
```
**Expected:** Error sent to client, loop continues
**Currently:** Silent failure, loop continues with stale tool

### Scenario B: Parallel Tool Conflict  
```javascript
// Parallel execution of incompatible tools
toolCalls = [
  { name: 'bash', input: { command: 'cd /projectA' } },
  { name: 'bash', input: { command: 'npm test' } }  // Uses /projectA instead of cwd
]
```
**Expected:** Tools execute serially
**Currently:** Tools execute in parallel, second uses wrong directory

### Scenario C: Tool Result Persistence Failure
```javascript
// Database locked while appending tool results
conversationManager.addMessage() throws
```
**Expected:** Error reported, loop stops
**Currently:** Exception caught, next iteration uses stale context

### Scenario D: Tool Loop
```javascript
// Tool A suggests Tool A indefinitely
Iteration 1: Tool A → "Use Tool A"
Iteration 2: Tool A → "Use Tool A"
...
Iteration 20: Hit limit, stop
```
**Expected:** Detect loop after 3 iterations, warn user
**Currently:** Continue 20 iterations, confusing UX

### Scenario E: Long-Running Tool
```javascript
// Bash command takes 10 minutes
bash({ command: 'find / -type f -name "*.log"' })
```
**Expected:** Timeout after 60 sec, report error
**Currently:** Hangs for 10 minutes, frontend unresponsive

---

## References

- [src/services/websocket/handlers.ts](src/services/websocket/handlers.ts) - Main loop
- [src/services/llm.ts](src/services/llm.ts) - LLM streaming
- [src/services/toolExecutor.ts](src/services/toolExecutor.ts) - Tool execution
- [src/services/conversation.ts](src/services/conversation.ts) - Persistence
- [src/config/constants.ts](src/config/constants.ts) - Configuration

