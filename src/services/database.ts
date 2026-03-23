import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

/**
 * SQLite 数据库服务
 * 提供统一的数据库访问接口
 */
export class DatabaseService {
  private db: Database.Database;
  private dbPath: string;

  constructor(dataDir: string = path.join(process.cwd(), 'data')) {
    // 确保数据目录存在
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = path.join(dataDir, 'skill_executor.db');
    this.db = new Database(this.dbPath);

    // 启用 WAL 模式提高并发性能
    this.db.pragma('journal_mode = WAL');

    // 初始化表结构
    this.initTables();
  }

  /**
   * 初始化数据库表
   */
  private initTables(): void {
    // 会话表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        message_count INTEGER DEFAULT 0,
        summary TEXT,
        first_user_message TEXT
      );
    `);

    // 消息表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT,
        thinking TEXT,
        tool_results TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    `);

    // 记忆表（向量存储）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding BLOB,
        type TEXT NOT NULL,
        tags TEXT,
        importance REAL DEFAULT 0.5,
        access_count INTEGER DEFAULT 0,
        last_accessed INTEGER,
        created_at INTEGER NOT NULL,
        conversation_id TEXT,
        agent_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
    `);

    // Agent 计划表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_plans (
        id TEXT PRIMARY KEY,
        goal TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        parent_conversation_id TEXT
      );
    `);

    // Agent 任务表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_tasks (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT DEFAULT 'medium',
        result TEXT,
        dependencies TEXT,
        assigned_to TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        FOREIGN KEY (plan_id) REFERENCES agent_plans(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_plan ON agent_tasks(plan_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON agent_tasks(status);
    `);

    // Agent 表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        task TEXT NOT NULL,
        status TEXT NOT NULL,
        result TEXT,
        conversation_id TEXT,
        parent_conversation_id TEXT NOT NULL,
        plan_id TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_conversation_id);
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    `);

    console.log(`[Database] 数据库初始化完成: ${this.dbPath}`);
  }

  /**
   * 获取数据库实例
   */
  getDb(): Database.Database {
    return this.db;
  }

  /**
   * 执行事务
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /**
   * 执行 SQL
   */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * 准备语句
   */
  prepare(sql: string): Database.Statement {
    return this.db.prepare(sql);
  }

  /**
   * 关闭数据库
   */
  close(): void {
    this.db.close();
    console.log('[Database] 数据库已关闭');
  }

  /**
   * 备份数据库
   */
  backup(backupPath: string): void {
    this.db.backup(backupPath);
    console.log(`[Database] 数据库已备份到: ${backupPath}`);
  }

  /**
   * 获取数据库统计信息
   */
  getStats(): {
    conversations: number;
    messages: number;
    memories: number;
    agents: number;
    plans: number;
  } {
    const conversations = this.db.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number };
    const messages = this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number };
    const memories = this.db.prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number };
    const agents = this.db.prepare('SELECT COUNT(*) as count FROM agents').get() as { count: number };
    const plans = this.db.prepare('SELECT COUNT(*) as count FROM agent_plans').get() as { count: number };

    return {
      conversations: conversations.count,
      messages: messages.count,
      memories: memories.count,
      agents: agents.count,
      plans: plans.count
    };
  }

  /**
   * 清理旧数据
   */
  cleanup(maxAgeDays: number = 30): { conversations: number; memories: number } {
    const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

    // 清理旧会话（保留有消息的）
    const conversationsResult = this.prepare(`
      DELETE FROM conversations
      WHERE updated_at < datetime(?, 'unixepoch', 'localtime')
      AND id NOT IN (SELECT DISTINCT conversation_id FROM messages)
    `).run(cutoffTime / 1000);

    // 清理低重要性的旧记忆
    const memoriesResult = this.prepare(`
      DELETE FROM memories
      WHERE created_at < ? AND importance < 0.3 AND access_count < 2
    `).run(cutoffTime);

    console.log(`[Database] 清理完成: ${conversationsResult.changes} 个会话, ${memoriesResult.changes} 条记忆`);

    return {
      conversations: conversationsResult.changes,
      memories: memoriesResult.changes
    };
  }
}

// 单例实例
let dbInstance: DatabaseService | null = null;

/**
 * 获取数据库实例（单例）
 */
export function getDatabase(dataDir?: string): DatabaseService {
  if (!dbInstance) {
    dbInstance = new DatabaseService(dataDir);
  }
  return dbInstance;
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}