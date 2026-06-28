import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queueDB } from '../queue-db';
import { clearAllMocks } from '../../core/__tests__/setup';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() },
  attachLogStore: vi.fn(),
}));

describe('queue-db', () => {
  beforeEach(async () => {
    clearAllMocks();
    await queueDB.mutations.clear();
    await queueDB.deadLetters.clear();
  });

  afterEach(async () => {
    await queueDB.mutations.clear();
    await queueDB.deadLetters.clear();
  });

  describe('enqueueMutationTransactional', () => {
    it('should add a mutation to IndexedDB', async () => {
      const { enqueueMutationTransactional } = await import('../queue-db');

      const item = {
        id: 'test-1',
        operation: 'test_op',
        params: { foo: 'bar' },
        idempotencyKey: 'key-1',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        retryCount: 0,
        lastError: null,
        version: 1,
      };

      await enqueueMutationTransactional(item);
      const stored = await queueDB.mutations.get('test-1');
      expect(stored).toBeTruthy();
      expect(stored!.operation).toBe('test_op');
    });

    it('should not duplicate mutations with same pending idempotency key', async () => {
      const { enqueueMutationTransactional } = await import('../queue-db');

      const item = {
        id: 'test-2',
        operation: 'test_op',
        params: {},
        idempotencyKey: 'dup-key',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        retryCount: 0,
        lastError: null,
        version: 1,
      };

      await enqueueMutationTransactional(item);
      await enqueueMutationTransactional({ ...item, id: 'test-2b' });

      const count = await queueDB.mutations
        .where('idempotencyKey').equals('dup-key')
        .and(i => i.status === 'pending')
        .count();
      expect(count).toBe(1);
    });
  });

  describe('moveToDeadLetter', () => {
    it('should remove mutation and add dead letter entry', async () => {
      const { enqueueMutationTransactional, moveToDeadLetter } = await import('../queue-db');

      const item = {
        id: 'dl-1',
        operation: 'fail_op',
        params: {},
        idempotencyKey: 'dl-key',
        status: 'failed' as const,
        createdAt: new Date().toISOString(),
        retryCount: 5,
        lastError: 'Timeout',
        version: 1,
      };
      await enqueueMutationTransactional(item);
      await moveToDeadLetter(item);

      const stored = await queueDB.mutations.get('dl-1');
      expect(stored).toBeUndefined();

      const deadLetters = await queueDB.deadLetters.toArray();
      expect(deadLetters.length).toBe(1);
      expect(deadLetters[0].originalMutationId).toBe('dl-1');
      expect(deadLetters[0].lastError).toBe('Timeout');
    });
  });

  describe('checkQueueIntegrity', () => {
    it('should report valid for clean queue', async () => {
      const { checkQueueIntegrity } = await import('../queue-db');

      await queueDB.mutations.add({
        id: 'good-1', operation: 'op', params: {}, idempotencyKey: 'k1',
        status: 'pending', createdAt: new Date().toISOString(),
        retryCount: 0, lastError: null, version: 1,
      });

      const result = await checkQueueIntegrity();
      expect(result.valid).toBe(true);
      expect(result.totalItems).toBe(1);
    });

    it('should detect corrupted items', async () => {
      const { checkQueueIntegrity } = await import('../queue-db');

      await queueDB.mutations.add({
        id: 'bad-1', operation: '', params: {}, idempotencyKey: '',
        status: 'pending' as const, createdAt: new Date().toISOString(),
        retryCount: 0, lastError: null, version: 1,
      });

      const result = await checkQueueIntegrity();
      expect(result.valid).toBe(false);
      expect(result.corruptionCount).toBeGreaterThan(0);
    });
  });

  describe('recoverCorruptedQueue', () => {
    it('should remove corrupted items', async () => {
      const { checkQueueIntegrity, recoverCorruptedQueue } = await import('../queue-db');

      await queueDB.mutations.add({
        id: 'corrupt-1', operation: '', params: {}, idempotencyKey: '',
        status: 'pending' as const, createdAt: new Date().toISOString(),
        retryCount: 0, lastError: null, version: 1,
      });

      await recoverCorruptedQueue();
      const result = await checkQueueIntegrity();
      expect(result.valid).toBe(true);
    });
  });

  describe('migrateFromLocalStorage', () => {
    it('should return zero when no localStorage data', async () => {
      const { migrateFromLocalStorage } = await import('../queue-db');
      const result = await migrateFromLocalStorage();
      expect(result.migrated).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should migrate items from localStorage to IndexedDB', async () => {
      localStorage.setItem('highlands_mutation_queue', JSON.stringify([
        { id: 'ls-1', operation: 'migrated_op', params: {}, idempotencyKey: 'k1',
          status: 'pending', createdAt: new Date().toISOString(), retryCount: 0, lastError: null, version: 1 },
      ]));

      const { migrateFromLocalStorage } = await import('../queue-db');
      const result = await migrateFromLocalStorage();
      expect(result.migrated).toBe(1);

      const stored = await queueDB.mutations.get('ls-1');
      expect(stored).toBeTruthy();
    });
  });

  describe('verifyParity', () => {
    it('should report in-sync when both stores match', async () => {
      const { verifyParity } = await import('../queue-db');

      const item = {
        id: 'parity-1', operation: 'op', params: {}, idempotencyKey: 'k1',
        status: 'pending' as const, createdAt: new Date().toISOString(),
        retryCount: 0, lastError: null, version: 1,
      };
      await queueDB.mutations.add(item);
      localStorage.setItem('highlands_mutation_queue', JSON.stringify([item]));

      const result = await verifyParity();
      expect(result.inSync).toBe(true);
    });

    it('should detect mismatches', async () => {
      const { verifyParity } = await import('../queue-db');

      localStorage.setItem('highlands_mutation_queue', JSON.stringify([
        { id: 'ghost-1', status: 'pending', retryCount: 0 },
      ]));

      const result = await verifyParity();
      expect(result.inSync).toBe(false);
      expect(result.mismatches.length).toBeGreaterThan(0);
    });
  });
});
