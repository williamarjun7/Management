import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('logger', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  async function importModule() {
    vi.resetModules();
    return await import('../logger');
  }

  describe('logger methods', () => {
    it('should log debug messages', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { logger: loggerObj } = await importModule();
      loggerObj.debug('test message', 'core');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] [core]'),
        expect.any(String),
      );
      consoleSpy.mockRestore();
    });

    it('should log info messages', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { logger: loggerObj } = await importModule();
      loggerObj.info('info message', 'core');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log warn messages', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { logger: loggerObj } = await importModule();
      loggerObj.warn('warn message', 'core');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log error messages', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { logger: loggerObj } = await importModule();
      loggerObj.error('error message', 'core');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log audit messages', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const { logger: loggerObj } = await importModule();
      loggerObj.audit('audit message', 'core');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('error snapshots', () => {
    it('should persist error snapshots to localStorage', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { logger: loggerObj, getErrorSnapshots } = await importModule();
      loggerObj.error('critical error', 'core', { metadata: { key: 'val' } });
      const snapshots = getErrorSnapshots();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].level).toBe('error');
      expect(snapshots[0].message).toBe('critical error');
    });

    it('should limit error snapshots to MAX_ERROR_SNAPSHOTS', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { logger: loggerObj, getErrorSnapshots } = await importModule();
      for (let i = 0; i < 25; i++) {
        loggerObj.error(`error ${i}`, 'core');
      }
      const snapshots = getErrorSnapshots();
      expect(snapshots.length).toBeLessThanOrEqual(20);
    });

    it('should clear error snapshots', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { logger: loggerObj, getErrorSnapshots, clearErrorSnapshots } = await importModule();
      loggerObj.error('error to clear', 'core');
      clearErrorSnapshots();
      expect(getErrorSnapshots()).toHaveLength(0);
    });
  });

  describe('crash breadcrumbs', () => {
    it('should persist breadcrumbs for error and audit entries', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const { logger: loggerObj, getCrashBreadcrumbs } = await importModule();
      loggerObj.error('breadcrumb error', 'core');
      loggerObj.audit('breadcrumb audit', 'core');
      const crumbs = getCrashBreadcrumbs();
      expect(crumbs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getLogsByCategory', () => {
    it('should filter logs by category', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { logger: loggerObj, getLogsByCategory } = await importModule();
      loggerObj.error('auth error', 'auth', { category: 'auth' });
      const authLogs = getLogsByCategory('auth');
      expect(authLogs.length).toBeGreaterThanOrEqual(1);
      expect(authLogs[0].category).toBe('auth');
    });
  });

  describe('getLogsBySeverity', () => {
    it('should filter logs by severity', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const { logger: loggerObj, getLogsBySeverity } = await importModule();
      loggerObj.error('only error', 'core');
      loggerObj.audit('audit entry', 'core');
      const errors = getLogsBySeverity('error');
      expect(errors.every((e) => e.level === 'error')).toBe(true);
    });
  });

  describe('LOG_WEIGHTS', () => {
    it('should have correct weight ordering', async () => {
      const { LOG_WEIGHTS } = await importModule();
      expect(LOG_WEIGHTS.debug).toBe(0);
      expect(LOG_WEIGHTS.info).toBe(1);
      expect(LOG_WEIGHTS.warn).toBe(2);
      expect(LOG_WEIGHTS.error).toBe(3);
      expect(LOG_WEIGHTS.audit).toBe(4);
    });
  });

  describe('getDeviceId', () => {
    it('should generate and persist device ID', async () => {
      const { logger: loggerObj } = await importModule();
      const id1 = loggerObj.getDeviceId();
      const id2 = loggerObj.getDeviceId();
      expect(id1).toBe(id2);
      expect(localStorage.getItem('highlands_device_id')).toBe(id1);
    });
  });

  describe('getTabId', () => {
    it('should return a tab ID', async () => {
      const { logger: loggerObj } = await importModule();
      const tabId = loggerObj.getTabId();
      expect(tabId).toBeDefined();
      expect(typeof tabId).toBe('string');
    });
  });

  describe('attachLogStore', () => {
    it('should call store.add on error log when attached', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const store = { add: vi.fn().mockResolvedValue(undefined) };
      const { logger: loggerObj, attachLogStore } = await importModule();
      attachLogStore(store);
      loggerObj.error('persisted error', 'core');
      expect(store.add).toHaveBeenCalled();
    });
  });
});
