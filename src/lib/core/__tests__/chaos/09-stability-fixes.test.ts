import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { enqueueMutation, getMutationQueue, markIdempotencyProcessed, isIdempotencyProcessed } from '../../../services/mutation-queue';
import { queueDB, moveToDeadLetter } from '../../../services/queue-db';
import { getCircuitState, resetCircuit, recordFailure } from '../../../services/circuit-breaker';
import { getFeatureFlags, resetFeatureFlags } from '../../../services/feature-flags';
import { clearAllMocks } from '../setup';

describe('Chaos: Stability Fix Verification', () => {
  beforeEach(async () => {
    clearAllMocks();
    resetCircuit();
    resetFeatureFlags();
    await queueDB.mutations.clear();
    await queueDB.deadLetters.clear();
  });

  afterEach(async () => {
    await queueDB.mutations.clear();
    await queueDB.deadLetters.clear();
  });

  describe('C1: Billing Idempotency Key Stability', () => {
    it('should return the same id for the same idempotency key on repeated calls', async () => {
      const firstId = await enqueueMutation('process_payment', { amount: 50 }, 'billing-key-1');
      const secondId = await enqueueMutation('process_payment', { amount: 50 }, 'billing-key-1');
      expect(secondId).toBe(firstId);
    });

    it('should return different IDs for different idempotency keys', async () => {
      const id1 = await enqueueMutation('process_payment', { amount: 50 }, 'billing-key-a');
      const id2 = await enqueueMutation('process_payment', { amount: 100 }, 'billing-key-b');
      expect(id1).not.toBe(id2);
    });

    it('should handle rapid serial duplicate submissions with the same idempotency key', async () => {
      const firstId = await enqueueMutation('process_payment', { amount: 50 }, 'billing-rapid-key');
      const secondId = await enqueueMutation('process_payment', { amount: 50 }, 'billing-rapid-key');
      const thirdId = await enqueueMutation('process_payment', { amount: 50 }, 'billing-rapid-key');
      expect(firstId).toBeTruthy();
      expect(secondId).toBe(firstId);
      expect(thirdId).toBe(firstId);
    });
  });

  describe('H4: Dead Letter Flow', () => {
    it('should move a failed mutation to dead letters table', async () => {
      await enqueueMutation('test_op', {}, 'dead-letter-key-1');
      const items = await getMutationQueue();
      expect(items.length).toBe(1);

      const item = items[0];
      item.lastError = 'test error: max retries exceeded';
      await moveToDeadLetter(item);

      const remaining = await getMutationQueue();
      expect(remaining.length).toBe(0);

      const dead = await queueDB.deadLetters.toArray();
      expect(dead.length).toBe(1);
      expect(dead[0].originalMutationId).toBe(items[0].id);
      expect(dead[0].lastError).toContain('max retries exceeded');
    });

    it('should preserve operation and params in dead letter entry', async () => {
      const params = { orderId: 'ord-123', amount: 75.5, items: ['coffee', 'sandwich'] };
      await enqueueMutation('process_payment', params, 'dead-letter-preserve-key');
      const items = await getMutationQueue();

      items[0].lastError = 'payment provider timeout';
      await moveToDeadLetter(items[0]);

      const dead = await queueDB.deadLetters.toArray();
      expect(dead.length).toBe(1);
      expect(dead[0].operation).toBe('process_payment');
      expect(dead[0].params).toEqual(params);
      expect(dead[0].failCount).toBeGreaterThanOrEqual(0);
    });

    it('should not affect other items when moving to dead letter', async () => {
      await enqueueMutation('test_op', {}, 'dl-other-key-1');
      await enqueueMutation('test_op', {}, 'dl-other-key-2');
      await enqueueMutation('test_op', {}, 'dl-other-key-3');

      const allItems = await getMutationQueue();
      allItems[1].lastError = 'isolated failure';
      await moveToDeadLetter(allItems[1]);

      const remaining = await getMutationQueue();
      expect(remaining.length).toBe(2);

      const dead = await queueDB.deadLetters.toArray();
      expect(dead.length).toBe(1);
    });
  });

  describe('M10/M11/M12: Cross-Tab State Synchronization via localStorage', () => {
    it('should synchronize circuit breaker state via storage event', async () => {
      recordFailure();
      recordFailure();
      recordFailure();
      const before = getCircuitState();
      expect(before.failuresInWindow).toBe(3);

      const storageKey = 'highlands_circuit_state';
      const now = Date.now();
      const timestamps = Array.from({ length: 15 }, (_, i) => now - i * 1000);
      const payload = JSON.stringify({
        state: 'OPEN',
        failureTimestamps: timestamps,
        openUntil: now + 60000,
        halfOpenSince: 0,
        halfOpenProbeInFlight: false,
      });
      localStorage.setItem(storageKey, payload);
      window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: payload }));

      await new Promise((r) => setTimeout(r, 10));
      const after = getCircuitState();
      expect(after.state).toBe('OPEN');
      expect(after.failuresInWindow).toBe(15);
    });

    it('should reset feature flags when storage event fires with flag change', async () => {
      const flags1 = await getFeatureFlags();
      expect(flags1).toBeDefined();

      const flagPayload = JSON.stringify({
        indexDbEnabled: false,
        dualWriteEnabled: false,
        circuitBreakerEnabled: false,
        realtimeReplayEnabled: false,
        sentryReplayEnabled: false,
        queueProcessingEnabled: false,
        chaosModeEnabled: true,
      });
      localStorage.setItem('highlands_feature_flags', flagPayload);
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'highlands_feature_flags',
        newValue: flagPayload,
      }));

      await new Promise((r) => setTimeout(r, 10));
      const flags2 = await getFeatureFlags();
      expect(flags2.chaosMode).toBe(true);
    });

    it('should ignore storage events for unrelated keys', async () => {
      const before = getCircuitState();
      expect(before.state).toBe('CLOSED');

      window.dispatchEvent(new StorageEvent('storage', {
        key: 'unrelated_key',
        newValue: 'some_value',
      }));

      await new Promise((r) => setTimeout(r, 10));
      const after = getCircuitState();
      expect(after.state).toBe('CLOSED');
    });

    it('should ignore circuit storage events with null newValue (deleted key)', async () => {
      recordFailure();
      const before = getCircuitState();
      expect(before.failuresInWindow).toBe(1);

      window.dispatchEvent(new StorageEvent('storage', {
        key: 'highlands_circuit_state',
        newValue: null,
      }));

      await new Promise((r) => setTimeout(r, 10));
      const after = getCircuitState();
      expect(after.failuresInWindow).toBe(1);
    });
  });

  describe('Mark-Then-Process Order (H3)', () => {
    it('should mark idempotency as processed before status write', async () => {
      const key = 'h3-order-key';
      expect(isIdempotencyProcessed(key)).toBe(false);

      markIdempotencyProcessed(key);
      expect(isIdempotencyProcessed(key)).toBe(true);
    });

    it('should skip already-processed idempotency keys on enqueue', async () => {
      const key = 'h3-skip-key';
      markIdempotencyProcessed(key);

      const result = await enqueueMutation('test_op', {}, key);
      expect(result).toBe('');
    });
  });

  describe('Idempotency Set Capacity (M3)', () => {
    it('should track processed keys up to capacity', () => {
      for (let i = 0; i < 600; i++) {
        markIdempotencyProcessed(`capacity-key-${i}`);
      }

      expect(isIdempotencyProcessed('capacity-key-0')).toBe(false);
      expect(isIdempotencyProcessed('capacity-key-499')).toBe(true);
      expect(isIdempotencyProcessed('capacity-key-599')).toBe(true);
    });
  });
});
