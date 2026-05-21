import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { enqueueMutation } from '../../../services/mutation-queue';
import { queueDB, verifyParity, shouldDisableLocalStorage, checkQueueIntegrity, recoverCorruptedQueue } from '../../../services/queue-db';
import { clearAllMocks } from '../setup';

describe('Chaos: Dual-Write Mismatch Injection — migration safety', () => {
  beforeEach(async () => {
    clearAllMocks();
    await queueDB.mutations.clear();
  });

  afterEach(async () => {
    await queueDB.mutations.clear();
    localStorage.removeItem('highlands_mutation_queue');
    localStorage.removeItem('highlands_parity_checks');
  });

  it('should detect mismatch when localStorage is corrupted while IndexedDB is intact', async () => {
    for (let i = 0; i < 5; i++) {
      await enqueueMutation('test_op', { i }, `parity-key-${i}`);
    }

    const corrupted = [{ id: 'fake-1', operation: 'test_op', params: {}, idempotencyKey: 'fake', status: 'pending' }];
    localStorage.setItem('highlands_mutation_queue', JSON.stringify(corrupted));

    const parity = await verifyParity();
    expect(parity.inSync).toBe(false);
    expect(parity.mismatches.length).toBeGreaterThan(0);
  });

  it('should NOT disable localStorage dual-write after detecting a mismatch', async () => {
    for (let i = 0; i < 5; i++) {
      await enqueueMutation('test_op', { i }, `disable-key-${i}`);
    }

    const corrupted = [{ id: 'bad-item', operation: 'test_op', params: {}, idempotencyKey: 'bad', status: 'pending' }];
    localStorage.setItem('highlands_mutation_queue', JSON.stringify(corrupted));

    for (let i = 0; i < 12; i++) {
      const shouldDisable = await shouldDisableLocalStorage();
      if (i < 10) {
        expect(shouldDisable).toBe(false);
      }
    }

    const result = await shouldDisableLocalStorage();
    expect(result).toBe(false);
  });

  it('should recover from corruption by removing invalid entries', async () => {
    await queueDB.mutations.add({
      id: 'corrupt-1',
      operation: '',
      params: {},
      idempotencyKey: '',
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
      version: 1,
    });

    const integrity = await checkQueueIntegrity();
    expect(integrity.valid).toBe(false);

    await recoverCorruptedQueue();

    const after = await checkQueueIntegrity();
    expect(after.valid).toBe(true);
  });
});
