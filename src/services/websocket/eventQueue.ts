/**
 * RxJS 流处理器
 * 用于处理 LLM 流式响应和工具调用
 */

import { Subject, Observable, from, merge, Subscription } from 'rxjs';
import {
  filter,
  bufferTime,
  mergeMap,
  takeUntil,
  takeWhile,
  tap,
  catchError,
  finalize,
  map
} from 'rxjs/operators';
import { createModuleLogger } from '../tools/logger';
import { TOOL_CONCURRENCY, TOOL_TEXT_BUFFER_MS } from '../../config/constants';

const logger = createModuleLogger('stream');

// ==================== 类型定义 ====================

export interface StreamEvent {
  type: 'text' | 'thinking' | 'tool_use' | 'usage' | 'error' | 'done' | 'tool_result' | 'tools_done';
  payload: any;
  timestamp: number;
}

export interface StreamProcessorOptions {
  /** 工具执行并发数 */
  concurrency?: number;
  /** 文本批处理间隔(ms) */
  textBufferTime?: number;
  /** 是否启用调试日志 */
  debug?: boolean;
}

export type EventHandler = (event: StreamEvent) => Promise<void> | void;

// ==================== RxJS 流处理器 ====================

export class StreamProcessor {
  private event$ = new Subject<StreamEvent>();
  private stop$ = new Subject<void>();
  private toolsDone$ = new Subject<void>();
  private subscription: Subscription;
  private options: Required<StreamProcessorOptions>;
  private handlers: Map<string, EventHandler[]> = new Map();
  private isStopped = false;
  private pendingToolCount = 0; // 跟踪待完成的工具数
  private completedToolCount = 0; // 跟踪已完成的工具数

  constructor(options: StreamProcessorOptions = {}) {
    this.options = {
      concurrency: options.concurrency ?? TOOL_CONCURRENCY,
      textBufferTime: options.textBufferTime ?? TOOL_TEXT_BUFFER_MS,
      debug: options.debug ?? false
    };

    this.subscription = this.setupPipeline();
    logger.info('[StreamProcessor] 已初始化', this.options);
  }

  /**
   * 设置处理管道
   */
  private setupPipeline(): Subscription {
    // 文本流 -> 批量发送
    const text$ = this.event$.pipe(
      filter(e => e.type === 'text'),
      bufferTime(this.options.textBufferTime),
      filter(arr => arr.length > 0),
      tap(events => {
        const combined = events.map(e => e.payload).join('');
        this.executeHandlers('text', { type: 'text', payload: combined, timestamp: Date.now() });
      })
    );

    // 思考流 -> 直接发送
    const thinking$ = this.event$.pipe(
      filter(e => e.type === 'thinking'),
      tap(event => this.executeHandlers('thinking', event))
    );

    // Usage 流 -> 直接发送
    const usage$ = this.event$.pipe(
      filter(e => e.type === 'usage'),
      tap(event => this.executeHandlers('usage', event))
    );

    // 错误流 -> 停止并通知
    const error$ = this.event$.pipe(
      filter(e => e.type === 'error'),
      tap(event => {
        logger.error('[StreamProcessor] 错误:', event.payload);
        this.executeHandlers('error', event);
        this.stop();
      })
    );

    // 完成流 -> 仅通知，不停止（让调用方控制停止时机）
    const done$ = this.event$.pipe(
      filter(e => e.type === 'done'),
      tap(event => {
        logger.info('[StreamProcessor] 完成:', event.payload);
        this.executeHandlers('done', event);
        // 不在这里停止，让缓冲区的事件有时间处理完
      })
    );

    // 工具执行流 -> 并发执行
    const tool$ = this.event$.pipe(
      filter(e => e.type === 'tool_result'),
      mergeMap(async (event) => {
        await this.executeToolBatch(event);
        // 工具执行完成后发出 tools_done 信号
        this.completedToolCount++;
        this.toolsDone$.next();
        return event;
      }, this.options.concurrency)
    );

    // 合并所有流
    return merge(text$, thinking$, usage$, error$, done$, tool$)
      .pipe(
        takeUntil(this.stop$),
        catchError(err => {
          logger.error('[StreamProcessor] 管道错误:', err);
          throw err;
        }),
        finalize(() => {
          logger.info('[StreamProcessor] 管道已关闭');
        })
      )
      .subscribe({
        error: err => logger.error('[StreamProcessor] 订阅错误:', err)
      });
  }

  /**
   * 执行处理器
   */
  private async executeHandlers(type: string, event: StreamEvent): Promise<void> {
    const handlers = this.handlers.get(type) || [];
    const wildcardHandlers = this.handlers.get('*') || [];
    const allHandlers = [...handlers, ...wildcardHandlers];

    if (this.options.debug) {
      logger.debug(`[StreamProcessor] 执行 ${allHandlers.length} 个处理器 for ${type}`);
    }

    await Promise.all(allHandlers.map(h => h(event)));
  }

  /**
   * 执行工具批次
   */
  private async executeToolBatch(event: StreamEvent): Promise<void> {
    await this.executeHandlers('tool_result', event);
  }

  /**
   * 注册事件处理器
   */
  on(eventType: string, handler: EventHandler): this {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
    return this;
  }

  /**
   * 推送事件
   */
  push(event: Omit<StreamEvent, 'timestamp'>): boolean {
    // 不检查 isStopped，让事件进入管道
    // 管道会用 takeUntil 和 takeWhile 控制是否处理
    this.event$.next({
      ...event,
      timestamp: Date.now()
    });

    return true;
  }

  /**
   * 推送文本
   */
  pushText(content: string): void {
    this.push({ type: 'text', payload: content });
  }

  /**
   * 推送思考
   */
  pushThinking(content: string): void {
    this.push({ type: 'thinking', payload: content });
  }

  /**
   * 推送工具结果
   */
  pushToolResult(toolCalls: any[], iteration?: number): void {
    this.pendingToolCount += toolCalls.length;
    this.push({ type: 'tool_result', payload: { toolCalls, iteration } });
  }

  /**
   * 推送 Usage
   */
  pushUsage(usage: any): void {
    this.push({ type: 'usage', payload: usage });
  }

  /**
   * 推送错误
   */
  pushError(error: string): void {
    this.push({ type: 'error', payload: error });
  }

  /**
   * 推送完成
   */
  pushDone(reason?: string): void {
    this.push({ type: 'done', payload: { reason } });
  }

  /**
   * 从 Observable 创建
   */
  fromObservable<T>(source: Observable<T>, transformer: (value: T) => StreamEvent | null): void {
    source.pipe(
      map(transformer),
      filter((e): e is StreamEvent => e !== null),
      takeUntil(this.stop$)
    ).subscribe({
      next: event => this.push(event),
      error: err => this.pushError(err.message)
    });
  }

  /**
   * 停止处理器
   */
  async stop(): Promise<void> {
    if (this.isStopped) return;

    // 完成 event$，阻止新事件进入，同时触发缓冲区刷新
    this.event$.complete();

    // 等待缓冲区刷新（bufferTime 缓存的事件会被处理）
    await this.flush();

    // 发出停止信号，结束管道
    this.stop$.next();
    this.toolsDone$.complete();

    // 最后标记停止
    this.isStopped = true;
    logger.info('[StreamProcessor] 已停止');
  }

  /**
   * 等待工具执行完成（不停止处理器）
   * @param count 需要等待完成的工具数量
   * @param timeout 超时时间
   */
  async waitForTools(count: number = 1, timeout: number = 60000): Promise<boolean> {
    if (count <= 0) return true;

    // 检查是否已经全部完成
    if (this.completedToolCount >= this.pendingToolCount) {
      return true;
    }

    const startCompleted = this.completedToolCount;
    const targetCompleted = startCompleted + count;

    return new Promise(resolve => {
      const timer = setTimeout(() => {
        subscription.unsubscribe();
        logger.warn(`[StreamProcessor] 工具等待超时 (完成 ${this.completedToolCount - startCompleted}/${count})`);
        resolve(false);
      }, timeout);

      const subscription = this.toolsDone$.subscribe({
        next: () => {
          if (this.completedToolCount >= targetCompleted) {
            clearTimeout(timer);
            subscription.unsubscribe();
            resolve(true);
          }
        },
        complete: () => {
          clearTimeout(timer);
          resolve(true);
        }
      });
    });
  }

  /**
   * 重置工具计数器（新迭代开始时调用）
   */
  resetToolCounters(): void {
    this.pendingToolCount = 0;
    this.completedToolCount = 0;
  }

  /**
   * 等待缓冲区刷新（用于停止前确保所有事件处理完）
   */
  async flush(timeout: number = 200): Promise<void> {
    // 等待至少一个 bufferTime 周期，让缓冲的文本事件处理完
    await new Promise(resolve => setTimeout(resolve, timeout));
  }

  /**
   * 等待处理器完全停止
   */
  async waitUntilComplete(timeout: number = 60000): Promise<boolean> {
    // 先刷新缓冲区
    await this.flush();

    return new Promise(resolve => {
      const timer = setTimeout(() => {
        resolve(false);
      }, timeout);

      this.stop$.subscribe({
        complete: () => {
          clearTimeout(timer);
          resolve(true);
        }
      });
    });
  }

  /**
   * 获取状态
   */
  getStatus(): { isStopped: boolean; hasHandlers: boolean } {
    return {
      isStopped: this.isStopped,
      hasHandlers: this.handlers.size > 0
    };
  }
}

// ==================== 处理器管理器 ====================

export class ProcessorManager {
  private processors: Map<string, StreamProcessor> = new Map();

  /**
   * 创建或获取处理器
   * 如果处理器已停止，会创建新的
   */
  get(id: string, options?: StreamProcessorOptions): StreamProcessor {
    const existing = this.processors.get(id);

    // 如果存在且未停止，直接返回
    if (existing && !existing.getStatus().isStopped) {
      return existing;
    }

    // 否则创建新的
    if (existing) {
      logger.info(`[ProcessorManager] 处理器 ${id} 已停止，创建新的`);
    }
    const processor = new StreamProcessor(options);
    this.processors.set(id, processor);
    return processor;
  }

  /**
   * 停止并移除处理器
   */
  async stop(id: string): Promise<boolean> {
    const processor = this.processors.get(id);
    if (processor) {
      await processor.stop();
      this.processors.delete(id);
      return true;
    }
    return false;
  }

  /**
   * 停止所有处理器
   */
  async stopAll(): Promise<void> {
    for (const [id, processor] of this.processors) {
      await processor.stop();
      this.processors.delete(id);
    }
  }

  /**
   * 获取所有状态
   */
  getAllStatus(): Record<string, ReturnType<StreamProcessor['getStatus']>> {
    const status: Record<string, ReturnType<StreamProcessor['getStatus']>> = {};
    for (const [id, processor] of this.processors) {
      status[id] = processor.getStatus();
    }
    return status;
  }
}

// 导出全局实例
export const processorManager = new ProcessorManager();