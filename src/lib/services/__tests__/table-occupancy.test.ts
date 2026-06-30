import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllMocks, setRpcHandler } from '../../core/__tests__/setup';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() },
  attachLogStore: vi.fn(),
}));

const mockFrom = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());

vi.mock('../../core/insforge', () => ({
  insforge: {
    database: { from: mockFrom, rpc: mockRpc },
  },
}));

describe('table-occupancy', () => {
  beforeEach(() => {
    clearAllMocks();
    mockFrom.mockReset();
    mockRpc.mockReset();
    setRpcHandler('create_system_event', () => ({ data: {}, error: null }));
  });

  describe('refreshTableStatus', () => {
    it('should set table to occupied when active orders exist', async () => {
      let calledStatus: string | null = null;

      const sessionChain = { select: vi.fn(() => sessionChain), eq: vi.fn(() => sessionChain), limit: vi.fn(() => Promise.resolve({ data: [{ id: 'session-1' }], error: null })) };
      mockFrom.mockImplementation((table: string) => {
        if (table === 'orders') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockReturnThis(),
              not: vi.fn(() => Promise.resolve({ data: [{ id: 'order-1' }], error: null })),
            })),
          };
        }
        if (table === 'table_sessions') return sessionChain;
        if (table === 'restaurant_tables') {
          return {
            update: vi.fn((data: { status: string }) => {
              calledStatus = data.status;
              return { eq: vi.fn(() => Promise.resolve({ error: null })) };
            }),
          };
        }
        return { select: vi.fn(), eq: vi.fn(), update: vi.fn() };
      });

      const { refreshTableStatus } = await import('../table-occupancy');
      await refreshTableStatus('table-1');
      expect(calledStatus).toBe('occupied');
    });

    it('should set table to available when no active orders', async () => {
      let calledStatus: string | null = null;

      const sessionChain = { select: vi.fn(() => sessionChain), eq: vi.fn(() => sessionChain), limit: vi.fn(() => Promise.resolve({ data: [], error: null })) };
      mockFrom.mockImplementation((table: string) => {
        if (table === 'orders') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockReturnThis(),
              not: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          };
        }
        if (table === 'table_sessions') return sessionChain;
        if (table === 'restaurant_tables') {
          return {
            update: vi.fn((data: { status: string }) => {
              calledStatus = data.status;
              return { eq: vi.fn(() => Promise.resolve({ error: null })) };
            }),
          };
        }
        return { select: vi.fn(), eq: vi.fn(), update: vi.fn() };
      });

      const { refreshTableStatus } = await import('../table-occupancy');
      await refreshTableStatus('table-2');
      expect(calledStatus).toBe('available');
    });

    it('should do nothing when tableId is empty', async () => {
      const { refreshTableStatus } = await import('../table-occupancy');
      await refreshTableStatus('');
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('should not throw when create_system_event fails (non-blocking)', async () => {
      const sessionChain = { select: vi.fn(() => sessionChain), eq: vi.fn(() => sessionChain), limit: vi.fn(() => Promise.resolve({ data: [{ id: 's-1' }], error: null })) };
      mockFrom.mockImplementation((table: string) => {
        if (table === 'orders') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockReturnThis(),
              not: vi.fn(() => Promise.resolve({ data: [{ id: 'o1' }], error: null })),
            })),
          };
        }
        if (table === 'table_sessions') return sessionChain;
        if (table === 'restaurant_tables') {
          return {
            update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
          };
        }
        return { select: vi.fn(), eq: vi.fn(), update: vi.fn() };
      });

      setRpcHandler('create_system_event', () => {
        throw new Error('RPC failed');
      });

      const { refreshTableStatus } = await import('../table-occupancy');
      await expect(refreshTableStatus('table-3')).resolves.not.toThrow();
    });
  });
});
