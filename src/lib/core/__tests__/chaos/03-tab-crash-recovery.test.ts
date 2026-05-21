import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { recoverStuckProcessingItems } from '../../../services/mutation-queue';
import { queueDB, moveToDeadLetter } from '../../../services/queue-db';
import { clearAllMocks } from '../setup';

describe('Chaos: Tab Crash During Payment — recovery correctness', () => {
  beforeEach(async () => {
    clearAllMocks();
    await queueDB.mutations.clear();
    await queueDB.deadLetters.clear();
  });

  afterEach(async () => {
    await queueDB.mutations.clear();
    await queueDB.deadLetters.clear();
  });

  it('should recover items stuck in processing state (simulating tab crash)', async () => {
    await queueDB.mutations.add({
      id: 'stuck-item-1',
      operation: 'process_payment',
      params: { amount: 100, invoice_id: 'inv-1' },
      idempotencyKey: 'crash-key-1',
      status: 'processing',
      createdAt: new Date(Date.now() - 180000).toISOString(),
      retryCount: 0,
      lastError: null,
      version: 1,
      processingStartedAt: new Date(Date.now() - 180000).toISOString(),
      processorTabId: 'dead-tab-id',
    });

    await queueDB.mutations.add({
      id: 'stuck-item-2',
      operation: 'process_payment',
      params: { amount: 200, invoice_id: 'inv-2' },
      idempotencyKey: 'crash-key-2',
      status: 'processing',
      createdAt: new Date(Date.now() - 120000).toISOString(),
      retryCount: 0,
      lastError: null,
      version: 1,
      processingStartedAt: new Date(Date.now() - 120000).toISOString(),
      processorTabId: 'dead-tab-id',
    });

    const recovered = await recoverStuckProcessingItems();
    expect(recovered).toBe(2);

    const items = await queueDB.mutations
      .where('status')
      .equals('pending')
      .toArray();
    expect(items.length).toBe(2);
    expect(items.every((i) => i.status === 'pending')).toBe(true);
    expect(items.every((i) => i.processingStartedAt === undefined)).toBe(true);
    expect(items.every((i) => i.processorTabId === undefined)).toBe(true);
  });

  it('should NOT recover items that are still within the processing timeout window', async () => {
    await queueDB.mutations.add({
      id: 'recent-item',
      operation: 'process_payment',
      params: { amount: 50, invoice_id: 'inv-3' },
      idempotencyKey: 'recent-key',
      status: 'processing',
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
      version: 1,
      processingStartedAt: new Date(Date.now() - 30000).toISOString(),
      processorTabId: 'still-active-tab',
    });

    const recovered = await recoverStuckProcessingItems();
    expect(recovered).toBe(0);

    const items = await queueDB.mutations
      .where('status')
      .equals('processing')
      .toArray();
    expect(items.length).toBe(1);
  });

  it('should move items to dead letter via moveToDeadLetter', async () => {
    await queueDB.mutations.add({
      id: 'dl-test-item',
      operation: 'process_payment',
      params: { amount: 300, invoice_id: 'inv-4' },
      idempotencyKey: 'dl-key',
      status: 'failed',
      createdAt: new Date().toISOString(),
      retryCount: 5,
      lastError: 'permanent_failure',
      version: 1,
    });

    const item = await queueDB.mutations.get('dl-test-item');
    expect(item).toBeDefined();

    await moveToDeadLetter(item!);

    const inMutations = await queueDB.mutations.get('dl-test-item');
    expect(inMutations).toBeUndefined();

    const deadLetters = await queueDB.deadLetters.toArray();
    expect(deadLetters.length).toBe(1);
    expect(deadLetters[0].originalMutationId).toBe('dl-test-item');
    expect(deadLetters[0].failCount).toBe(5);
    expect(deadLetters[0].lastError).toBe('permanent_failure');
  });
});
