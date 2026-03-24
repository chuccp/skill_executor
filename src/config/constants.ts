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

// ==================== LLM 调用配置 ====================

export const LLM_MAX_ITERATIONS = 200000; // WebSocket 处理最大迭代轮数
export const AGENT_MAX_ITERATIONS = 10000; // Agent 最大迭代轮数

// ==================== 工具执行配置 ====================

export const TOOL_CONCURRENCY = 3; // 工具并行执行数
export const TOOL_TEXT_BUFFER_MS = 50; // 文本流批处理间隔（毫秒）
export const TOOL_WAIT_TIMEOUT_MS = 600000; // 工具执行等待超时（10分钟）
export const PROCESSOR_COMPLETE_TIMEOUT_MS = 50000; // 处理器完成等待超时

// ==================== 命令执行配置 ====================

export const COMMAND_TIMEOUT_MS = 60000; // 命令执行默认超时（1分钟）

// ==================== Web 请求配置 ====================

export const WEB_SEARCH_TIMEOUT_MS = 10000; // 网络搜索超时
export const WEB_SEARCH_MAX_RESULTS = 10; // 网络搜索最大结果数
export const WEB_FETCH_TIMEOUT_MS = 15000; // 网页获取超时
export const WEB_FETCH_MAX_CONTENT_LENGTH = 20000; // 网页获取最大内容长度
export const HTTP_TIMEOUT_MS = 30000; // HTTP 请求默认超时
export const HTTP_MAX_RETRIES = 2; // HTTP 请求最大重试次数

// ==================== Agent 配置 ====================

export const AGENT_COMPLETION_TIMEOUT_MS = 300000; // Agent 完成等待超时（5分钟）