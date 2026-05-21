import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { enqueueMutation, getQueueHealth, getMutationQueue } from '../../../services/mutation-queue';
import { queueDB } from '../../../services/queue-db';
import { clearAllMocks } from '../setup';

describe('Chaos: Queue Pressure — 100 offline queued orders', () => {
  beforeEach(async () => {
    clearAllMocks();
    await queueDB.mutations.clear();
    await queueDB.deadLetters.clear();
  });

  afterEach(async () => {
    await queueDB.mutations.clear();
    await queueDB.deadLetters.clear();
  });

  it('should enqueue 100 mutations and report correct queue health metrics', async () => {
    const BATCH = 100;

    for (let i = 0; i < BATCH; i++) {
      await enqueueMutation('test_op', { itemId: i, value: `data-${i}` }, `pressure-key-${i}`);
    }

    const health = await getQueueHealth();
    expect(health.queueSize).toBe(BATCH);
    expect(health.pendingCount).toBe(BATCH);

    const all = await getMutationQueue();
    expect(all.length).toBe(BATCH);
    const ids = new Set(all.map((i) => i.id));
    expect(ids.size).toBe(BATCH);
  });

  it('should not lose items when queue has mixed statuses', async () => {
    for (let i = 0; i < 50; i++) {
      await enqueueMutation('test_op', { i }, `mixed-key-${i}`);
    }

    const all = await getMutationQueue();
    expect(all.length).toBe(50);

    const statuses = ['pending', 'processing', 'failed', 'dead', 'completed'] as const;
    for (let i = 0; i < all.length; i++) {
      const item = all[i];
      await queueDB.mutations.update(item.id, {
        status: statuses[i % statuses.length],
      });
    }

    const updated = await getMutationQueue();
    const pendingCount = updated.filter((i) => i.status === 'pending').length;
    expect(pendingCount).toBeGreaterThan(0);

    const health = await getQueueHealth();
    expect(health.pendingCount).toBe(pendingCount);
  });
});
