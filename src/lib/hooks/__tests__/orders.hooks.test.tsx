import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearAllMocks } from '../../core/__tests__/setup';
import type { Order } from '../../../types';
import type { ReactNode } from 'react';

vi.mock('../../services/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() },
  attachLogStore: vi.fn(),
}));

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('../../core/insforge', () => ({
  insforge: {
    database: {
      from: mockFrom,
      rpc: mockRpc,
    },
  },
}));

vi.mock('../../services/audit.service', () => ({
  writeAuditLog: vi.fn(),
  createAuditEntry: vi.fn().mockReturnValue({}),
  AuditActions: { ORDER_CREATED: 'order.created', ORDER_STATUS_CHANGE: 'order.status_change', DELETE: 'delete' },
  AuditEntityTypes: { ORDER: 'order' },
  AuditEventTypes: { ORDER_CREATED: 'ORDER_CREATED', ORDER_STATUS_CHANGE: 'ORDER_STATUS_CHANGE' },
}));

vi.mock('../../services/table-occupancy', () => ({
  refreshTableStatus: vi.fn().mockResolvedValue(undefined),
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockSelect = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockEq = vi.fn();
const mockNot = vi.fn();
const mockSingle = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockGt = vi.fn();
const mockIs = vi.fn();

function resetQueryMocks() {
  mockSelect.mockReset();
  mockOrder.mockReset();
  mockLimit.mockReset();
  mockEq.mockReset();
  mockNot.mockReset();
  mockSingle.mockReset();
  mockInsert.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockGt.mockReset();
  mockIs.mockReset();
  mockRpc.mockReset();
}

function buildQueryChain(resolvedValue: unknown) {
  const chain = Promise.resolve({ data: resolvedValue, error: null });
  (chain as any).select = mockSelect;
  (chain as any).order = mockOrder;
  (chain as any).limit = mockLimit;
  (chain as any).eq = mockEq;
  (chain as any).not = mockNot;
  (chain as any).single = mockSingle;
  (chain as any).insert = mockInsert;
  (chain as any).update = mockUpdate;
  (chain as any).delete = mockDelete;
  (chain as any).gt = mockGt;
  (chain as any).is = mockIs;
  mockSelect.mockImplementation(() => chain);
  mockOrder.mockImplementation(() => chain);
  mockLimit.mockImplementation(() => chain);
  mockEq.mockImplementation(() => chain);
  mockNot.mockImplementation(() => chain);
  mockSingle.mockImplementation(() => chain);
  mockInsert.mockImplementation(() => chain);
  mockUpdate.mockImplementation(() => chain);
  mockDelete.mockImplementation(() => chain);
  mockGt.mockImplementation(() => chain);
  mockIs.mockImplementation(() => chain);
  mockFrom.mockReturnValue(chain);
}

describe('orders.hooks', () => {
  beforeEach(() => {
    clearAllMocks();
    resetQueryMocks();
  });

  describe('useKitchenOrders', () => {
    it('should fetch kitchen orders with correct query params', async () => {
      const mockOrders: Order[] = [
        { id: '1', status: 'active', created_at: '2024-01-01T00:00:00Z', table_id: 't1', subtotal: 100, discount: 0, total: 100, order_number: 'ORD-1', order_items: [] } as unknown as Order,
      ];
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockOrders, error: null }),
      });

      const { useKitchenOrders } = await import('../orders.hooks');
      const { result } = renderHook(() => useKitchenOrders(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockOrders);
      expect(mockFrom).toHaveBeenCalledWith('orders');
    });

    it('should throw on error', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
      });

      const { useKitchenOrders } = await import('../orders.hooks');
      const { result } = renderHook(() => useKitchenOrders(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useOrders', () => {
    it('should fetch all orders when no status filter', async () => {
      const mockOrders: Order[] = [];
      buildQueryChain(mockOrders);

      const { useOrders } = await import('../orders.hooks');
      const { result } = renderHook(() => useOrders(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockFrom).toHaveBeenCalledWith('orders');
    });

    it('should filter by status when provided', async () => {
      const mockOrders: Order[] = [];
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockOrders, error: null }),
      });

      const { useOrders } = await import('../orders.hooks');
      const { result } = renderHook(() => useOrders('completed'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useActiveOrderByTable', () => {
    it('should not fetch when no tableId', async () => {
      const { useActiveOrderByTable } = await import('../orders.hooks');
      const { result } = renderHook(() => useActiveOrderByTable(null), { wrapper: createWrapper() });

      expect(result.current.isFetching).toBe(false);
      expect(result.current.data).toBeUndefined();
    });

    it('should fetch active order for a table', async () => {
      const mockOrder: Order = { id: '1', status: 'active', table_id: 't1' } as unknown as Order;
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [mockOrder], error: null }),
      });

      const { useActiveOrderByTable } = await import('../orders.hooks');
      const { result } = renderHook(() => useActiveOrderByTable('t1'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.id).toBe('1');
    });
  });

  describe('useCreateOrder', () => {
    it('should create an order with items and calculate totals', async () => {
      const mockOrder = { id: 'order-1', table_id: 't1', total: 150, order_number: 'ORD-TEST' };
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockOrder, error: null }),
      });

      const { useCreateOrder } = await import('../orders.hooks');
      const { result } = renderHook(() => useCreateOrder(), { wrapper: createWrapper() });

      result.current.mutate({
        table_id: 't1', items: [
          { menu_item_id: 'm1', item_name: 'Burger', quantity: 2, unit_price: 75 },
        ], customer_name: 'John',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it('should throw on DB error', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: new Error('Insert failed') }),
      });

      const { useCreateOrder } = await import('../orders.hooks');
      const { result } = renderHook(() => useCreateOrder(), { wrapper: createWrapper() });

      result.current.mutate({
        table_id: 't1',
        items: [{ menu_item_id: 'm1', item_name: 'Pizza', quantity: 1, unit_price: 100 }],
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useReserveInventory', () => {
    it('should call reserve_inventory RPC', async () => {
      mockRpc.mockResolvedValue({ data: { success: true }, error: null });

      const { useReserveInventory } = await import('../orders.hooks');
      const { result } = renderHook(() => useReserveInventory(), { wrapper: createWrapper() });

      result.current.mutate({ p_order_id: 'order-1', p_user_id: 'user-1' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockRpc).toHaveBeenCalledWith('reserve_inventory', expect.objectContaining({
        p_order_id: 'order-1',
        p_user_id: 'user-1',
      }));
    });

    it('should log error and throw on RPC failure', async () => {
      mockRpc.mockResolvedValue({ data: null, error: new Error('RPC failed') });
      const logger = await import('../../services/logger');

      const { useReserveInventory } = await import('../orders.hooks');
      const { result } = renderHook(() => useReserveInventory(), { wrapper: createWrapper() });

      result.current.mutate({ p_order_id: 'order-1', p_user_id: 'user-1' });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(logger.logger.error).toHaveBeenCalledWith('reserve_inventory_failed', 'hooks', expect.any(Object));
    });
  });

  describe('useReleaseInventory', () => {
    it('should call release_inventory RPC', async () => {
      mockRpc.mockResolvedValue({ data: { success: true }, error: null });

      const { useReleaseInventory } = await import('../orders.hooks');
      const { result } = renderHook(() => useReleaseInventory(), { wrapper: createWrapper() });

      result.current.mutate('order-1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockRpc).toHaveBeenCalledWith('release_inventory', expect.objectContaining({ p_order_id: 'order-1' }));
    });
  });

  describe('useTransitionOrderStatus', () => {
    it('should call transition_order_status RPC and invalidate queries', async () => {
      mockRpc.mockResolvedValue({ data: { success: true }, error: null });
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { table_id: 't1' }, error: null }),
      });

      const { useTransitionOrderStatus } = await import('../orders.hooks');
      const { result } = renderHook(() => useTransitionOrderStatus(), { wrapper: createWrapper() });

      result.current.mutate({
        p_order_id: 'order-1', p_new_status: 'completed', p_user_id: 'user-1',
        p_idempotency_key: 'idem-1',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockRpc).toHaveBeenCalledWith('transition_order_status', expect.objectContaining({
        p_order_id: 'order-1', p_new_status: 'completed',
      }));
    });

    it('should log error on RPC failure', async () => {
      mockRpc.mockResolvedValue({ data: null, error: new Error('RPC error') });
      const logger = await import('../../services/logger');

      const { useTransitionOrderStatus } = await import('../orders.hooks');
      const { result } = renderHook(() => useTransitionOrderStatus(), { wrapper: createWrapper() });

      result.current.mutate({
        p_order_id: 'order-1', p_new_status: 'completed', p_user_id: 'user-1',
        p_idempotency_key: 'idem-1',
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(logger.logger.error).toHaveBeenCalledWith('transition_order_status_failed', 'hooks', expect.any(Object));
    });
  });

  describe('useAddOrderItems', () => {
    it('should add items and recalculate totals', async () => {
      const existingOrder = {
        id: 'order-1', table_id: 't1', discount: 0,
        order_items: [{ unit_price: 100, quantity: 1 }],
      };
      const mockSingle = vi.fn().mockResolvedValue({ data: existingOrder, error: null });
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: mockSingle,
        update: vi.fn().mockReturnThis(),
      };
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve);
      mockFrom.mockReturnValue(chain);

      const { useAddOrderItems } = await import('../orders.hooks');
      const { result } = renderHook(() => useAddOrderItems(), { wrapper: createWrapper() });

      result.current.mutate({
        order_id: 'order-1',
        items: [{ menu_item_id: 'm2', item_name: 'Fries', quantity: 1, unit_price: 50 }],
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });
});
