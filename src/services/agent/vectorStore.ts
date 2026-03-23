/**
 * 基于 SQLite 的向量存储
 * 用于 Agent 长期记忆
 */

import { getDatabase } from '../database';
import { MemoryEntry } from './types';

/**
 * 向量存储类
 * 使用内存缓存 + SQLite 持久化
 */
export class VectorStore {
  private db = getDatabase().getDb();
  private cache: Map<string, MemoryEntry> = new Map();
  private maxMemories: number = 1000;

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const rows = this.db.prepare(`
        SELECT * FROM memories ORDER BY importance DESC LIMIT ?
      `).all(this.maxMemories) as {
        id: string;
        content: string;
        embedding: Buffer | null;
        type: string;
        tags: string;
        importance: number;
        access_count: number;
        last_accessed: number;
        created_at: number;
        conversation_id: string | null;
        agent_id: string | null;
      }[];

      for (const row of rows) {
        let embedding: number[] | undefined;
        if (row.embedding) {
          try {
            embedding = Array.from(new Float64Array(row.embedding));
          } catch {
            // 忽略解析错误
          }
        }

        this.cache.set(row.id, {
          id: row.id,
          content: row.content,
          embedding,
          metadata: {
            type: row.type as MemoryEntry['metadata']['type'],
            tags: row.tags ? JSON.parse(row.tags) : [],
            timestamp: row.created_at,
            conversationId: row.conversation_id || undefined,
            agentId: row.agent_id || undefined
          },
          importance: row.importance,
          accessCount: row.access_count,
          lastAccessed: row.last_accessed
        });
      }
      console.log(`[VectorStore] 已从 SQLite 加载 ${this.cache.size} 条记忆`);
    } catch (e) {
      console.error('[VectorStore] 加载记忆失败:', e);
    }
  }

  /**
   * 简单的文本嵌入（基于词频）
   */
  private embed(text: string): number[] {
    const words = text.toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);

    const vector = new Array(128).fill(0);
    for (const word of words) {
      const hash = this.simpleHash(word);
      vector[hash % 128] += 1;
    }

    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vector.map(v => v / norm);
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * 余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  /**
   * 添加记忆
   */
  add(entry: Omit<MemoryEntry, 'id' | 'embedding' | 'accessCount' | 'lastAccessed'>): string {
    const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const embedding = this.embed(entry.content);
    const now = Date.now();

    // 转换为 Buffer 存储
    const embeddingBuffer = Buffer.from(new Float64Array(embedding).buffer);

    // 保存到 SQLite
    this.db.prepare(`
      INSERT INTO memories (id, content, embedding, type, tags, importance, access_count, last_accessed, created_at, conversation_id, agent_id)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `).run(
      id,
      entry.content,
      embeddingBuffer,
      entry.metadata.type,
      JSON.stringify(entry.metadata.tags),
      entry.importance,
      now,
      now,
      entry.metadata.conversationId || null,
      entry.metadata.agentId || null
    );

    // 更新缓存
    const fullEntry: MemoryEntry = {
      ...entry,
      id,
      embedding,
      accessCount: 0,
      lastAccessed: now
    };
    this.cache.set(id, fullEntry);

    // 检查是否需要清理
    if (this.cache.size > this.maxMemories) {
      this.evict();
    }

    return id;
  }

  /**
   * 检索相似记忆
   */
  search(query: string, limit: number = 5): MemoryEntry[] {
    const queryEmbedding = this.embed(query);
    const results: { entry: MemoryEntry; score: number }[] = [];

    for (const entry of this.cache.values()) {
      if (!entry.embedding) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);
      const recencyBoost = Math.exp(-(Date.now() - entry.lastAccessed) / (7 * 24 * 60 * 60 * 1000));
      const score = similarity * 0.7 + entry.importance * 0.2 + recencyBoost * 0.1;

      results.push({ entry, score });
    }

    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, limit);

    // 更新访问计数
    const now = Date.now();
    for (const { entry } of topResults) {
      entry.accessCount++;
      entry.lastAccessed = now;

      // 异步更新数据库
      this.db.prepare(`
        UPDATE memories SET access_count = ?, last_accessed = ? WHERE id = ?
      `).run(entry.accessCount, now, entry.id);
    }

    return topResults.map(r => r.entry);
  }

  /**
   * 按类型检索
   */
  getByType(type: MemoryEntry['metadata']['type'], limit: number = 10): MemoryEntry[] {
    return Array.from(this.cache.values())
      .filter(e => e.metadata.type === type)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  /**
   * 删除最不重要的记忆
   */
  private evict(): void {
    const entries = Array.from(this.cache.values());
    entries.sort((a, b) => {
      const scoreA = a.importance * 0.5 + (a.accessCount / 100) * 0.5;
      const scoreB = b.importance * 0.5 + (b.accessCount / 100) * 0.5;
      return scoreA - scoreB;
    });

    const toRemove = Math.ceil(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      const entry = entries[i];
      this.cache.delete(entry.id);
      this.db.prepare('DELETE FROM memories WHERE id = ?').run(entry.id);
    }
  }

  /**
   * 更新记忆重要性
   */
  updateImportance(id: string, importance: number): void {
    const entry = this.cache.get(id);
    if (entry) {
      entry.importance = Math.max(0, Math.min(1, importance));
      this.db.prepare('UPDATE memories SET importance = ? WHERE id = ?').run(entry.importance, id);
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): { total: number; cached: number } {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number } | undefined;
    return {
      total: row?.count || 0,
      cached: this.cache.size
    };
  }
}