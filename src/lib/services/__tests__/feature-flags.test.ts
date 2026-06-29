import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function freshImport() {
  vi.resetModules();
  return await import('../feature-flags');
}

describe('feature-flags', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('getFeatureFlags', () => {
    it('should return defaults when no overrides exist', async () => {
      const { getFeatureFlags } = await freshImport();
      const flags = getFeatureFlags();
      expect(flags.indexDbMode).toBe(true);
      expect(flags.dualWriteMode).toBe(true);
      expect(flags.circuitBreaker).toBe(true);
      expect(flags.realtimeReplay).toBe(true);
      expect(flags.sentryReplay).toBe(true);
      expect(flags.queueProcessing).toBe(true);
      expect(flags.chaosMode).toBe(false);
    });

    it('should apply localStorage overrides', async () => {
      localStorage.setItem('highlands_feature_flags', JSON.stringify({ chaosMode: true, circuitBreaker: false }));
      const { getFeatureFlags } = await freshImport();
      const flags = getFeatureFlags();
      expect(flags.chaosMode).toBe(true);
      expect(flags.circuitBreaker).toBe(false);
      expect(flags.indexDbMode).toBe(true);
    });
  });

  describe('setFeatureFlag', () => {
    it('should persist and retrieve a flag override', async () => {
      const { setFeatureFlag, getFeatureFlags } = await freshImport();
      setFeatureFlag('chaosMode', true);
      const flags = getFeatureFlags();
      expect(flags.chaosMode).toBe(true);
    });
  });

  describe('resetFeatureFlags', () => {
    it('should clear all overrides and restore defaults', async () => {
      const { setFeatureFlag, resetFeatureFlags, getFeatureFlags } = await freshImport();
      setFeatureFlag('chaosMode', true);
      resetFeatureFlags();
      const flags = getFeatureFlags();
      expect(flags.chaosMode).toBe(false);
    });
  });

  describe('helper functions', () => {
    it('isChaosModeEnabled should reflect current flag state', async () => {
      const { isChaosModeEnabled, setFeatureFlag } = await freshImport();
      expect(isChaosModeEnabled()).toBe(false);
      setFeatureFlag('chaosMode', true);
      expect(isChaosModeEnabled()).toBe(true);
    });

    it('isIndexDbEnabled should reflect current flag state', async () => {
      const { isIndexDbEnabled, setFeatureFlag } = await freshImport();
      expect(isIndexDbEnabled()).toBe(true);
      setFeatureFlag('indexDbMode', false);
      expect(isIndexDbEnabled()).toBe(false);
    });

    it('isDualWriteEnabled should reflect current flag state', async () => {
      const { isDualWriteEnabled, setFeatureFlag } = await freshImport();
      expect(isDualWriteEnabled()).toBe(true);
      setFeatureFlag('dualWriteMode', false);
      expect(isDualWriteEnabled()).toBe(false);
    });

    it('isCircuitBreakerEnabled should reflect current flag state', async () => {
      const { isCircuitBreakerEnabled, setFeatureFlag } = await freshImport();
      expect(isCircuitBreakerEnabled()).toBe(true);
      setFeatureFlag('circuitBreaker', false);
      expect(isCircuitBreakerEnabled()).toBe(false);
    });

    it('isRealtimeReplayEnabled should reflect current flag state', async () => {
      const { isRealtimeReplayEnabled, setFeatureFlag } = await freshImport();
      expect(isRealtimeReplayEnabled()).toBe(true);
      setFeatureFlag('realtimeReplay', false);
      expect(isRealtimeReplayEnabled()).toBe(false);
    });

    it('isQueueProcessingEnabled should reflect current flag state', async () => {
      const { isQueueProcessingEnabled, setFeatureFlag } = await freshImport();
      expect(isQueueProcessingEnabled()).toBe(true);
      setFeatureFlag('queueProcessing', false);
      expect(isQueueProcessingEnabled()).toBe(false);
    });

    it('isSentryReplayEnabled should reflect current flag state', async () => {
      const { isSentryReplayEnabled, setFeatureFlag } = await freshImport();
      expect(isSentryReplayEnabled()).toBe(true);
      setFeatureFlag('sentryReplay', false);
      expect(isSentryReplayEnabled()).toBe(false);
    });
  });

  describe('cross-tab sync', () => {
    it('should invalidate cache on storage event', async () => {
      const { getFeatureFlags } = await freshImport();
      const before = getFeatureFlags();
      expect(before.chaosMode).toBe(false);
      localStorage.setItem('highlands_feature_flags', JSON.stringify({ chaosMode: true }));
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'highlands_feature_flags',
        newValue: JSON.stringify({ chaosMode: true }),
      }));
      const after = getFeatureFlags();
      expect(after.chaosMode).toBe(true);
    });
  });
});
