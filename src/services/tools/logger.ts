/**
 * 结构化日志工具
 * 使用 pino 提供高性能日志记录
 */

import pino from 'pino';

// ==================== 日志配置 ====================

export interface LoggerOptions {
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  pretty?: boolean;
  name?: string;
}

// ==================== 创建日志实例 ====================

export function createLogger(options: LoggerOptions = {}) {
  const { level = 'info', pretty = process.env.NODE_ENV !== 'production', name = 'app' } = options;

  const transport = pretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      }
    : undefined;

  return pino({
    name,
    level,
    transport
  });
}

// ==================== 默认日志实例 ====================

export const logger = createLogger({
  level: (process.env.LOG_LEVEL as any) || 'info',
  pretty: true
});

// ==================== 便捷方法 ====================

export const log = {
  trace: (msg: string, ...args: any[]) => logger.trace(msg, ...args),
  debug: (msg: string, ...args: any[]) => logger.debug(msg, ...args),
  info: (msg: string, ...args: any[]) => logger.info(msg, ...args),
  warn: (msg: string, ...args: any[]) => logger.warn(msg, ...args),
  error: (msg: string, ...args: any[]) => logger.error(msg, ...args),
  fatal: (msg: string, ...args: any[]) => logger.fatal(msg, ...args),

  // 带上下文的日志
  child: (bindings: Record<string, any>) => logger.child(bindings)
};

// ==================== 模块日志器 ====================

export function createModuleLogger(moduleName: string) {
  return logger.child({ module: moduleName });
}

export default logger;