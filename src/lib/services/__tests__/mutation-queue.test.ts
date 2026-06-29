import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queueDB } from '../queue-db';
import { clearAllMocks } from '../../core/__tests__/setup';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn(), getTabId: vi.fn(() => 'tab-1') },
  attachLogStore: vi.fn(),
}));

vi.mock('../telemetry', () => ({
  recordTelemetry: vi.fn(),
}));

vi.mock('../queue-leader', () => ({
  amILeader: vi.fn(() => true),
}));

vi.mock('../circuit-breaker', () => ({
  isCircuitOpen: vi.fn(() => false),
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
}));

describe('mutation-queue', () => {
  beforeEach(async () => {
    clearAllMocks();
    vi.clearAllMocks();
    await queueDB.mutations.clear();
    await queueDB.deadLetters.clear();
  });

  afterEach(async () => {
    await queueDB.mutations.clear();
    await queueDB.deadLetters.clear();
  });

  describe('enqueueMutation', () => {
    it('should enqueue and return an id', async () => {
      const { enqueueMutation } = await import('../mutation-queue');
      const id = await enqueueMutation('test_op', { foo: 'bar' }, 'idem-1');
      expect(id).toBeTruthy();
      const stored = await queueDB.mutations.get(id);
      expect(stored).toBeTruthy();
      expect(stored!.operation).toBe('test_op');
    });

    it('should deduplicate by idempotency key for pending items', async () => {
      const { enqueueMutation } = await import('../mutation-queue');
      const id1 = await enqueueMutation('op1', { a: 1 }, 'dup-key');
      const id2 = await enqueueMutation('op2', { b: 2 }, 'dup-key');
      expect(id2).toBe(id1);
      const count = await queueDB.mutations.count();
      expect(count).toBe(1);
    });

    it('should skip if idempotency key was already processed', async () => {
      const { enqueueMutation, markIdempotencyProcessed } = await import('../mutation-queue');
      markIdempotencyProcessed('processed-key');
      const id = await enqueueMutation('op', {}, 'processed-key');
      expect(id).toBe('');
    });
  });

  describe('getMutationQueue', () => {
    it('should return only pending and processing items', async () => {
      const { enqueueMutation, getMutationQueue } = await import('../mutation-queue');
      await enqueueMutation('op1', {}, 'k1');
      await enqueueMutation('op2', {}, 'k2');
      const all = await queueDB.mutations.toArray();
      await queueDB.mutations.update(all[0].id, { status: 'completed' });
      const queue = await getMutationQueue();
      expect(queue.length).toBe(1);
    });
  });

  describe('updateMutationStatus', () => {
    it('should update status and error', async () => {
      const { enqueueMutation, updateMutationStatus } = await import('../mutation-queue');
      const id = await enqueueMutation('op', {}, 'k-status');
      await updateMutationStatus(id, 'failed', 'Something went wrong');
      const stored = await queueDB.mutations.get(id);
      expect(stored!.status).toBe('failed');
      expect(stored!.lastError).toBe('Something went wrong');
    });
  });

  describe('getQueueHealth', () => {
    it('should report correct metrics', async () => {
      const { enqueueMutation, getQueueHealth } = await import('../mutation-queue');
      await enqueueMutation('op1', {}, 'health-k1');
      await enqueueMutation('op2', {}, 'health-k2');
      const health = await getQueueHealth();
      expect(health.queueSize).toBe(2);
      expect(health.pendingCount).toBe(2);
    });
  });

  describe('markIdempotencyProcessed / isIdempotencyProcessed', () => {
    it('should track and check processed keys', async () => {
      const { markIdempotencyProcessed, isIdempotencyProcessed } = await import('../mutation-queue');
      expect(isIdempotencyProcessed('some-key')).toBe(false);
      markIdempotencyProcessed('some-key');
      expect(isIdempotencyProcessed('some-key')).toBe(true);
    });
  });

  describe('retryFailedMutation', () => {
    it('should reset failed mutation to pending', async () => {
      const { enqueueMutation, retryFailedMutation } = await import('../mutation-queue');
      const id = await enqueueMutation('op', {}, 'retry-k');
      await queueDB.mutations.update(id, { status: 'failed', retryCount: 3, lastError: 'err' });
      await retryFailedMutation(id);
      const stored = await queueDB.mutations.get(id);
      expect(stored!.status).toBe('pending');
      expect(stored!.retryCount).toBe(0);
      expect(stored!.lastError).toBeNull();
    });
  });

  describe('clearCompletedMutations', () => {
    it('should remove completed mutations', async () => {
      const { enqueueMutation, clearCompletedMutations } = await import('../mutation-queue');
      const id = await enqueueMutation('op', {}, 'clear-k');
      await queueDB.mutations.update(id, { status: 'completed' });
      await clearCompletedMutations();
      const stored = await queueDB.mutations.get(id);
      expect(stored).toBeUndefined();
    });
  });

  describe('hasPendingMutations / getPendingCount / getFailedCount', () => {
    it('should report pending status', async () => {
      const { enqueueMutation, hasPendingMutations, getPendingCount, getFailedCount } = await import('../mutation-queue');
      expect(await hasPendingMutations()).toBe(false);
      await enqueueMutation('op', {}, 'check-k');
      expect(await hasPendingMutations()).toBe(true);
      expect(await getPendingCount()).toBe(1);
      expect(await getFailedCount()).toBe(0);
    });
  });

  describe('recoverStuckProcessingItems', () => {
    it('should recover items stuck in processing without startedAt', async () => {
      const { recoverStuckProcessingItems } = await import('../mutation-queue');
      await queueDB.mutations.add({
        id: 'stuck-1', operation: 'op', params: {}, idempotencyKey: 'k-stuck',
        status: 'processing', createdAt: new Date().toISOString(),
        retryCount: 0, lastError: null, version: 1,
      });
      const recovered = await recoverStuckProcessingItems();
      expect(recovered).toBeGreaterThanOrEqual(1);
      const stored = await queueDB.mutations.get('stuck-1');
      expect(stored!.status).toBe('pending');
    });
  });
});
