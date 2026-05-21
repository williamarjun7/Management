import { logger } from './logger';
import { recordTelemetry } from './telemetry';

// ── Brute-force detection ──

interface AuthAttempt {
  count: number;
  firstAttempt: number;
  locked: boolean;
}

const MAX_RATE_LIMIT_ENTRIES = 500;
const attemptStore = new Map<string, AuthAttempt>();
const BRUTE_THRESHOLD = 5;
const BRUTE_WINDOW_MS = 300000;
const LOCKOUT_DURATION_MS = 900000;

export function recordAuthAttempt(identifier: string, success: boolean): void {
  if (success) {
    attemptStore.delete(identifier);
    return;
  }

  const now = Date.now();
  let entry = attemptStore.get(identifier);
  if (!entry || now - entry.firstAttempt > BRUTE_WINDOW_MS) {
    entry = { count: 1, firstAttempt: now, locked: false };
    attemptStore.set(identifier, entry);
  } else {
    entry.count++;
  }

  if (entry.count >= BRUTE_THRESHOLD && !entry.locked) {
    entry.locked = true;
    entry.firstAttempt = now;
    recordTelemetry('suspicious_activity', crypto.randomUUID(), {
      type: 'brute_force',
      identifier,
      attempts: entry.count,
      windowMs: BRUTE_WINDOW_MS,
    });
    logger.warn('brute_force_detected', 'security', {
      metadata: { identifier, attempts: entry.count },
    });
  }
}

export function isLockedOut(identifier: string): boolean {
  const entry = attemptStore.get(identifier);
  if (!entry || !entry.locked) return false;
  if (Date.now() - entry.firstAttempt > LOCKOUT_DURATION_MS) {
    attemptStore.delete(identifier);
    return false;
  }
  return true;
}

export function getLockoutRemainingMs(identifier: string): number {
  const entry = attemptStore.get(identifier);
  if (!entry || !entry.locked) return 0;
  return Math.max(0, LOCKOUT_DURATION_MS - (Date.now() - entry.firstAttempt));
}

// ── Rate limiting ──

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function evictStaleRateLimits(): void {
  if (rateLimitStore.size <= MAX_RATE_LIMIT_ENTRIES) return;
  const toDelete = rateLimitStore.size - MAX_RATE_LIMIT_ENTRIES;
  const iter = rateLimitStore.keys();
  for (let i = 0; i < toDelete; i++) {
    const key = iter.next();
    if (key.done) break;
    rateLimitStore.delete(key.value);
  }
}

export function checkRateLimit(key: string, maxRequests = 30, windowMs = 60000): boolean {
  const now = Date.now();
  let entry = rateLimitStore.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { count: 1, windowStart: now };
    rateLimitStore.set(key, entry);
    evictStaleRateLimits();
    return true;
  }
  entry.count++;
  if (entry.count > maxRequests) {
    recordTelemetry('rate_limit_exceeded', crypto.randomUUID(), { key, count: entry.count, windowMs });
    logger.warn('rate_limit_exceeded', 'security', {
      metadata: { key, count: entry.count },
    });
    return false;
  }
  return true;
}

export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}

// ── Suspicious activity telemetry ──

export function reportSuspiciousActivity(type: string, detail: string, metadata?: Record<string, unknown>): void {
  recordTelemetry('suspicious_activity', crypto.randomUUID(), { type, detail, ...metadata });
  logger.warn('suspicious_activity', 'security', {
    metadata: { type, detail, ...metadata },
  });
}

// ── CSP violation reporting ──

let originalFetch: typeof window.fetch | null = null;

export function setupCspReporter(): () => void {
  if (typeof document === 'undefined' || originalFetch) return () => {};
  originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    if (typeof input === 'string' && input.includes('/csp-report')) {
      try {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        reportSuspiciousActivity('csp_violation', 'CSP violation reported', {
          body,
        });
      } catch { /* parse error */ }
      return new Response(null, { status: 204 });
    }
    return originalFetch!(input, init);
  };
  return () => {
    if (originalFetch) {
      window.fetch = originalFetch;
      originalFetch = null;
    }
  };
}
