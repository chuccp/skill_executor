import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';
import { createModuleLogger } from './tools/logger';

const logger = createModuleLogger('db');

/**
 * SQLite 数据库服务 (使用 sql.js - 纯 JavaScript 实现)
 * 提供统一的数据库访问接口
 */
export class DatabaseService {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  protected initialized: Promise<void>;

  constructor(dataDir: string = path.join(process.cwd(), 'data')) {
    this.dbPath = path.join(dataDir, 'skill_executor.db');
    
    // 异步初始化
    this.initialized = this.initDatabase(dataDir);
  }

  /**
   * 初始化数据库
   */
  private async initDatabase(dataDir: string): Promise<void> {
    // 确保数据目录存在
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const SQL = await initSqlJs();
    
    // 尝试加载现有数据库
    try {
      if (fs.existsSync(this.dbPath)) {
        const fileBuffer = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(fileBuffer);
      } else {
        this.db = new SQL.Database();
      }
    } catch (error) {
      logger.error('[Database] 加载数据库失败，创建新数据库:', error);
      this.db = new SQL.Database();
    }

    // 初始化表结构
    this.initTables();
    logger.info(`[Database] 数据库初始化完成：${this.dbPath}`);
  }

  /**
   * 等待数据库初始化完成
   */
  private async ensureInitialized(): Promise<void> {
    await this.initialized;
  }

  /**
   * 保存数据库到文件
   */
  private async saveToFile(): Promise<void> {
    if (!this.db) return;
    
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  /**
   * 初始化数据库表
   */
  private initTables(): void {
    if (!this.db) return;

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
  }

  /**
   * 获取数据库实例
   */
  async getDb(): Promise<SqlJsDatabase> {
    await this.ensureInitialized();
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  /**
   * 执行事务
   */
  async transaction<T>(fn: () => T): Promise<T> {
    const db = await this.getDb();
    try {
      db.exec('BEGIN TRANSACTION');
      const result = fn();
      db.exec('COMMIT');
      await this.saveToFile();
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * 执行 SQL
   */
  async exec(sql: string): Promise<void> {
    const db = await this.getDb();
    db.exec(sql);
    await this.saveToFile();
  }

  /**
   * 运行查询并返回结果
   */
  async run(sql: string, params?: any[]): Promise<any> {
    const db = await this.getDb();
    const stmt = db.prepare(sql);
    if (params) {
      stmt.bind(params);
    }
    const results: any[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  /**
   * 运行单个查询
   */
  async get(sql: string, params?: any[]): Promise<any | null> {
    const results = await this.run(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * 执行插入/更新/删除
   */
  async execute(sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowId: number }> {
    const db = await this.getDb();
    const stmt = db.prepare(sql);
    if (params) {
      stmt.bind(params);
    }
    stmt.step();
    const changes = db.getRowsModified();
    stmt.free();

    // 获取最后插入的 row ID
    const lastIdStmt = db.prepare('SELECT last_insert_rowid() as id');
    lastIdStmt.step();
    const lastIdResult = lastIdStmt.getAsObject() as { id: number };
    const lastInsertRowId = lastIdResult.id;
    lastIdStmt.free();

    await this.saveToFile();
    return { changes, lastInsertRowId };
  }

  /**
   * 关闭数据库
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.saveToFile();
      this.db.close();
      this.db = null;
      logger.info('[Database] 数据库已关闭');
    }
  }

  /**
   * 备份数据库
   */
  async backup(backupPath: string): Promise<void> {
    const db = await this.getDb();
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(backupPath, buffer);
    logger.info(`[Database] 数据库已备份到：${backupPath}`);
  }

  /**
   * 获取数据库统计信息
   */
  async getStats(): Promise<{
    conversations: number;
    messages: number;
    memories: number;
    agents: number;
    plans: number;
  }> {
    const conversations = await this.get('SELECT COUNT(*) as count FROM conversations');
    const messages = await this.get('SELECT COUNT(*) as count FROM messages');
    const memories = await this.get('SELECT COUNT(*) as count FROM memories');
    const agents = await this.get('SELECT COUNT(*) as count FROM agents');
    const plans = await this.get('SELECT COUNT(*) as count FROM agent_plans');

    return {
      conversations: conversations?.count || 0,
      messages: messages?.count || 0,
      memories: memories?.count || 0,
      agents: agents?.count || 0,
      plans: plans?.count || 0
    };
  }

  /**
   * 清理旧数据
   */
  async cleanup(maxAgeDays: number = 30): Promise<{ conversations: number; memories: number }> {
    const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

    // 清理旧会话（保留有消息的）
    const conversationsResult = await this.execute(`
      DELETE FROM conversations
      WHERE updated_at < datetime(?, 'unixepoch', 'localtime')
      AND id NOT IN (SELECT DISTINCT conversation_id FROM messages)
    `, [cutoffTime / 1000]);

    // 清理低重要性的旧记忆
    const memoriesResult = await this.execute(`
      DELETE FROM memories
      WHERE created_at < ? AND importance < 0.3 AND access_count < 2
    `, [cutoffTime]);

    logger.info(`[Database] 清理完成：${conversationsResult.changes} 个会话，${memoriesResult.changes} 条记忆`);

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
export async function getDatabase(dataDir?: string): Promise<DatabaseService> {
  if (!dbInstance) {
    dbInstance = new DatabaseService(dataDir);
  }
  await (dbInstance as any).initialized;
  return dbInstance;
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}
