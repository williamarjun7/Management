import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() },
  attachLogStore: vi.fn(),
}));

vi.mock('../telemetry', () => ({
  recordTelemetry: vi.fn(),
}));

vi.mock('../mutation-queue', () => ({
  processMutationQueue: vi.fn(),
  isIdempotencyProcessed: vi.fn().mockReturnValue(false),
}));

const { mockSubscribe, mockUnsubscribe, mockOn, mockOff, mockConnect } = vi.hoisted(() => ({
  mockSubscribe: vi.fn(),
  mockUnsubscribe: vi.fn(),
  mockOn: vi.fn(),
  mockOff: vi.fn(),
  mockConnect: vi.fn(),
}));

vi.mock('../../core/insforge', () => ({
  insforge: {
    realtime: {
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      on: mockOn,
      off: mockOff,
      connect: mockConnect,
    },
    database: { from: vi.fn(), rpc: vi.fn() },
  },
}));

let mockInvalidateFn: ((keys: string[]) => void) | null = null;

vi.mock('../sync', () => ({
  debouncedInvalidateMany: vi.fn((keys: string[]) => {
    if (mockInvalidateFn) mockInvalidateFn(keys);
  }),
  setInvalidateFn: vi.fn((fn: (keys: string[]) => void) => { mockInvalidateFn = fn; }),
  backoffWithJitter: vi.fn().mockReturnValue(100),
}));

vi.mock('../queue-leader', () => ({
  contestLeadership: vi.fn((onBecomeLeader: () => void) => { onBecomeLeader(); return vi.fn(); }),
}));

const mockQueryClient = { invalidateQueries: vi.fn() };
vi.mock('../../core/query-client', () => ({
  queryClient: mockQueryClient,
}));

describe('realtime', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); mockInvalidateFn = null; });

  afterEach(async () => {
    const { shutdownRealtime } = await importModule();
    shutdownRealtime();
  });

  async function importModule() {
    vi.resetModules();
    return await import('../realtime');
  }

  describe('event dedup', () => {
    it('should mark and check seen events', async () => {
      const { markEventSeen, isEventSeen } = await importModule();
      expect(isEventSeen('evt-1')).toBe(false);
      markEventSeen('evt-1');
      expect(isEventSeen('evt-1')).toBe(true);
    });

    it('should clear seen events', async () => {
      const { markEventSeen, isEventSeen, clearSeenEvents } = await importModule();
      markEventSeen('evt-1');
      clearSeenEvents();
      expect(isEventSeen('evt-1')).toBe(false);
    });
  });

  describe('subscribeKitchenOrders', () => {
    it('should subscribe to kitchen-orders channel and return cleanup', async () => {
      const { subscribeKitchenOrders } = await importModule();
      const unsubscribe = subscribeKitchenOrders();
      expect(mockSubscribe).toHaveBeenCalledWith('kitchen-orders');
      expect(mockOn).toHaveBeenCalledWith('kitchen-orders', expect.any(Function));
      unsubscribe();
      expect(mockOff).toHaveBeenCalled();
      expect(mockUnsubscribe).toHaveBeenCalledWith('kitchen-orders');
    });

    it('should call onNewOrder callback on new_order event', async () => {
      const onNewOrder = vi.fn();
      const { subscribeKitchenOrders } = await importModule();
      subscribeKitchenOrders(onNewOrder);
      const handler = mockOn.mock.calls.find((c: string[]) => c[0] === 'kitchen-orders')?.[1];
      handler?.({ event: 'new_order', data: {} });
      expect(onNewOrder).toHaveBeenCalled();
    });
  });

  describe('subscribeOrder', () => {
    it('should subscribe to order channel and invalidate on message', async () => {
      const { subscribeOrder } = await importModule();
      const unsubscribe = subscribeOrder('order-1');
      expect(mockSubscribe).toHaveBeenCalledWith('order:order-1');
      const handler = mockOn.mock.calls.find((c: string[]) => c[0] === 'order:order-1')?.[1];
      handler?.({ event: 'update', data: {} });
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalled();
      unsubscribe();
    });
  });

  describe('subscribeRoom', () => {
    it('should subscribe to room channel', async () => {
      const { subscribeRoom } = await importModule();
      const unsubscribe = subscribeRoom('room-1');
      expect(mockSubscribe).toHaveBeenCalledWith('room:room-1');
      const handler = mockOn.mock.calls.find((c: string[]) => c[0] === 'room:room-1')?.[1];
      handler?.({ event: 'update', data: {} });
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['rooms'] });
      unsubscribe();
    });
  });

  describe('subscribeNotifications', () => {
    it('should subscribe to notifications channel', async () => {
      const { subscribeNotifications } = await importModule();
      const unsubscribe = subscribeNotifications();
      expect(mockSubscribe).toHaveBeenCalledWith('notifications');
      unsubscribe();
    });
  });

  describe('subscribeRooms', () => {
    it('should subscribe to rooms channel with callback', async () => {
      const onEvent = vi.fn();
      const { subscribeRooms } = await importModule();
      const unsubscribe = subscribeRooms(onEvent);
      expect(mockSubscribe).toHaveBeenCalledWith('rooms');
      const handler = mockOn.mock.calls.find((c: string[]) => c[0] === 'rooms')?.[1];
      handler?.({ event: 'checked_in' });
      expect(onEvent).toHaveBeenCalled();
      unsubscribe();
    });
  });

  describe('subscribeTableUpdates', () => {
    it('should subscribe to table channel', async () => {
      const { subscribeTableUpdates } = await importModule();
      const unsubscribe = subscribeTableUpdates('t1');
      expect(mockSubscribe).toHaveBeenCalledWith('table:t1');
      const handler = mockOn.mock.calls.find((c: string[]) => c[0] === 'table:t1')?.[1];
      handler?.({});
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tables'] });
      unsubscribe();
    });
  });

  describe('subscribeFonepayPayment', () => {
    it('should call onPaid when payment_confirmed', async () => {
      const onPaid = vi.fn();
      const { subscribeFonepayPayment } = await importModule();
      const unsubscribe = subscribeFonepayPayment('tx-1', onPaid);
      const handler = mockOn.mock.calls.find((c: string[]) => c[0] === 'fonepay:tx-1')?.[1];
      handler?.({ event: 'payment_confirmed', data: { status: 'paid' } });
      expect(onPaid).toHaveBeenCalledWith({ status: 'paid' });
      unsubscribe();
    });
  });

  describe('subscribePaymentStatus', () => {
    it('should call onPaid when payment_received', async () => {
      const onPaid = vi.fn();
      const { subscribePaymentStatus } = await importModule();
      const unsubscribe = subscribePaymentStatus('inv-1', onPaid);
      const handler = mockOn.mock.calls.find((c: string[]) => c[0] === 'payment:inv-1')?.[1];
      handler?.({ event: 'PAYMENT_RECEIVED', data: { paid_amount: 500 } });
      expect(onPaid).toHaveBeenCalledWith(expect.objectContaining({ invoice_id: 'inv-1', status: 'paid', paid_amount: 500 }));
      unsubscribe();
    });
  });

  describe('connectAfterAuth', () => {
    it('should connect when auth is ready and pending', async () => {
      mockConnect.mockResolvedValue(undefined);
      const { connectAfterAuth, initRealtime } = await importModule();
      await initRealtime();
      connectAfterAuth();
      await vi.waitFor(() => expect(mockConnect).toHaveBeenCalled());
    });
  });

  describe('channel health', () => {
    it('should get channel health info', async () => {
      const { subscribeKitchenOrders, getChannelHealth } = await importModule();
      subscribeKitchenOrders();
      const health = getChannelHealth();
      expect(health.length).toBeGreaterThanOrEqual(1);
      expect(health[0].key).toBe('kitchen-orders');
    });
  });

  describe('processSocketMessage', () => {
    it('should handle event_type in data for invalidation', async () => {
      const { subscribeNotifications } = await importModule();
      subscribeNotifications();
      const handler = mockOn.mock.calls.find((c: string[]) => c[0] === 'notifications')?.[1];
      handler?.({ data: { event_type: 'ORDER_CONFIRMED' }, event: 'custom' });
      const sync = await import('../sync');
      expect(sync.debouncedInvalidateMany).toHaveBeenCalled();
    });

    it('should handle new_order event', async () => {
      const { subscribeNotifications } = await importModule();
      subscribeNotifications();
      const handler = mockOn.mock.calls.find((c: string[]) => c[0] === 'notifications')?.[1];
      handler?.({ event: 'new_order', data: {} });
      const sync = await import('../sync');
      expect(sync.debouncedInvalidateMany).toHaveBeenCalledWith(['kitchen-orders', 'orders', 'tables']);
    });

    it('should handle payment_received event', async () => {
      const { subscribeNotifications } = await importModule();
      subscribeNotifications();
      const handler = mockOn.mock.calls.find((c: string[]) => c[0] === 'notifications')?.[1];
      handler?.({ event: 'payment_received' });
      const sync = await import('../sync');
      expect(sync.debouncedInvalidateMany).toHaveBeenCalledWith(['invoices']);
    });
  });
});
