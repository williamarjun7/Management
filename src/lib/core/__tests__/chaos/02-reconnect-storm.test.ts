import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCircuitState, resetCircuit, recordFailure } from '../../../services/circuit-breaker';
import { enqueueMutation, getMutationQueue } from '../../../services/mutation-queue';
import { queueDB } from '../../../services/queue-db';
import { clearAllMocks, setOnline } from '../setup';

describe('Chaos: Reconnect Storm — 5 rapid online/offline cycles', () => {
  beforeEach(async () => {
    clearAllMocks();
    resetCircuit();
    await queueDB.mutations.clear();
  });

  afterEach(async () => {
    await queueDB.mutations.clear();
  });

  it('should open circuit breaker after 10 recorded failures', async () => {
    let circuit = getCircuitState();
    expect(circuit.state).toBe('CLOSED');
    expect(circuit.failuresInWindow).toBe(0);

    for (let i = 0; i < 15; i++) {
      recordFailure();
    }

    circuit = getCircuitState();
    expect(circuit.state).toBe('OPEN');
    expect(circuit.failuresInWindow).toBeGreaterThanOrEqual(10);
  });

  it('should not lose queue items during online/offline toggling', async () => {
    const items = 20;
    for (let i = 0; i < items; i++) {
      await enqueueMutation('test_op', { i }, `storm-loss-key-${i}`);
    }

    for (let cycle = 0; cycle < 5; cycle++) {
      setOnline(false);
      await new Promise((r) => setTimeout(r, 20));
      setOnline(true);
      await new Promise((r) => setTimeout(r, 20));
    }

    const remaining = await getMutationQueue();
    expect(remaining.length).toBe(items);
  });
});
