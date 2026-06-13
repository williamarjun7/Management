// ── Lightweight synchronization primitives ──

export interface Mutex {
  acquire: () => Promise<() => void>;
  isLocked: () => boolean;
}

export function createMutex(): Mutex {
  let locked = false;
  const waiters: Array<() => void> = [];

  return {
    acquire: async (): Promise<() => void> => {
      if (!locked) {
        locked = true;
        let released = false;
        return () => {
          if (!released) {
            released = true;
            locked = false;
            const next = waiters.shift();
            if (next) {
              locked = true;
              next();
            }
          }
        };
      }
      return new Promise((resolve) => {
        waiters.push(() => {
          locked = true;
          let released = false;
          resolve(() => {
            if (!released) {
              released = true;
              locked = false;
              const next = waiters.shift();
              if (next) {
                locked = true;
                next();
              }
            }
          });
        });
      });
    },
    isLocked: () => locked,
  };
}

const pendingInvalidations = new Set<string>();
let flushScheduled = false;
let invalidateFn: ((key: string[]) => void) | null = null;

export function setInvalidateFn(fn: (keys: string[]) => void): void {
  invalidateFn = fn;
}

function scheduleFlush(): void {
  if (flushScheduled || !invalidateFn) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    const keys = Array.from(pendingInvalidations);
    pendingInvalidations.clear();
    invalidateFn?.(keys);
  });
}

export function debouncedInvalidate(key: string): void {
  pendingInvalidations.add(key);
  scheduleFlush();
}

export function debouncedInvalidateMany(keys: string[]): void {
  for (const k of keys) pendingInvalidations.add(k);
  scheduleFlush();
}

export function backoffWithJitter(retryCount: number, baseMs: number, maxMs: number): number {
  const exp = Math.min(baseMs * Math.pow(2, retryCount), maxMs);
  const jitter = exp * 0.2 * Math.random();
  return Math.round(exp + jitter);
}

export class LruSet<T> {
  private items: Set<T>;
  private maxSize: number;

  constructor(maxSize: number) {
    this.items = new Set();
    this.maxSize = maxSize;
  }

  add(value: T): void {
    if (this.items.size >= this.maxSize) {
      const first = this.items.values().next().value;
      if (first !== undefined) this.items.delete(first);
    }
    this.items.add(value);
  }

  has(value: T): boolean {
    return this.items.has(value);
  }

  delete(value: T): void {
    this.items.delete(value);
  }

  clear(): void {
    this.items.clear();
  }

  get size(): number {
    return this.items.size;
  }
}
