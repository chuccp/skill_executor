/**
 * 全局配置常量
 */

// ==================== 会话配置 ====================

export const MAX_MESSAGE_LENGTH = 8000; // 单条消息最大长度
export const MAX_MESSAGES_PER_CONVERSATION = 200; // 每个会话最大消息数
export const SUMMARIZE_THRESHOLD = 100; // 触发压缩的消息数阈值
export const WORKING_MEMORY_SIZE = 20; // 工作记忆保留最近消息数

// ==================== 上下文压缩配置 ====================

export const CONTEXT_PERCENT_THRESHOLD = 80; // 触发压缩的上下文使用百分比阈值
export const CONTEXT_CHAR_BUDGET = 20000; // 工作记忆字符预算（近似）

// ==================== 记忆系统配置 ====================

export const MEMORY_CHUNK_SIZE = 10; // 记忆切片包含的消息数
export const RETRIEVAL_LIMIT = 3; // 召回的记忆片段数量
export const MAX_MEMORY_CHUNKS = 60; // 单会话最大记忆片段数
export const MEMORY_TTL_DAYS = 30; // 记忆片段过期天数
export const INDEX_SAVE_DEBOUNCE_MS = 1000; // 索引保存防抖时间