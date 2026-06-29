import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn(), getTabId: vi.fn().mockReturnValue('tab-1'), getDeviceId: vi.fn().mockReturnValue('dev-1') },
  attachLogStore: vi.fn(),
}));

const sentryMock = {
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setTag: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'browserTracing' })),
  replayIntegration: vi.fn(() => ({ name: 'replay' })),
};

vi.mock('@sentry/react', () => sentryMock);

describe('sentry', () => {
  let prevEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    prevEnv = import.meta.env.VITE_SENTRY_DSN;
  });

  afterEach(() => {
    if (prevEnv !== undefined) {
      vi.stubEnv('VITE_SENTRY_DSN', prevEnv);
    } else {
      vi.unstubAllEnvs();
    }
  });

  async function importModule() {
    vi.resetModules();
    return await import('../sentry');
  }

  describe('initSentry', () => {
    it('should skip init when DSN is not configured', async () => {
      vi.stubEnv('VITE_SENTRY_DSN', '');
      const logger = await import('../logger');
      const { initSentry } = await importModule();
      initSentry();
      expect(sentryMock.init).not.toHaveBeenCalled();
      expect(logger.logger.warn).toHaveBeenCalledWith('SENTRY_DSN not configured — skipping Sentry init', 'sentry');
    });

    it('should init Sentry when DSN is configured', async () => {
      vi.stubEnv('VITE_SENTRY_DSN', 'https://key@o1.ingest.sentry.io/123');
      vi.stubEnv('MODE', 'production');
      const { initSentry } = await importModule();
      initSentry();
      expect(sentryMock.init).toHaveBeenCalledWith(expect.objectContaining({
        dsn: 'https://key@o1.ingest.sentry.io/123',
        environment: 'production',
      }));
    });
  });

  describe('captureError', () => {
    it('should capture exception with context', async () => {
      const { captureError } = await importModule();
      const error = new Error('Test error');
      captureError(error, { userId: 'u1' });
      expect(sentryMock.captureException).toHaveBeenCalledWith(error, { extra: { userId: 'u1' } });
    });
  });

  describe('captureMessage', () => {
    it('should capture message with level', async () => {
      const { captureMessage } = await importModule();
      captureMessage('Test message', 'warning');
      expect(sentryMock.captureMessage).toHaveBeenCalledWith('Test message', 'warning');
    });
  });

  describe('updateSentryTags', () => {
    it('should set multiple tags', async () => {
      const { updateSentryTags } = await importModule();
      updateSentryTags({ role: 'admin', version: '1.0' });
      expect(sentryMock.setTag).toHaveBeenCalledWith('role', 'admin');
      expect(sentryMock.setTag).toHaveBeenCalledWith('version', '1.0');
    });
  });

  describe('Sentry export', () => {
    it('should re-export Sentry', async () => {
      const { Sentry } = await importModule();
      expect(Sentry).toBeDefined();
    });
  });
});
