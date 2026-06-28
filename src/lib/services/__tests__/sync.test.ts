import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMutex, backoffWithJitter, LruSet, setInvalidateFn, debouncedInvalidate, debouncedInvalidateMany } from '../sync';

beforeEach(() => {
  vi.useFakeTimers();
});

describe('createMutex', () => {
  it('should allow sequential acquisition and release', async () => {
    const mutex = createMutex();
    expect(mutex.isLocked()).toBe(false);

    const release1 = await mutex.acquire();
    expect(mutex.isLocked()).toBe(true);

    release1();
    expect(mutex.isLocked()).toBe(false);
  });

  it('should queue waiters and wake them in order', async () => {
    const mutex = createMutex();
    const order: number[] = [];

    const release1 = await mutex.acquire();
    order.push(1);

    const p2 = mutex.acquire().then((release) => { order.push(2); release(); });
    mutex.acquire().then((release) => { order.push(3); release(); });

    expect(order).toEqual([1]);
    release1();

    await p2;
    expect(order).toEqual([1, 2]);
  });

  it('should only release once (idempotent release)', async () => {
    const mutex = createMutex();
    const release = await mutex.acquire();
    release();
    release();
    expect(mutex.isLocked()).toBe(false);
  });
});

describe('backoffWithJitter', () => {
  it('should produce exponential backoff with jitter', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = backoffWithJitter(2, 1000, 30000);
    const expected = Math.round(4000 + 4000 * 0.2 * 0.5);
    expect(result).toBe(expected);
  });

  it('should cap at maxMs', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = backoffWithJitter(20, 1000, 30000);
    expect(result).toBe(30000);
  });
});

describe('LruSet', () => {
  it('should evict oldest items when at capacity', () => {
    const set = new LruSet<string>(3);
    set.add('a');
    set.add('b');
    set.add('c');
    set.add('d');
    expect(set.has('a')).toBe(false);
    expect(set.has('b')).toBe(true);
    expect(set.has('c')).toBe(true);
    expect(set.has('d')).toBe(true);
  });

  it('should report correct size', () => {
    const set = new LruSet<string>(5);
    set.add('x');
    set.add('y');
    expect(set.size).toBe(2);
  });

  it('should support delete and clear', () => {
    const set = new LruSet<string>(5);
    set.add('a');
    set.add('b');
    set.delete('a');
    expect(set.has('a')).toBe(false);
    set.clear();
    expect(set.size).toBe(0);
  });
});

describe('debouncedInvalidate', () => {
  it('should call invalidateFn with deduplicated keys via microtask', async () => {
    const fn = vi.fn();
    setInvalidateFn(fn);

    debouncedInvalidate('orders');
    debouncedInvalidate('orders');
    debouncedInvalidate('menu');

    await vi.runAllTimersAsync();

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(['orders', 'menu']);
  });

  it('should handle debouncedInvalidateMany', async () => {
    const fn = vi.fn();
    setInvalidateFn(fn);

    debouncedInvalidateMany(['a', 'b']);
    debouncedInvalidateMany(['b', 'c']);

    await vi.runAllTimersAsync();

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(['a', 'b', 'c']);
  });
});
