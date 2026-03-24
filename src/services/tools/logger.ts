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

// ==================== 模块日志器 ====================

/**
 * 创建模块日志器
 * 返回一个兼容 console 调用方式的日志对象
 */
export function createModuleLogger(moduleName: string) {
  const childLogger = logger.child({ module: moduleName });

  // 创建兼容 console 调用方式的包装器
  const formatMessage = (args: any[]): [string, any?] => {
    if (args.length === 0) return ['', undefined];
    if (args.length === 1) {
      const first = args[0];
      if (typeof first === 'string') return [first, undefined];
      return ['', first];
    }

    // 多个参数时，格式化为字符串
    const msg = args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }).join(' ');

    return [msg, undefined];
  };

  return {
    trace: (...args: any[]) => {
      const [msg, obj] = formatMessage(args);
      return obj !== undefined ? childLogger.trace(obj, msg) : childLogger.trace(msg);
    },
    debug: (...args: any[]) => {
      const [msg, obj] = formatMessage(args);
      return obj !== undefined ? childLogger.debug(obj, msg) : childLogger.debug(msg);
    },
    info: (...args: any[]) => {
      const [msg, obj] = formatMessage(args);
      return obj !== undefined ? childLogger.info(obj, msg) : childLogger.info(msg);
    },
    warn: (...args: any[]) => {
      const [msg, obj] = formatMessage(args);
      return obj !== undefined ? childLogger.warn(obj, msg) : childLogger.warn(msg);
    },
    error: (...args: any[]) => {
      const [msg, obj] = formatMessage(args);
      return obj !== undefined ? childLogger.error(obj, msg) : childLogger.error(msg);
    },
    fatal: (...args: any[]) => {
      const [msg, obj] = formatMessage(args);
      return obj !== undefined ? childLogger.fatal(obj, msg) : childLogger.fatal(msg);
    },
    child: (bindings: Record<string, any>) => childLogger.child(bindings)
  };
}

export default logger;