import { logger } from './logger';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

const STORAGE_KEY = 'highlands_circuit_state';

const FAILURE_THRESHOLD = 10;
const FAILURE_WINDOW_MS = 30000;
const OPEN_TIMEOUT_MS = 30000;
const HALF_OPEN_COOLDOWN_MS = 10000;

let state: CircuitState = 'CLOSED';
let failureTimestamps: number[] = [];
let openUntil: number = 0;
let halfOpenSince: number = 0;
let halfOpenProbeInFlight = false;

export function getCircuitState(): { state: CircuitState; failuresInWindow: number; probeInFlight: boolean } {
  return {
    state,
    failuresInWindow: failureTimestamps.length,
    probeInFlight: halfOpenProbeInFlight,
  };
}

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      state, failureTimestamps, openUntil, halfOpenSince, halfOpenProbeInFlight,
    }));
  } catch { /* silent */ }
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      state = data.state;
      failureTimestamps = (data.failureTimestamps || []).filter(
        (t: number) => Date.now() - t < FAILURE_WINDOW_MS
      );
      openUntil = data.openUntil || 0;
      halfOpenSince = data.halfOpenSince || 0;
      halfOpenProbeInFlight = data.halfOpenProbeInFlight || false;
    }
  } catch { /* corrupted — start fresh */ }
}

loadPersistedState();

// Sync circuit state across tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue !== null) {
      try {
        const data = JSON.parse(e.newValue);
        state = data.state;
        failureTimestamps = (data.failureTimestamps || []).filter(
          (t: number) => Date.now() - t < FAILURE_WINDOW_MS
        );
        openUntil = data.openUntil || 0;
        halfOpenSince = data.halfOpenSince || 0;
        halfOpenProbeInFlight = data.halfOpenProbeInFlight || false;
      } catch { /* corrupted — ignore cross-tab update */ }
    }
  });
}

export function recordFailure(): void {
  const now = Date.now();
  failureTimestamps.push(now);
  failureTimestamps = failureTimestamps.filter(t => now - t < FAILURE_WINDOW_MS);

  logger.warn('circuit_failure_recorded', 'circuit-breaker', {
    metadata: { failuresInWindow: failureTimestamps.length, threshold: FAILURE_THRESHOLD },
    retryCount: failureTimestamps.length,
  });

  if (failureTimestamps.length >= FAILURE_THRESHOLD && state === 'CLOSED') {
    state = 'OPEN';
    openUntil = now + OPEN_TIMEOUT_MS;
    halfOpenProbeInFlight = false;
    logger.error('circuit_opened', 'circuit-breaker', {
      metadata: { openUntil: new Date(openUntil).toISOString() },
      operation: 'circuit_open',
    });
  }

  if (state === 'HALF_OPEN') {
    state = 'OPEN';
    openUntil = now + OPEN_TIMEOUT_MS;
    halfOpenProbeInFlight = false;
    logger.error('circuit_reopened_probe_failed', 'circuit-breaker', {
      metadata: { openUntil: new Date(openUntil).toISOString() },
    });
  }

  persistState();
}

export function recordSuccess(): void {
  if (state === 'HALF_OPEN') {
    state = 'CLOSED';
    failureTimestamps = [];
    halfOpenProbeInFlight = false;
    logger.info('circuit_closed_recovered', 'circuit-breaker', {
      operation: 'circuit_close',
    });
  }
  if (state === 'CLOSED') {
    failureTimestamps = [];
  }
  persistState();
}

export function isCircuitOpen(): boolean {
  const now = Date.now();

  if (state === 'OPEN' && now >= openUntil) {
    state = 'HALF_OPEN';
    halfOpenSince = now;
    halfOpenProbeInFlight = false;
    logger.info('circuit_half_open', 'circuit-breaker');
    persistState();
  }

  if (state === 'HALF_OPEN') {
    if (now - halfOpenSince < HALF_OPEN_COOLDOWN_MS) return true;
    if (halfOpenProbeInFlight) return true;
    halfOpenProbeInFlight = true;
    persistState();
    return false;
  }

  return state === 'OPEN';
}

export function resetHalfOpenProbe(): void {
  if (state === 'HALF_OPEN') {
    halfOpenProbeInFlight = false;
  }
}

export function resetCircuit(): void {
  state = 'CLOSED';
  failureTimestamps = [];
  openUntil = 0;
  halfOpenSince = 0;
  halfOpenProbeInFlight = false;
  persistState();
  logger.info('circuit_manually_reset', 'circuit-breaker');
}
