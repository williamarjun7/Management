import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() },
  attachLogStore: vi.fn(),
}));

const STORAGE_KEY = 'highlands_circuit_state';

async function importModule() {
  vi.resetModules();
  return await import('../circuit-breaker');
}

describe('circuit-breaker', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  describe('initial state', () => {
    it('should start CLOSED with zero failures', async () => {
      const { getCircuitState } = await importModule();
      const state = getCircuitState();
      expect(state.state).toBe('CLOSED');
      expect(state.failuresInWindow).toBe(0);
      expect(state.probeInFlight).toBe(false);
    });
  });

  describe('recordFailure', () => {
    it('should increment failuresInWindow below threshold', async () => {
      const { recordFailure, getCircuitState } = await importModule();
      for (let i = 0; i < 5; i++) recordFailure();
      const state = getCircuitState();
      expect(state.state).toBe('CLOSED');
      expect(state.failuresInWindow).toBe(5);
    });

    it('should transition to OPEN when threshold is reached', async () => {
      const { recordFailure, getCircuitState } = await importModule();
      for (let i = 0; i < 10; i++) recordFailure();
      const state = getCircuitState();
      expect(state.state).toBe('OPEN');
    });

    it('should evict failures outside the failure window', async () => {
      const { recordFailure, getCircuitState } = await importModule();
      for (let i = 0; i < 9; i++) recordFailure();
      vi.advanceTimersByTime(31000);
      recordFailure();
      const state = getCircuitState();
      expect(state.state).toBe('CLOSED');
      expect(state.failuresInWindow).toBe(1);
    });

    it('should reopen circuit if failure occurs in HALF_OPEN', async () => {
      const cb = await importModule();
      for (let i = 0; i < 10; i++) cb.recordFailure();
      vi.advanceTimersByTime(31000);
      cb.isCircuitOpen();
      let state = cb.getCircuitState();
      expect(state.state).toBe('HALF_OPEN');
      cb.recordFailure();
      state = cb.getCircuitState();
      expect(state.state).toBe('OPEN');
    });
  });

  describe('recordSuccess', () => {
    it('should clear failures in CLOSED state', async () => {
      const cb = await importModule();
      for (let i = 0; i < 5; i++) cb.recordFailure();
      cb.recordSuccess();
      const state = cb.getCircuitState();
      expect(state.failuresInWindow).toBe(0);
    });

    it('should transition HALF_OPEN back to CLOSED', async () => {
      const cb = await importModule();
      for (let i = 0; i < 10; i++) cb.recordFailure();
      vi.advanceTimersByTime(31000);
      cb.isCircuitOpen();
      let state = cb.getCircuitState();
      expect(state.state).toBe('HALF_OPEN');
      cb.recordSuccess();
      state = cb.getCircuitState();
      expect(state.state).toBe('CLOSED');
      expect(state.failuresInWindow).toBe(0);
    });
  });

  describe('isCircuitOpen', () => {
    it('should return false when CLOSED', async () => {
      const { isCircuitOpen } = await importModule();
      expect(isCircuitOpen()).toBe(false);
    });

    it('should return true when OPEN', async () => {
      const cb = await importModule();
      for (let i = 0; i < 10; i++) cb.recordFailure();
      expect(cb.isCircuitOpen()).toBe(true);
    });

    it('should transition OPEN to HALF_OPEN after timeout', async () => {
      const cb = await importModule();
      for (let i = 0; i < 10; i++) cb.recordFailure();
      vi.advanceTimersByTime(31000);
      cb.isCircuitOpen();
      const state = cb.getCircuitState();
      expect(state.state).toBe('HALF_OPEN');
    });

    it('should transition to HALF_OPEN and block during cooldown', async () => {
      const cb = await importModule();
      for (let i = 0; i < 10; i++) cb.recordFailure();
      vi.advanceTimersByTime(31000);
      const first = cb.isCircuitOpen();
      expect(first).toBe(true);
      vi.advanceTimersByTime(11000);
      const second = cb.isCircuitOpen();
      expect(second).toBe(false);
      const third = cb.isCircuitOpen();
      expect(third).toBe(true);
    });

    it('should allow one probe after cooldown expires', async () => {
      const cb = await importModule();
      for (let i = 0; i < 10; i++) cb.recordFailure();
      vi.advanceTimersByTime(31000);
      cb.isCircuitOpen();
      vi.advanceTimersByTime(11000);
      const result = cb.isCircuitOpen();
      expect(result).toBe(false);
      const block = cb.isCircuitOpen();
      expect(block).toBe(true);
    });
  });

  describe('resetHalfOpenProbe', () => {
    it('should clear probe-in-flight flag', async () => {
      const cb = await importModule();
      for (let i = 0; i < 10; i++) cb.recordFailure();
      vi.advanceTimersByTime(31000);
      cb.isCircuitOpen();
      cb.resetHalfOpenProbe();
      const state = cb.getCircuitState();
      expect(state.probeInFlight).toBe(false);
    });
  });

  describe('resetCircuit', () => {
    it('should reset to CLOSED with zero failures', async () => {
      const cb = await importModule();
      for (let i = 0; i < 10; i++) cb.recordFailure();
      cb.resetCircuit();
      const state = cb.getCircuitState();
      expect(state.state).toBe('CLOSED');
      expect(state.failuresInWindow).toBe(0);
      expect(cb.isCircuitOpen()).toBe(false);
    });
  });

  describe('persistence', () => {
    it('should persist state to localStorage', async () => {
      const cb = await importModule();
      for (let i = 0; i < 10; i++) cb.recordFailure();
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.state).toBe('OPEN');
    });

    it('should recover OPEN state on module reload', async () => {
      let cb = await importModule();
      for (let i = 0; i < 10; i++) cb.recordFailure();
      cb = await importModule();
      const state = cb.getCircuitState();
      expect(state.state).toBe('OPEN');
    });
  });

  describe('cross-tab sync', () => {
    it('should update state when storage event fires', async () => {
      const cb = await importModule();
      const event = new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: JSON.stringify({
          state: 'OPEN', failureTimestamps: [Date.now()],
          openUntil: Date.now() + 30000, halfOpenSince: 0, halfOpenProbeInFlight: false,
        }),
      });
      window.dispatchEvent(event);
      const state = cb.getCircuitState();
      expect(state.state).toBe('OPEN');
    });

    it('should handle corrupted cross-tab data gracefully', async () => {
      const cb = await importModule();
      const event = new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: 'not-json',
      });
      window.dispatchEvent(event);
      const state = cb.getCircuitState();
      expect(state.state).toBe('CLOSED');
    });
  });
});
