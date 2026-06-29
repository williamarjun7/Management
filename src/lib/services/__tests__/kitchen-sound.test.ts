import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() },
  attachLogStore: vi.fn(),
}));

describe('kitchen-sound', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => ({
      currentTime: 0,
      createOscillator: vi.fn().mockReturnValue({
        connect: vi.fn(),
        frequency: { setValueAtTime: vi.fn() },
        type: '',
        start: vi.fn(),
        stop: vi.fn(),
      }),
      createGain: vi.fn().mockReturnValue({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      }),
      destination: {},
    })));
  });

  async function importModule() {
    vi.resetModules();
    return await import('../kitchen-sound');
  }

  describe('playKitchenAlert', () => {
    it('should create AudioContext and play sound', async () => {
      const { playKitchenAlert } = await importModule();
      expect(() => playKitchenAlert()).not.toThrow();
    });

    it('should handle AudioContext errors gracefully', async () => {
      vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => {
        throw new Error('Audio not supported');
      }));
      const { playKitchenAlert } = await importModule();
      expect(() => playKitchenAlert()).not.toThrow();
    });

    it('should log warning on sound failure', async () => {
      vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => ({
        currentTime: 0,
        createOscillator: vi.fn().mockImplementation(() => { throw new Error('Oscillator error'); }),
        createGain: vi.fn(),
        destination: null,
      })));
      const logger = await import('../logger');
      const { playKitchenAlert } = await importModule();
      playKitchenAlert();
      expect(logger.logger.warn).toHaveBeenCalledWith('kitchen_alert_sound_failed', 'kitchen-sound', expect.any(Object));
    });
  });
});
