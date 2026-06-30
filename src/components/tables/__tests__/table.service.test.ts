import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllMocks } from '../../../lib/core/__tests__/setup';

vi.mock('../../../lib/core/insforge', () => ({
  insforge: {
    database: {
      from: vi.fn(),
      rpc: vi.fn(),
    },
  },
}));

describe('table.service', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  describe('validateTableStatus', () => {
    it('should accept valid status values', async () => {
      const { validateTableStatus } = await import('../table.service');
      expect(() => validateTableStatus('available')).not.toThrow();
      expect(() => validateTableStatus('occupied')).not.toThrow();
      expect(() => validateTableStatus('reserved')).not.toThrow();
      expect(() => validateTableStatus('ordering')).not.toThrow();
      expect(() => validateTableStatus('preparing')).not.toThrow();
      expect(() => validateTableStatus('ready')).not.toThrow();
      expect(() => validateTableStatus('dining')).not.toThrow();
      expect(() => validateTableStatus('billing')).not.toThrow();
      expect(() => validateTableStatus('cleaning')).not.toThrow();
    });

    it('should reject invalid status values', async () => {
      const { validateTableStatus } = await import('../table.service');
      expect(() => validateTableStatus('invalid')).toThrow('Invalid table status');
      expect(() => validateTableStatus('')).toThrow('Invalid table status');
      expect(() => validateTableStatus('active')).toThrow('Invalid table status');
      expect(() => validateTableStatus('in_use')).toThrow('Invalid table status');
    });

    it('should reject nullish values', async () => {
      const { validateTableStatus } = await import('../table.service');
      expect(() => validateTableStatus(undefined as unknown as string)).toThrow('Invalid table status');
    });
  });

  describe('isValidTableStatus', () => {
    it('should return true for valid statuses', async () => {
      const { isValidTableStatus } = await import('../table.service');
      expect(isValidTableStatus('available')).toBe(true);
      expect(isValidTableStatus('occupied')).toBe(true);
      expect(isValidTableStatus('billing')).toBe(true);
    });

    it('should return false for invalid statuses', async () => {
      const { isValidTableStatus } = await import('../table.service');
      expect(isValidTableStatus('nonsense')).toBe(false);
      expect(isValidTableStatus('')).toBe(false);
      expect(isValidTableStatus('active')).toBe(false);
    });
  });
});
