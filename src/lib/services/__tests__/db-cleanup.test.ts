import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queueDB } from '../queue-db';
import { clearAllMocks } from '../../core/__tests__/setup';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() },
  attachLogStore: vi.fn(),
}));

describe('db-cleanup', () => {
  beforeEach(async () => {
    clearAllMocks();
    await queueDB.mutations.clear();
    await queueDB.telemetry.clear();
  });

  afterEach(async () => {
    await queueDB.mutations.clear();
    await queueDB.telemetry.clear();
  });

  describe('runCleanup', () => {
    it('should remove old telemetry entries', async () => {
      const { runCleanup } = await import('../db-cleanup');

      const oldDate = new Date(Date.now() - 40 * 86400000).toISOString();
      const recentDate = new Date().toISOString();

      await queueDB.telemetry.bulkAdd([
        { type: 'test', key: 'old', payload: {}, tabId: 't1', deviceId: 'd1', timestamp: oldDate },
        { type: 'test', key: 'recent', payload: {}, tabId: 't1', deviceId: 'd1', timestamp: recentDate },
      ]);

      const result = await runCleanup({ telemetryRetentionDays: 30 });

      expect(result.telemetryRemoved).toBe(1);
      const remaining = await queueDB.telemetry.toArray();
      expect(remaining.length).toBe(1);
      expect(remaining[0].key).toBe('recent');
    });

    it('should remove old completed mutations', async () => {
      const { runCleanup } = await import('../db-cleanup');

      const oldDate = new Date(Date.now() - 14 * 86400000).toISOString();
      const recentDate = new Date().toISOString();

      await queueDB.mutations.bulkAdd([
        { id: 'old-1', operation: 'test', params: {}, idempotencyKey: 'k1', status: 'completed', createdAt: oldDate, retryCount: 0, lastError: null, version: 1 },
        { id: 'recent-1', operation: 'test', params: {}, idempotencyKey: 'k2', status: 'completed', createdAt: recentDate, retryCount: 0, lastError: null, version: 1 },
        { id: 'pending-1', operation: 'test', params: {}, idempotencyKey: 'k3', status: 'pending', createdAt: oldDate, retryCount: 0, lastError: null, version: 1 },
      ]);

      const result = await runCleanup({ mutationRetentionDays: 7 });

      expect(result.completedMutationsRemoved).toBe(1);
      const remaining = await queueDB.mutations.toArray();
      expect(remaining.length).toBe(2);
    });

    it('should return zero counts when nothing to clean', async () => {
      const { runCleanup } = await import('../db-cleanup');
      const result = await runCleanup();
      expect(result.telemetryRemoved).toBe(0);
      expect(result.completedMutationsRemoved).toBe(0);
    });
  });

  describe('scheduleCleanup', () => {
    it('should run cleanup on interval and return a cancel function', async () => {
      vi.useFakeTimers();
      const { runCleanup, scheduleCleanup } = await import('../db-cleanup');

      const cancel = await scheduleCleanup(1000);
      expect(typeof cancel).toBe('function');

      await vi.advanceTimersByTimeAsync(1000);
      cancel();

      vi.useRealTimers();
    });
  });
});
