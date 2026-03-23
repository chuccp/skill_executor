/**
 * 异步锁 - 用于保护临界区域的并发访问
 *
 * 用途：
 * - 防止上下文压缩与工具执行冲突
 * - 确保会话数据一致性
 */

export class AsyncLock {
  private locked = false;
  private queue: Array<() => void> = [];
  private lockHolder: string | null = null; // 调试：记录谁持有锁

  /**
   * 获取锁
   * 如果锁已被占用，则等待
   */
  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        this.lockHolder = new Error().stack?.split('\n')[2] || 'unknown';
        resolve();
      } else {
        // 加入等待队列
        this.queue.push(() => {
          this.locked = true;
          this.lockHolder = new Error().stack?.split('\n')[2] || 'unknown';
          resolve();
        });
      }
    });
  }

  /**
   * 释放锁，允许下一个等待者继续
   */
  release(): void {
    console.log('[AsyncLock] release() called, queue length:', this.queue.length, 'holder:', this.lockHolder);
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    } else {
      this.locked = false;
      this.lockHolder = null;
    }
  }

  /**
   * 执行临界区代码
   * 自动处理获取和释放锁
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * 尝试不阻塞获取锁
   * 如果锁忙则立即返回 false
   */
  tryAcquire(): boolean {
    if (!this.locked) {
      this.locked = true;
      return true;
    }
    return false;
  }

  /**
   * 获取锁状态
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * 获取等待队列长度
   */
  getWaitingCount(): number {
    return this.queue.length;
  }

  /**
   * 强制重置锁（用于异常恢复）
   */
  forceReset(): void {
    console.log('[AsyncLock] forceReset() called, was locked:', this.locked, 'holder:', this.lockHolder);
    this.locked = false;
    this.lockHolder = null;
    // 清空等待队列，通知所有等待者
    const waiters = this.queue;
    this.queue = [];
    waiters.forEach(resolve => resolve());
  }
}

/**
 * 全局锁管理器 - 为每个会话维护一个独立的锁
 */
export class LockManager {
  private locks = new Map<string, AsyncLock>();

  /**
   * 为会话获取或创建锁
   */
  getLock(conversationId: string): AsyncLock {
    if (!this.locks.has(conversationId)) {
      this.locks.set(conversationId, new AsyncLock());
    }
    return this.locks.get(conversationId)!;
  }

  /**
   * 清理不再使用的锁
   */
  releaseLock(conversationId: string): void {
    this.locks.delete(conversationId);
  }

  /**
   * 获取统计信息（用于调试）
   */
  getStats() {
    return {
      totalLocks: this.locks.size,
      lockedConversations: Array.from(this.locks.entries())
        .filter(([_, lock]) => lock.isLocked())
        .map(([id, lock]) => ({
          conversationId: id,
          waiting: lock.getWaitingCount()
        }))
    };
  }
}
