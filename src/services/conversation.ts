import { v4 as uuidv4 } from 'uuid';
import { Conversation, ChatMessage } from '../types';
import { getDatabase } from './database';
import {
  MAX_MESSAGE_LENGTH,
  WORKING_MEMORY_SIZE,
  MEMORY_CHUNK_SIZE,
  RETRIEVAL_LIMIT,
  CONTEXT_CHAR_BUDGET,
  MAX_MEMORY_CHUNKS,
  MEMORY_TTL_DAYS
} from '../config/constants';

// 内存中的记忆缓存
interface MemoryChunk {
  id: string;
  text: string;
  keywords: string[];
  createdAt: string;
}

export class ConversationManager {
  private db = getDatabase().getDb();
  private memoryIndex: Map<string, Map<string, Set<string>>> = new Map();
  private memoryChunkMap: Map<string, Map<string, MemoryChunk>> = new Map();

  constructor() {
    this.loadMemoryIndex();
  }

  private loadMemoryIndex(): void {
    try {
      const rows = this.db.prepare(`
        SELECT conversation_id, memory_chunks FROM conversation_memories
      `).all() as { conversation_id: string; memory_chunks: string }[];

      for (const row of rows) {
        try {
          const chunks = JSON.parse(row.memory_chunks) as MemoryChunk[];
          const map = new Map<string, MemoryChunk>();
          for (const c of chunks) {
            map.set(c.id, c);
          }
          this.memoryChunkMap.set(row.conversation_id, map);
          this.rebuildMemoryIndexForConversation(row.conversation_id, chunks);
        } catch {
          // 忽略解析错误
        }
      }
      console.log(`[Conversation] 已加载 ${this.memoryChunkMap.size} 个会话的记忆索引`);
    } catch {
      // 表可能不存在，忽略
    }
  }

  // ========== 会话管理 ==========

  create(): Conversation {
    const id = uuidv4();
    const now = new Date();

    this.db.prepare(`
      INSERT INTO conversations (id, created_at, updated_at, message_count)
      VALUES (?, ?, ?, 0)
    `).run(id, now.toISOString(), now.toISOString());

    return {
      id,
      messages: [],
      createdAt: now,
      updatedAt: now
    };
  }

  get(id: string): Conversation | undefined {
    const row = this.db.prepare(`
      SELECT * FROM conversations WHERE id = ?
    `).get(id) as { id: string; created_at: string; updated_at: string } | undefined;

    if (!row) return undefined;

    const messages = this.getMessages(id);

    return {
      id: row.id,
      messages,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  getMeta(id: string): {
    id: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
    summary?: string;
    firstUserMessage?: string;
  } | undefined {
    const row = this.db.prepare(`
      SELECT * FROM conversations WHERE id = ?
    `).get(id) as { id: string; created_at: string; updated_at: string; message_count: number; summary: string | null; first_user_message: string | null } | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.message_count,
      summary: row.summary || undefined,
      firstUserMessage: row.first_user_message || undefined
    };
  }

  getAllMeta(): {
    id: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
    summary?: string;
    firstUserMessage?: string;
  }[] {
    const rows = this.db.prepare(`
      SELECT * FROM conversations ORDER BY updated_at DESC
    `).all() as { id: string; created_at: string; updated_at: string; message_count: number; summary: string | null; first_user_message: string | null }[];

    return rows.map(row => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.message_count,
      summary: row.summary || undefined,
      firstUserMessage: row.first_user_message || undefined
    }));
  }

  getAll(): Conversation[] {
    const metas = this.getAllMeta();
    return metas.map(meta => {
      const messages = this.getMessages(meta.id);
      return {
        id: meta.id,
        messages,
        createdAt: new Date(meta.createdAt),
        updatedAt: new Date(meta.updatedAt)
      };
    });
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);

    if (result.changes > 0) {
      this.memoryIndex.delete(id);
      this.memoryChunkMap.delete(id);
    }

    return result.changes > 0;
  }

  // ========== 消息管理 ==========

  addMessage(
    conversationId: string,
    role: ChatMessage['role'],
    content: string,
    extra?: { thinking?: string; toolResults?: any[] }
  ): ChatMessage | null {
    const conv = this.db.prepare('SELECT id FROM conversations WHERE id = ?').get(conversationId);
    if (!conv) return null;

    if (content.length > MAX_MESSAGE_LENGTH) {
      content = content.substring(0, MAX_MESSAGE_LENGTH) + '\n... (内容已截断)';
    }

    const timestamp = new Date();
    const thinking = extra?.thinking || null;
    const toolResults = extra?.toolResults ? JSON.stringify(extra.toolResults) : null;

    this.db.prepare(`
      INSERT INTO messages (conversation_id, role, content, thinking, tool_results, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(conversationId, role, content, thinking, toolResults, timestamp.toISOString());

    this.db.prepare(`
      UPDATE conversations
      SET updated_at = ?, message_count = message_count + 1
      WHERE id = ?
    `).run(timestamp.toISOString(), conversationId);

    this.db.prepare(`
      UPDATE conversations
      SET first_user_message = COALESCE(first_user_message, ?)
      WHERE id = ?
    `).run(content.substring(0, 50), conversationId);

    return {
      role,
      content,
      timestamp,
      ...(thinking && { thinking }),
      ...(extra?.toolResults && { toolResults: extra.toolResults })
    };
  }

  updateMessage(
    conversationId: string,
    messageIndex: number,
    extra: {
      thinking?: string;
      toolResults?: any[];
      usage?: { inputTokens: number; outputTokens: number; contextTokens?: number; contextLimit?: number; contextPercent?: number };
      content?: string;
    }
  ): boolean {
    const messages = this.db.prepare(`
      SELECT id, role FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
    `).all(conversationId) as { id: number; role: string }[];

    if (messageIndex < 0 || messageIndex >= messages.length) return false;

    let msg = messages[messageIndex];

    if (msg.role !== 'assistant') {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          msg = messages[i];
          break;
        }
      }
    }

    if (msg.role !== 'assistant') return false;

    if (extra.thinking) {
      this.db.prepare('UPDATE messages SET thinking = ? WHERE id = ?').run(extra.thinking, msg.id);
    }
    if (extra.toolResults) {
      this.db.prepare('UPDATE messages SET tool_results = ? WHERE id = ?').run(JSON.stringify(extra.toolResults), msg.id);
    }
    if (extra.content !== undefined) {
      this.db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(extra.content, msg.id);
    }

    return true;
  }

  getMessages(conversationId: string): ChatMessage[] {
    const rows = this.db.prepare(`
      SELECT role, content, thinking, tool_results, timestamp
      FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
    `).all(conversationId) as { role: string; content: string | null; thinking: string | null; tool_results: string | null; timestamp: string }[];

    return rows.map(row => ({
      role: row.role as 'user' | 'assistant' | 'system',
      content: row.content || '',
      timestamp: new Date(row.timestamp),
      ...(row.thinking && { thinking: row.thinking }),
      ...(row.tool_results && { toolResults: JSON.parse(row.tool_results) })
    }));
  }

  clear(id: string): boolean {
    const conv = this.db.prepare('SELECT id FROM conversations WHERE id = ?').get(id);
    if (!conv) return false;

    this.db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);

    this.db.prepare(`
      UPDATE conversations
      SET message_count = 0, summary = NULL, updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id);

    this.memoryIndex.delete(id);
    this.memoryChunkMap.delete(id);

    return true;
  }

  // ========== 会话压缩 ==========

  async compress(
    conversationId: string,
    llmService?: { chat: (messages: ChatMessage[], systemPrompt?: string) => Promise<string> }
  ): Promise<boolean> {
    const messages = this.getMessages(conversationId);
    if (messages.length <= WORKING_MEMORY_SIZE) return false;

    const recentMessages = messages
      .slice(-WORKING_MEMORY_SIZE)
      .filter(m => !this.isSystemMemory(m));

    const oldMessages = messages.slice(0, -WORKING_MEMORY_SIZE)
      .filter(m => !this.isSystemMemory(m));

    if (oldMessages.length === 0) return false;

    let summary: string;
    if (llmService) {
      summary = await this.generateSummaryWithLLM(oldMessages, llmService);
    } else {
      summary = this.generateSimpleSummary(oldMessages);
    }

    const existingChunks = this.memoryChunkMap.get(conversationId) ?
      Array.from(this.memoryChunkMap.get(conversationId)!.values()) : [];
    const newChunks = this.buildMemoryChunks(oldMessages);
    const mergedChunks = this.mergeMemoryChunks(existingChunks, newChunks);
    const trimmedChunks = this.trimMemoryChunks(mergedChunks);

    const recentIds = this.db.prepare(`
      SELECT id FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(conversationId, WORKING_MEMORY_SIZE * 2) as { id: number }[];

    if (recentIds.length > 0) {
      const ids = recentIds.map(r => r.id);
      const placeholders = ids.map(() => '?').join(',');

      this.db.prepare(`
        DELETE FROM messages
        WHERE conversation_id = ? AND id NOT IN (${placeholders})
      `).run(conversationId, ...ids);
    }

    this.addMessage(conversationId, 'user', `[历史对话摘要]\n${summary}`);

    this.db.prepare(`
      UPDATE conversations
      SET summary = ?, message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = ?)
      WHERE id = ?
    `).run(summary, conversationId, conversationId);

    this.saveMemoryChunks(conversationId, trimmedChunks);

    console.log(`[Conversation] 会话 ${conversationId.slice(0, 8)} 已压缩: ${oldMessages.length} 条消息已总结`);
    return true;
  }

  private async generateSummaryWithLLM(
    messages: ChatMessage[],
    llmService: { chat: (messages: ChatMessage[], systemPrompt?: string) => Promise<string> }
  ): Promise<string> {
    const messagePreview = messages.map(m => {
      const content = m.content.substring(0, 500);
      return `${m.role === 'user' ? '用户' : 'AI'}: ${content}${m.content.length > 500 ? '...' : ''}`;
    }).join('\n\n');

    const systemPrompt = `你是一个对话摘要助手。请将以下历史对话压缩成一个简洁的摘要。

要求：
1. 保留关键的任务请求和完成结果
2. 保留重要的决策和选择
3. 忽略无关细节和重复内容
4. 摘要长度控制在 500 字以内
5. 使用中文，简洁清晰`;

    const chatMessages: ChatMessage[] = [
      {
        role: 'user',
        content: `请总结以下对话历史（共 ${messages.length} 条消息）：\n\n${messagePreview}`,
        timestamp: new Date()
      }
    ];

    try {
      const summary = await llmService.chat(chatMessages, systemPrompt);
      return summary || this.generateSimpleSummary(messages);
    } catch (error) {
      console.error('[Conversation] LLM 摘要生成失败:', error);
      return this.generateSimpleSummary(messages);
    }
  }

  private generateSimpleSummary(messages: ChatMessage[]): string {
    const sections: string[] = [];
    const tasks: { request: string; result: string }[] = [];
    let currentRequest = '';
    let currentResult = '';

    for (const msg of messages) {
      if (msg.role === 'user') {
        if (msg.content.startsWith('[工具结果]') || msg.content.startsWith('[历史对话摘要]')) continue;
        if (currentRequest && currentResult) {
          tasks.push({ request: currentRequest, result: currentResult });
        }
        currentRequest = msg.content.substring(0, 150);
        currentResult = '';
      } else if (msg.role === 'assistant') {
        currentResult = msg.content.substring(0, 200);
      }
    }
    if (currentRequest && currentResult) {
      tasks.push({ request: currentRequest, result: currentResult });
    }

    sections.push(`共 ${messages.length} 条消息，${tasks.length} 个任务。`);

    if (tasks.length > 0) {
      sections.push('\n已完成任务：');
      const recentTasks = tasks.slice(-10);
      for (let i = 0; i < recentTasks.length; i++) {
        const task = recentTasks[i];
        sections.push(`${i + 1}. 用户: ${task.request.substring(0, 80)}`);
        sections.push(`   结果: ${task.result.substring(0, 100)}`);
      }
    }

    return sections.join('\n');
  }

  private buildMemoryChunks(messages: ChatMessage[]): MemoryChunk[] {
    if (!messages || messages.length === 0) return [];
    const chunks: MemoryChunk[] = [];
    for (let i = 0; i < messages.length; i += MEMORY_CHUNK_SIZE) {
      const slice = messages.slice(i, i + MEMORY_CHUNK_SIZE);
      const text = slice.map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`).join('\n');
      const keywords = this.extractKeywords(text);
      chunks.push({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        keywords,
        createdAt: new Date().toISOString()
      });
    }
    return chunks;
  }

  private extractKeywords(text: string): string[] {
    const tokens = text
      .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .map(t => t.trim())
      .filter(t => t.length >= 2 && t.length <= 12);
    const freq: Record<string, number> = {};
    for (const t of tokens) {
      freq[t] = (freq[t] || 0) + 1;
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => k);
  }

  private retrieveMemory(query: string, chunks: MemoryChunk[]): MemoryChunk[] {
    if (!query || !chunks || chunks.length === 0) return [];
    const q = this.extractKeywords(query);
    if (q.length === 0) return [];
    const scored = this.scoreChunksByQuery(q, chunks);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, RETRIEVAL_LIMIT).map(s => s.chunk);
  }

  buildContextMessages(conversationId: string, userInput: string): ChatMessage[] {
    const messages = this.getMessages(conversationId);
    if (messages.length === 0) return [];

    const recentRaw = messages
      .slice(-WORKING_MEMORY_SIZE * 2)
      .filter(m => !this.isSystemMemory(m));

    const recent: ChatMessage[] = [];
    let used = 0;
    for (let i = recentRaw.length - 1; i >= 0; i -= 1) {
      const msg = recentRaw[i];
      const len = msg.content ? msg.content.length : 0;
      if (used + len > CONTEXT_CHAR_BUDGET && recent.length >= 4) break;
      recent.unshift(msg);
      used += len;
      if (recent.length >= WORKING_MEMORY_SIZE) break;
    }

    const meta = this.db.prepare('SELECT summary FROM conversations WHERE id = ?').get(conversationId) as { summary: string | null } | undefined;
    const summary = meta?.summary;
    const chunks = this.memoryChunkMap.get(conversationId);
    const memoryChunks = chunks ? Array.from(chunks.values()) : [];
    const retrieved = this.retrieveMemory(userInput, memoryChunks);

    const context: ChatMessage[] = [];

    if (summary) {
      context.push({
        role: 'system',
        content: `[历史对话摘要]\n${summary}`,
        timestamp: new Date()
      });
    }

    if (retrieved.length > 0) {
      const memoryText = retrieved.map((c, i) => `片段${i + 1}:\n${c.text}`).join('\n\n');
      context.push({
        role: 'system',
        content: `[相关记忆]\n${memoryText}`,
        timestamp: new Date()
      });
    }

    context.push(...recent);
    return context;
  }

  private isSystemMemory(message: ChatMessage): boolean {
    if (message.role !== 'user' && message.role !== 'assistant' && message.role !== 'system') return false;
    const content = typeof message.content === 'string' ? message.content : '';
    return content.startsWith('[历史对话摘要]') || content.startsWith('[相关记忆]');
  }

  private mergeMemoryChunks(existing: MemoryChunk[], incoming: MemoryChunk[]): MemoryChunk[] {
    const map = new Map<string, MemoryChunk>();
    const put = (c: MemoryChunk) => {
      const key = this.hashChunk(c.text);
      if (!map.has(key)) map.set(key, c);
    };
    existing.forEach(put);
    incoming.forEach(put);
    return Array.from(map.values());
  }

  private trimMemoryChunks(chunks: MemoryChunk[]): MemoryChunk[] {
    const now = Date.now();
    const fresh = chunks.filter(c => {
      const ts = Date.parse(c.createdAt || '');
      if (!ts) return true;
      return now - ts <= MEMORY_TTL_DAYS * 24 * 60 * 60 * 1000;
    });
    fresh.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return fresh.slice(0, MAX_MEMORY_CHUNKS);
  }

  private hashChunk(text: string): string {
    const head = text.slice(0, 64);
    return `${text.length}:${head}`;
  }

  private rebuildMemoryIndexForConversation(conversationId: string, chunks: MemoryChunk[]): void {
    const index: Map<string, Set<string>> = new Map();
    const map = new Map<string, MemoryChunk>();
    for (const c of chunks) {
      map.set(c.id, c);
      for (const k of c.keywords || []) {
        if (!index.has(k)) index.set(k, new Set());
        index.get(k)!.add(c.id);
      }
    }
    this.memoryIndex.set(conversationId, index);
    this.memoryChunkMap.set(conversationId, map);
  }

  private saveMemoryChunks(conversationId: string, chunks: MemoryChunk[]): void {
    this.rebuildMemoryIndexForConversation(conversationId, chunks);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_memories (
        conversation_id TEXT PRIMARY KEY,
        memory_chunks TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    const now = Date.now();
    this.db.prepare(`
      INSERT OR REPLACE INTO conversation_memories (conversation_id, memory_chunks, updated_at)
      VALUES (?, ?, ?)
    `).run(conversationId, JSON.stringify(chunks), now);
  }

  private scoreChunksByQuery(queryKeywords: string[], chunks: MemoryChunk[]): { chunk: MemoryChunk; score: number }[] {
    const scored: { chunk: MemoryChunk; score: number }[] = [];
    if (!chunks || chunks.length === 0) return scored;

    for (const c of chunks) {
      const overlap = c.keywords.filter(k => queryKeywords.includes(k)).length;
      if (overlap === 0) continue;
      const recency = this.recencyBoost(c.createdAt);
      scored.push({ chunk: c, score: overlap + recency });
    }
    return scored;
  }

  private recencyBoost(createdAt: string): number {
    const ts = Date.parse(createdAt || '');
    if (!ts) return 0;
    const days = (Date.now() - ts) / (24 * 60 * 60 * 1000);
    if (days <= 3) return 1.5;
    if (days <= 7) return 1.0;
    if (days <= 14) return 0.5;
    return 0;
  }

  // ========== 工具方法 ==========

  getStats(): { totalConversations: number; totalMessages: number; oldestConversation: string | null } {
    const stats = getDatabase().getStats();
    const oldest = this.db.prepare('SELECT id FROM conversations ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined;

    return {
      totalConversations: stats.conversations,
      totalMessages: stats.messages,
      oldestConversation: oldest?.id || null
    };
  }

  cleanup(keepCount: number = 50): number {
    const allMeta = this.getAllMeta();
    if (allMeta.length <= keepCount) return 0;

    const toDelete = allMeta.slice(keepCount);
    for (const meta of toDelete) {
      this.delete(meta.id);
    }

    console.log(`[Conversation] 已清理 ${toDelete.length} 个旧会话`);
    return toDelete.length;
  }

  searchMessages(query: string, limit: number = 20): { conversationId: string; message: ChatMessage }[] {
    const rows = this.db.prepare(`
      SELECT conversation_id, role, content, timestamp
      FROM messages
      WHERE content LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(`%${query}%`, limit) as { conversation_id: string; role: string; content: string; timestamp: string }[];

    return rows.map(row => ({
      conversationId: row.conversation_id,
      message: {
        role: row.role as 'user' | 'assistant' | 'system',
        content: row.content,
        timestamp: new Date(row.timestamp)
      }
    }));
  }

  getMemoryStats(conversationId: string): { chunkCount: number; indexKeys: number } {
    const chunks = this.memoryChunkMap.get(conversationId);
    const idx = this.memoryIndex.get(conversationId);
    return {
      chunkCount: chunks ? chunks.size : 0,
      indexKeys: idx ? idx.size : 0
    };
  }
}

export default ConversationManager;