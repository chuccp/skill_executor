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
import { createModuleLogger } from './tools/logger';

const logger = createModuleLogger('conversation');

// 内存中的记忆缓存
interface MemoryChunk {
  id: string;
  text: string;
  keywords: string[];
  createdAt: string;
}

export class ConversationManager {
  private db: Awaited<ReturnType<typeof getDatabase>> | null = null;
  private memoryIndex: Map<string, Map<string, Set<string>>> = new Map();
  private memoryChunkMap: Map<string, Map<string, MemoryChunk>> = new Map();
  private initialized: Promise<void>;

  constructor() {
    this.initialized = this.init();
  }

  private async init(): Promise<void> {
    this.db = await getDatabase();
    await this.loadMemoryIndex();
  }

  private async loadMemoryIndex(): Promise<void> {
    try {
      const rows = await this.db!.run(`
        SELECT conversation_id, memory_chunks FROM conversation_memories
      `);

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
      logger.info(`[Conversation] 已加载 ${this.memoryChunkMap.size} 个会话的记忆索引`);
    } catch {
      // 表可能不存在，忽略
    }
  }

  // ========== 会话管理 ==========

  async create(): Promise<Conversation> {
    await this.ensureInitialized();
    const id = uuidv4();
    const now = new Date();

    await this.db!.execute(`
      INSERT INTO conversations (id, created_at, updated_at, message_count)
      VALUES (?, ?, ?, 0)
    `, [id, now.toISOString(), now.toISOString()]);

    return {
      id,
      messages: [],
      createdAt: now,
      updatedAt: now
    };
  }

  async get(id: string): Promise<Conversation | undefined> {
    await this.ensureInitialized();
    const row = await this.db!.get(`
      SELECT * FROM conversations WHERE id = ?
    `, [id]);

    if (!row) return undefined;

    const messages = await this.getMessages(id);

    return {
      id: row.id,
      messages,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  async getMeta(id: string): Promise<{
    id: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
    summary?: string;
    firstUserMessage?: string;
  } | undefined> {
    const row = await this.db!.get(`
      SELECT * FROM conversations WHERE id = ?
    `, [id]);

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

  async getAllMeta(): Promise<{
    id: string;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
    summary?: string;
    firstUserMessage?: string;
  }[]> {
    const rows = await this.db!.run(`
      SELECT * FROM conversations ORDER BY updated_at DESC
    `);

    return rows.map((row: any) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.message_count,
      summary: row.summary || undefined,
      firstUserMessage: row.first_user_message || undefined
    }));
  }

  async getAll(): Promise<Conversation[]> {
    const metas = await this.getAllMeta();
    const conversations: Conversation[] = [];
    for (const meta of metas) {
      const messages = await this.getMessages(meta.id);
      conversations.push({
        id: meta.id,
        messages,
        createdAt: new Date(meta.createdAt),
        updatedAt: new Date(meta.updatedAt)
      });
    }
    return conversations;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db!.execute('DELETE FROM conversations WHERE id = ?', [id]);

    if (result.changes > 0) {
      this.memoryIndex.delete(id);
      this.memoryChunkMap.delete(id);
    }

    return result.changes > 0;
  }

  // ========== 消息管理 ==========

  async addMessage(
    conversationId: string,
    role: ChatMessage['role'],
    content: string,
    extra?: { thinking?: string; toolResults?: any[] }
  ): Promise<ChatMessage | null> {
    const conv = await this.db!.get('SELECT id FROM conversations WHERE id = ?', [conversationId]);
    if (!conv) return null;

    if (content.length > MAX_MESSAGE_LENGTH) {
      content = content.substring(0, MAX_MESSAGE_LENGTH) + '\n... (内容已截断)';
    }

    const timestamp = new Date();
    const thinking = extra?.thinking || null;
    const toolResults = extra?.toolResults ? JSON.stringify(extra.toolResults) : null;

    await this.db!.execute(`
      INSERT INTO messages (conversation_id, role, content, thinking, tool_results, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [conversationId, role, content, thinking, toolResults, timestamp.toISOString()]);

    await this.db!.execute(`
      UPDATE conversations
      SET updated_at = ?, message_count = message_count + 1
      WHERE id = ?
    `, [timestamp.toISOString(), conversationId]);

    await this.db!.execute(`
      UPDATE conversations
      SET first_user_message = COALESCE(first_user_message, ?)
      WHERE id = ?
    `, [content.substring(0, 50), conversationId]);

    return {
      role,
      content,
      timestamp,
      ...(thinking && { thinking }),
      ...(extra?.toolResults && { toolResults: extra.toolResults })
    };
  }

  async updateMessage(
    conversationId: string,
    messageIndex: number,
    extra: {
      thinking?: string;
      toolResults?: any[];
      usage?: { inputTokens: number; outputTokens: number; contextTokens?: number; contextLimit?: number; contextPercent?: number };
      content?: string;
    }
  ): Promise<boolean> {
    const messages = await this.db!.run(`
      SELECT id, role FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
    `, [conversationId]);

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
      await this.db!.execute('UPDATE messages SET thinking = ? WHERE id = ?', [extra.thinking, msg.id]);
    }
    if (extra.toolResults) {
      await this.db!.execute('UPDATE messages SET tool_results = ? WHERE id = ?', [JSON.stringify(extra.toolResults), msg.id]);
    }
    if (extra.content !== undefined) {
      await this.db!.execute('UPDATE messages SET content = ? WHERE id = ?', [extra.content, msg.id]);
    }

    return true;
  }

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const rows = await this.db!.run(`
      SELECT role, content, thinking, tool_results, timestamp
      FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
    `, [conversationId]);

    return rows.map((row: any) => ({
      role: row.role as 'user' | 'assistant' | 'system',
      content: row.content || '',
      timestamp: new Date(row.timestamp),
      ...(row.thinking && { thinking: row.thinking }),
      ...(row.tool_results && { toolResults: JSON.parse(row.tool_results) })
    }));
  }

  async clear(id: string): Promise<boolean> {
    const conv = await this.db!.get('SELECT id FROM conversations WHERE id = ?', [id]);
    if (!conv) return false;

    await this.db!.execute('DELETE FROM messages WHERE conversation_id = ?', [id]);

    await this.db!.execute(`
      UPDATE conversations
      SET message_count = 0, summary = NULL, updated_at = ?
      WHERE id = ?
    `, [new Date().toISOString(), id]);

    this.memoryIndex.delete(id);
    this.memoryChunkMap.delete(id);

    return true;
  }

  // ========== 会话压缩 ==========

  async compress(
    conversationId: string,
    llmService?: { chat: (messages: ChatMessage[], systemPrompt?: string) => Promise<string> }
  ): Promise<boolean> {
    const messages = await this.getMessages(conversationId);
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

    const recentIds = await this.db!.run(`
      SELECT id FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `, [conversationId, WORKING_MEMORY_SIZE * 2]);

    if (recentIds.length > 0) {
      const ids = recentIds.map((r: any) => r.id);
      const placeholders = ids.map(() => '?').join(',');

      await this.db!.execute(`
        DELETE FROM messages
        WHERE conversation_id = ? AND id NOT IN (${placeholders})
      `, [conversationId, ...ids]);
    }

    await this.addMessage(conversationId, 'user', `[历史对话摘要]\n${summary}`);

    await this.db!.execute(`
      UPDATE conversations
      SET summary = ?, message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = ?)
      WHERE id = ?
    `, [summary, conversationId, conversationId]);

    await this.saveMemoryChunks(conversationId, trimmedChunks);

    logger.info(`[Conversation] 会话 ${conversationId.slice(0, 8)} 已压缩：${oldMessages.length} 条消息已总结`);
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
      logger.error('[Conversation] LLM 摘要生成失败:', error);
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
        sections.push(`${i + 1}. 用户：${task.request.substring(0, 80)}`);
        sections.push(`   结果：${task.result.substring(0, 100)}`);
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

  async buildContextMessages(conversationId: string, userInput: string): Promise<ChatMessage[]> {
    const messages = await this.getMessages(conversationId);
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

    const meta = await this.db!.get('SELECT summary FROM conversations WHERE id = ?', [conversationId]);
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

  private async saveMemoryChunks(conversationId: string, chunks: MemoryChunk[]): Promise<void> {
    this.rebuildMemoryIndexForConversation(conversationId, chunks);

    await this.db!.exec(`
      CREATE TABLE IF NOT EXISTS conversation_memories (
        conversation_id TEXT PRIMARY KEY,
        memory_chunks TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    const now = Date.now();
    await this.db!.execute(`
      INSERT OR REPLACE INTO conversation_memories (conversation_id, memory_chunks, updated_at)
      VALUES (?, ?, ?)
    `, [conversationId, JSON.stringify(chunks), now]);
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

  async getStats(): Promise<{ totalConversations: number; totalMessages: number; oldestConversation: string | null }> {
    const stats = await this.db!.getStats();
    const oldest = await this.db!.get('SELECT id FROM conversations ORDER BY created_at ASC LIMIT 1');

    return {
      totalConversations: stats.conversations,
      totalMessages: stats.messages,
      oldestConversation: oldest?.id || null
    };
  }

  async cleanup(keepCount: number = 50): Promise<number> {
    const allMeta = await this.getAllMeta();
    if (allMeta.length <= keepCount) return 0;

    const toDelete = allMeta.slice(keepCount);
    for (const meta of toDelete) {
      await this.delete(meta.id);
    }

    logger.info(`[Conversation] 已清理 ${toDelete.length} 个旧会话`);
    return toDelete.length;
  }

  async searchMessages(query: string, limit: number = 20): Promise<{ conversationId: string; message: ChatMessage }[]> {
    const rows = await this.db!.run(`
      SELECT conversation_id, role, content, timestamp
      FROM messages
      WHERE content LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `, [`%${query}%`, limit]);

    return rows.map((row: any) => ({
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

  // 确保初始化完成
  async ensureInitialized(): Promise<void> {
    await this.initialized;
  }
}

export default ConversationManager;
