import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { enqueueMutation } from '../../../services/mutation-queue';
import { queueDB } from '../../../services/queue-db';
import { clearAllMocks } from '../setup';

describe('Chaos: IndexedDB Quota Exhaustion — graceful degradation', () => {
  beforeEach(async () => {
    clearAllMocks();
    await queueDB.mutations.clear();
    await queueDB.deadLetters.clear();
  });

  afterEach(async () => {
    await queueDB.mutations.clear();
    await queueDB.deadLetters.clear();
    vi.restoreAllMocks();
  });

  it('should throw when IndexedDB add fails (QuotaExceededError)', async () => {
    vi.spyOn(queueDB.mutations, 'add').mockRejectedValueOnce(
      new DOMException('Quota exceeded', 'QuotaExceededError')
    );

    await expect(
      enqueueMutation('test_op', { data: 'quota-test' }, 'quota-key-1')
    ).rejects.toThrow();
  });

  it('should continue working after a transient IndexedDB failure', async () => {
    vi.spyOn(queueDB.mutations, 'add').mockRejectedValueOnce(
      new DOMException('Quota exceeded', 'QuotaExceededError')
    );

    await expect(
      enqueueMutation('test_op', { data: 'first-fail' }, 'quota-key-fail')
    ).rejects.toThrow();

    vi.restoreAllMocks();

    const itemId = await enqueueMutation('test_op', { data: 'second-success' }, 'quota-key-success');
    expect(itemId).toBeTruthy();
  });
});
