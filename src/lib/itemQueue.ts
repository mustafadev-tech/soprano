export interface QueuedItem {
  key: string;
  tempId: string;
  menu_item_id: string;
  quantity: number;
  note?: string;
  addedAt: number;
}

export class ItemSyncQueue {
  private pendingQueue = new Map<string, QueuedItem>();
  private flushingQueue = new Map<string, QueuedItem>();
  private canceledKeys = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private activeFlush: Promise<void> | null = null;
  private readonly debounceMs: number | null;

  constructor(debounceMs: number | null = 10000) {
    this.debounceMs = debounceMs;
  }

  private mergeQueuedItem(queue: Map<string, QueuedItem>, item: QueuedItem) {
    const existing = queue.get(item.key);

    if (existing) {
      queue.set(item.key, {
        ...existing,
        quantity: item.quantity,
        note: item.note ?? existing.note,
        addedAt: item.addedAt,
        tempId: item.tempId,
        menu_item_id: item.menu_item_id,
      });
      return;
    }

    queue.set(item.key, item);
  }

  private scheduleFlush(onFlush: (items: QueuedItem[]) => Promise<void>) {
    if (this.debounceMs === null) {
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      void this.flush(onFlush).catch(() => {
        // Background sync failures are handled by the caller via store state and toasts.
      });
    }, Math.max(this.debounceMs, 0));
  }

  add(item: QueuedItem, onFlush: (items: QueuedItem[]) => Promise<void>) {
    this.canceledKeys.delete(item.key);
    this.mergeQueuedItem(this.pendingQueue, item);
    this.scheduleFlush(onFlush);
  }

  async flush(onFlush: (items: QueuedItem[]) => Promise<void>) {
    if (this.activeFlush) {
      await this.activeFlush;
      return;
    }

    if (this.pendingQueue.size === 0) {
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
    }

    const items = Array.from(this.pendingQueue.values());
    this.pendingQueue.clear();
    this.flushingQueue = new Map(items.map((item) => [item.key, item]));
    this.timer = null;

    this.activeFlush = (async () => {
      try {
        await onFlush(items);
        this.flushingQueue.clear();
      } catch (error) {
        for (const queuedItem of this.flushingQueue.values()) {
          this.mergeQueuedItem(this.pendingQueue, queuedItem);
        }

        this.flushingQueue.clear();
        throw error;
      } finally {
        this.activeFlush = null;
      }
    })();

    await this.activeFlush;
  }

  hasPending(): boolean {
    return this.pendingQueue.size > 0 || this.flushingQueue.size > 0;
  }

  get(key: string): QueuedItem | undefined {
    return this.pendingQueue.get(key) ?? this.flushingQueue.get(key);
  }

  entries(): QueuedItem[] {
    return [...this.pendingQueue.values(), ...this.flushingQueue.values()];
  }

  remove(key: string) {
    const removedPending = this.pendingQueue.delete(key);

    if (this.flushingQueue.has(key)) {
      this.canceledKeys.add(key);
      return;
    }

    if (removedPending) {
      this.canceledKeys.delete(key);
    }
  }

  consumeCanceled(items: QueuedItem[]): QueuedItem[] {
    const canceledItems = items.filter((item) => this.canceledKeys.has(item.key));

    for (const item of canceledItems) {
      this.canceledKeys.delete(item.key);
    }

    return canceledItems;
  }

  clear() {
    this.pendingQueue.clear();
    this.flushingQueue.clear();
    this.canceledKeys.clear();

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = null;
  }
}
