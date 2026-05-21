import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCircuitState, resetCircuit, recordFailure } from '../../../services/circuit-breaker';
import { enqueueMutation, getMutationQueue } from '../../../services/mutation-queue';
import { queueDB } from '../../../services/queue-db';
import { clearAllMocks } from '../setup';

describe('Chaos: Delayed RPC Responses — timeout handling', () => {
  beforeEach(async () => {
    clearAllMocks();
    resetCircuit();
    await queueDB.mutations.clear();
  });

  afterEach(async () => {
    await queueDB.mutations.clear();
  });

  it('should open circuit breaker after repeated recorded failures (simulating timeouts)', async () => {
    let circuit = getCircuitState();
    expect(circuit.state).toBe('CLOSED');

    for (let i = 0; i < 15; i++) {
      recordFailure();
    }

    circuit = getCircuitState();
    expect(circuit.state).toBe('OPEN');
    expect(circuit.failuresInWindow).toBeGreaterThanOrEqual(10);
  });

  it('should accumulate failure count across batches (simulating multiple timeout windows)', async () => {
    for (let batch = 0; batch < 3; batch++) {
      for (let i = 0; i < 4; i++) {
        recordFailure();
      }
    }

    const circuit = getCircuitState();
    expect(circuit.state).toBe('OPEN');
    expect(circuit.failuresInWindow).toBe(12);
  });

  it('should track mutations in queue as pending without processing', async () => {
    for (let i = 0; i < 5; i++) {
      await enqueueMutation('test_op', { i }, `queue-key-${i}`);
    }

    const items = await getMutationQueue();
    expect(items.length).toBe(5);
    expect(items.every((i) => i.status === 'pending')).toBe(true);
    expect(items.every((i) => i.retryCount === 0)).toBe(true);
  });
});
