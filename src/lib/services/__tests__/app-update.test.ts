import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();

vi.mock('../../core/insforge', () => ({
  insforge: {
    database: { rpc: mockRpc, from: vi.fn() },
  },
}));

describe('app-update', () => {
  beforeEach(() => { mockRpc.mockReset(); });

  async function importModule() {
    vi.resetModules();
    return await import('../app-update');
  }

  describe('getCurrentAppVersion', () => {
    it('should return global __APP_VERSION__', async () => {
      (globalThis as any).__APP_VERSION__ = '1.2.3';
      const { getCurrentAppVersion } = await importModule();
      expect(getCurrentAppVersion()).toBe('1.2.3');
      delete (globalThis as any).__APP_VERSION__;
    });

    it('should return 0.0.0 fallback', async () => {
      const { getCurrentAppVersion } = await importModule();
      expect(getCurrentAppVersion()).toBe('0.0.0');
    });
  });

  describe('getCurrentVersionCode', () => {
    it('should return global __APP_VERSION_CODE__', async () => {
      (globalThis as any).__APP_VERSION_CODE__ = '10';
      const { getCurrentVersionCode } = await importModule();
      expect(getCurrentVersionCode()).toBe(10);
      delete (globalThis as any).__APP_VERSION_CODE__;
    });

    it('should return 1 fallback', async () => {
      const { getCurrentVersionCode } = await importModule();
      expect(getCurrentVersionCode()).toBe(1);
    });
  });

  describe('parseSemver', () => {
    it('should parse semver string to numbers', async () => {
      const { parseSemver } = await importModule();
      expect(parseSemver('1.2.3')).toEqual([1, 2, 3]);
    });
  });

  describe('isVersionGte', () => {
    it('should return true when current >= minimum', async () => {
      const { isVersionGte } = await importModule();
      expect(isVersionGte('2.0.0', '1.0.0')).toBe(true);
      expect(isVersionGte('1.0.0', '1.0.0')).toBe(true);
      expect(isVersionGte('1.0.0', '2.0.0')).toBe(false);
    });
  });

  describe('checkForUpdate', () => {
    it('should return version check result', async () => {
      mockRpc.mockResolvedValue({ data: { latestVersion: '2.0.0', latestVersionCode: 2, minimumSupportedVersion: '1.0.0', minimumSupportedVersionCode: 1, forceUpdate: false, apkUrl: '', releaseNotes: [], publishedAt: '' }, error: null });
      const { checkForUpdate } = await importModule();
      const result = await checkForUpdate();
      expect(result?.latestVersion).toBe('2.0.0');
    });

    it('should return null on error', async () => {
      mockRpc.mockResolvedValue({ data: null, error: new Error('Network error') });
      const { checkForUpdate } = await importModule();
      const result = await checkForUpdate();
      expect(result).toBeNull();
    });
  });

  describe('isUpdateAvailable', () => {
    it('should detect available update', async () => {
      const { isUpdateAvailable } = await importModule();
      expect(isUpdateAvailable('1.0.0', '2.0.0')).toBe(true);
      expect(isUpdateAvailable('2.0.0', '1.0.0')).toBe(false);
      expect(isUpdateAvailable('1.0.0', '1.0.0')).toBe(false);
    });
  });

  describe('isForceUpdateRequired', () => {
    it('should compare version codes', async () => {
      const { isForceUpdateRequired } = await importModule();
      expect(isForceUpdateRequired(1, 5)).toBe(true);
      expect(isForceUpdateRequired(5, 1)).toBe(false);
      expect(isForceUpdateRequired(5, 5)).toBe(false);
    });
  });

  describe('downloadApk', () => {
    it('should resolve on success', async () => {
      const mockXhr: any = {
        open: vi.fn(),
        send: vi.fn(),
        response: new Blob(['apk-data']),
        status: 200,
      };
      const XhrCtor = vi.fn(function () { return mockXhr; });
      vi.stubGlobal('XMLHttpRequest', XhrCtor);

      const { downloadApk } = await importModule();
      const promise = downloadApk('https://example.com/app.apk');
      mockXhr.onload?.({} as any);
      const result = await promise;
      expect(result).toBeInstanceOf(Blob);
      vi.unstubAllGlobals();
    });

    it('should reject on network error', async () => {
      const mockXhr: any = { open: vi.fn(), send: vi.fn(), response: null, status: 0 };
      const XhrCtor = vi.fn(function () { return mockXhr; });
      vi.stubGlobal('XMLHttpRequest', XhrCtor);

      const { downloadApk } = await importModule();
      const promise = downloadApk('https://example.com/app.apk');
      mockXhr.onerror?.(new Event('error'));
      await expect(promise).rejects.toThrow('network error');
      vi.unstubAllGlobals();
    });
  });

  describe('triggerSystemDownload', () => {
    it('should call window.open', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const { triggerSystemDownload } = await importModule();
      triggerSystemDownload('https://example.com/app.apk');
      expect(openSpy).toHaveBeenCalledWith('https://example.com/app.apk', '_blank');
      openSpy.mockRestore();
    });
  });
});
