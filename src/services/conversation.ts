import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Conversation, ChatMessage } from '../types';

// 持久化存储路径
const DATA_DIR = path.join(process.cwd(), 'data');
const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json');
const MAX_MESSAGE_LENGTH = 8000; // 单条消息最大长度
const MAX_MESSAGES_PER_CONVERSATION = 100; // 每个会话最大消息数
const SUMMARIZE_THRESHOLD = 50; // 触发总结的消息数阈值
const WORKING_MEMORY_SIZE = 20; // 工作记忆保留最近消息数
const MEMORY_CHUNK_SIZE = 10; // 记忆切片包含的消息数
const RETRIEVAL_LIMIT = 3; // 召回的记忆片段数量
const CONTEXT_CHAR_BUDGET = 12000; // 工作记忆字符预算（近似）
const MAX_MEMORY_CHUNKS = 60; // 单会话最大记忆片段数
const MEMORY_TTL_DAYS = 30; // 记忆片段过期天数

// 会话元数据（用于列表显示）
interface ConversationMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  summary?: string;
  firstUserMessage?: string;
  memoryChunks?: MemoryChunk[];
}

// 完整会话数据
interface ConversationData {
  meta: ConversationMeta;
  messages: ChatMessage[];
}

interface MemoryChunk {
  id: string;
  text: string;
  keywords: string[];
  createdAt: string;
}

export class ConversationManager {
  private conversations: Map<string, ConversationData> = new Map();
  private dataPath: string;
  private saveTimeout: NodeJS.Timeout | null = null;
  private memoryIndex: Map<string, Map<string, Set<string>>> = new Map();
  private memoryChunkMap: Map<string, Map<string, MemoryChunk>> = new Map();

  constructor(dataPath: string = CONVERSATIONS_FILE) {
    this.dataPath = dataPath;
    this.load();
  }

  // ========== 加载和保存 ==========

  private load(): void {
    try {
      // 确保目录存在
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.dataPath)) {
        const content = fs.readFileSync(this.dataPath, 'utf-8');
        const data = JSON.parse(content);
        
        if (data.conversations && Array.isArray(data.conversations)) {
          for (const conv of data.conversations) {
            if (conv.meta && conv.messages) {
              this.conversations.set(conv.meta.id, conv);
              this.rebuildMemoryIndex(conv.meta.id, conv.meta.memoryChunks || []);
            }
          }
        }
        
        console.log(`[Conversation] 已加载 ${this.conversations.size} 个会话`);
      }
    } catch (error) {
      console.error('[Conversation] 加载会话失败:', error);
      this.conversations = new Map();
      this.memoryIndex = new Map();
      this.memoryChunkMap = new Map();
    }
  }

  private save(): void {
    // 防抖：延迟保存，避免频繁写入
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.saveTimeout = setTimeout(() => {
      this.doSave();
    }, 1000);
  }

  private doSave(): void {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        version: 1,
        savedAt: new Date().toISOString(),
        conversations: Array.from(this.conversations.values())
      };

      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`[Conversation] 已保存 ${this.conversations.size} 个会话`);
    } catch (error) {
      console.error('[Conversation] 保存会话失败:', error);
    }
  }

  // ========== 会话管理 ==========

  // 创建新会话
  create(): Conversation {
    const id = uuidv4();
    const now = new Date();
    
    const meta: ConversationMeta = {
      id,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      messageCount: 0
    };

    const conversation: ConversationData = {
      meta,
      messages: []
    };

    this.conversations.set(id, conversation);
    this.save();

    return {
      id,
      messages: [],
      createdAt: now,
      updatedAt: now
    };
  }

  // 获取会话
  get(id: string): Conversation | undefined {
    const data = this.conversations.get(id);
    if (!data) return undefined;

    return {
      id: data.meta.id,
      messages: data.messages,
      createdAt: new Date(data.meta.createdAt),
      updatedAt: new Date(data.meta.updatedAt)
    };
  }

  // 获取会话元数据（用于列表）
  getMeta(id: string): ConversationMeta | undefined {
    return this.conversations.get(id)?.meta;
  }

  // 获取所有会话元数据
  getAllMeta(): ConversationMeta[] {
    return Array.from(this.conversations.values())
      .map(d => d.meta)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  // 获取所有会话（完整数据）
  getAll(): Conversation[] {
    return Array.from(this.conversations.values())
      .map(data => ({
        id: data.meta.id,
        messages: data.messages,
        createdAt: new Date(data.meta.createdAt),
        updatedAt: new Date(data.meta.updatedAt)
      }))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  // 删除会话
  delete(id: string): boolean {
    const result = this.conversations.delete(id);
    if (result) {
      this.memoryIndex.delete(id);
      this.memoryChunkMap.delete(id);
      this.save();
    }
    return result;
  }

  // ========== 消息管理 ==========

  // 添加消息
  addMessage(conversationId: string, role: ChatMessage['role'], content: string): ChatMessage | null {
    const data = this.conversations.get(conversationId);
    if (!data) return null;

    // 截断过长的消息
    if (content.length > MAX_MESSAGE_LENGTH) {
      content = content.substring(0, MAX_MESSAGE_LENGTH) + '\n... (内容已截断)';
    }

    const message: ChatMessage = {
      role,
      content,
      timestamp: new Date()
    };

    data.messages.push(message);
    data.meta.messageCount = data.messages.length;
    data.meta.updatedAt = new Date().toISOString();

    // 保存第一条用户消息作为预览
    if (role === 'user' && !data.meta.firstUserMessage) {
      data.meta.firstUserMessage = content.substring(0, 50);
    }

    // 检查是否需要压缩（避免上下文膨胀）
    if (data.messages.length > SUMMARIZE_THRESHOLD) {
      this.compressConversation(conversationId);
    }

    this.save();
    return message;
  }

  // 获取消息列表
  getMessages(conversationId: string): ChatMessage[] {
    return this.conversations.get(conversationId)?.messages || [];
  }

  // 清空会话消息
  clear(id: string): boolean {
    const data = this.conversations.get(id);
    if (!data) return false;

    data.messages = [];
    data.meta.messageCount = 0;
    data.meta.summary = undefined;
    data.meta.memoryChunks = [];
    this.memoryIndex.delete(id);
    this.memoryChunkMap.delete(id);
    data.meta.updatedAt = new Date().toISOString();
    this.save();
    return true;
  }

  // ========== 会话压缩 ==========

  // 压缩会话（保留最近消息 + 历史摘要）
  private compressConversation(conversationId: string): void {
    const data = this.conversations.get(conversationId);
    if (!data || data.messages.length <= SUMMARIZE_THRESHOLD) return;

    // 保留最近的消息
    const recentMessages = data.messages.slice(-WORKING_MEMORY_SIZE);
    
    // 生成历史摘要
    const oldMessages = data.messages.slice(0, -WORKING_MEMORY_SIZE)
      .filter(m => !this.isSystemMemory(m));
    const summary = this.generateSummary(oldMessages);
    const memoryChunks = this.mergeMemoryChunks(
      data.meta.memoryChunks || [],
      this.buildMemoryChunks(oldMessages)
    );
    const trimmedChunks = this.trimMemoryChunks(memoryChunks);

    // 创建压缩后的消息
    data.messages = [
      {
        role: 'user',
        content: `[历史对话摘要]\n${summary}`,
        timestamp: new Date()
      },
      ...recentMessages
    ];

    data.meta.summary = summary;
    data.meta.memoryChunks = trimmedChunks;
    data.meta.messageCount = data.messages.length;
    this.rebuildMemoryIndex(conversationId, trimmedChunks);

    console.log(`[Conversation] 会话 ${conversationId.slice(0, 8)} 已压缩: ${oldMessages.length} 条消息已总结`);
  }

  // 生成消息摘要
  private generateSummary(messages: ChatMessage[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    // 统计关键信息
    const topics = this.extractTopics(userMessages);
    
    let summary = `之前的对话包含 ${messages.length} 条消息。\n`;
    
    if (topics.length > 0) {
      summary += `讨论的主要话题：${topics.join('、')}。\n`;
    }

    // 提取最后几条关键交互
    const lastInteractions = messages.slice(-5);
    if (lastInteractions.length > 0) {
      summary += '\n最后的交互：\n';
      for (const msg of lastInteractions) {
        const preview = msg.content.substring(0, 100).replace(/\n/g, ' ');
        summary += `- ${msg.role === 'user' ? '用户' : 'AI'}: ${preview}${msg.content.length > 100 ? '...' : ''}\n`;
      }
    }

    return summary;
  }

  // 提取话题关键词
  private extractTopics(messages: ChatMessage[]): string[] {
    const keywords = new Set<string>();
    const patterns = [
      /(?:帮我|请|可以|能不能)(\S+)/g,
      /(\S+)(?:文件|代码|函数|方法)/g,
      /(?:关于|有关)(\S+)/g
    ];

    for (const msg of messages) {
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(msg.content)) !== null) {
          const word = match[1]?.trim();
          if (word && word.length > 1 && word.length < 10) {
            keywords.add(word);
          }
        }
      }
    }

    return Array.from(keywords).slice(0, 5);
  }

  // 构建记忆切片
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
      .replace(/[^\w\u4e00-\u9fa5]+/g, ' ')
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

  // 构建上下文消息（工作记忆 + 摘要记忆 + 召回记忆）
  buildContextMessages(conversationId: string, userInput: string): ChatMessage[] {
    const data = this.conversations.get(conversationId);
    if (!data) return [];

    const recentRaw = data.messages
      .slice(-WORKING_MEMORY_SIZE * 2)
      .filter(m => !this.isSystemMemory(m))
      .filter(m => !(typeof m.content === 'string' && m.content.startsWith('[工具结果]')));
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
    const summary = data.meta.summary;
    const chunks = data.meta.memoryChunks || [];
    const retrieved = this.retrieveMemory(userInput, chunks);

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

  private rebuildMemoryIndex(conversationId: string, chunks: MemoryChunk[]): void {
    const index: Map<string, Set<string>> = new Map();
    const chunkMap: Map<string, MemoryChunk> = new Map();
    for (const c of chunks) {
      chunkMap.set(c.id, c);
      for (const k of c.keywords || []) {
        if (!index.has(k)) index.set(k, new Set());
        index.get(k)!.add(c.id);
      }
    }
    this.memoryIndex.set(conversationId, index);
    this.memoryChunkMap.set(conversationId, chunkMap);
  }

  private scoreChunksByQuery(queryKeywords: string[], chunks: MemoryChunk[]): { chunk: MemoryChunk; score: number }[] {
    const scored: { chunk: MemoryChunk; score: number }[] = [];
    const index = this.memoryIndex.get(chunks[0] ? '' : '');
    if (!chunks || chunks.length === 0) return scored;

    let candidateIds: Set<string> | null = null;
    const convId = this.findConversationIdByChunks(chunks);
    const idx = convId ? this.memoryIndex.get(convId) : null;
    if (idx) {
      for (const k of queryKeywords) {
        const set = idx.get(k);
        if (!set) continue;
        candidateIds = candidateIds ? new Set([...candidateIds, ...set]) : new Set(set);
      }
    }

    const candidates = candidateIds
      ? chunks.filter(c => candidateIds!.has(c.id))
      : chunks;

    for (const c of candidates) {
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

  private findConversationIdByChunks(chunks: MemoryChunk[]): string | null {
    for (const [id, data] of this.conversations) {
      if (data.meta.memoryChunks === chunks) return id;
    }
    return null;
  }

  // 手动触发压缩
  compress(id: string): boolean {
    const data = this.conversations.get(id);
    if (!data) return false;

    this.compressConversation(id);
    this.save();
    return true;
  }

  // ========== 工具方法 ==========

  // 获取统计信息
  getStats(): { totalConversations: number; totalMessages: number; oldestConversation: string | null } {
    let totalMessages = 0;
    let oldest: Date | null = null;
    let oldestId: string | null = null;

    for (const [id, data] of this.conversations) {
      totalMessages += data.messages.length;
      const createdAt = new Date(data.meta.createdAt);
      if (!oldest || createdAt < oldest) {
        oldest = createdAt;
        oldestId = id;
      }
    }

    return {
      totalConversations: this.conversations.size,
      totalMessages,
      oldestConversation: oldestId
    };
  }

  // 清理旧会话（保留最近的 N 个）
  cleanup(keepCount: number = 50): number {
    const allMeta = this.getAllMeta();
    if (allMeta.length <= keepCount) return 0;

    const toDelete = allMeta.slice(keepCount);
    for (const meta of toDelete) {
      this.conversations.delete(meta.id);
    }

    this.save();
    console.log(`[Conversation] 已清理 ${toDelete.length} 个旧会话`);
    return toDelete.length;
  }
}

export default ConversationManager;
