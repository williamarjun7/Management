import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom, mockRpc, mockInvoke } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockInvoke: vi.fn(),
}));

vi.mock('../../core/insforge', () => ({
  insforge: {
    database: { from: mockFrom, rpc: mockRpc },
    functions: { invoke: mockInvoke },
  },
}));

describe('booking-sync', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  async function importModule() {
    vi.resetModules();
    return await import('../booking-sync');
  }

function makeChain(resolvedValue: unknown, asItem = false) {
  const data = asItem
    ? (Array.isArray(resolvedValue) ? resolvedValue[0] : resolvedValue)
    : resolvedValue;
  const chain = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(() => { (chain as any)._single = true; return chain; }),
    insert: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    maybeSingle: vi.fn(() => { (chain as any)._single = true; return chain; }),
    gte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    then: vi.fn((resolve: (v: unknown) => unknown) => {
      return Promise.resolve({ data: (chain as any)._single && Array.isArray(data) ? data[0] : data, error: null }).then(resolve);
    }),
    catch: vi.fn(),
  };
  return chain;
}

  describe('pushBookingToWebsite', () => {
    it('should invoke website-sync function with push_booking action', async () => {
      mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
      const { pushBookingToWebsite } = await importModule();
      const result = await pushBookingToWebsite({
        external_booking_id: 'eb-1',
        website_room_id: 'wr-1',
        guest_name: 'John',
        check_in: '2024-06-01',
        check_out: '2024-06-03',
        idempotency_key: 'idem-1',
      });
      expect(mockInvoke).toHaveBeenCalledWith('website-sync', {
        body: { action: 'push_booking', external_booking_id: 'eb-1', website_room_id: 'wr-1', guest_name: 'John', check_in: '2024-06-01', check_out: '2024-06-03', idempotency_key: 'idem-1' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('pushStatusUpdateToWebsite', () => {
    it('should invoke website-sync with push_status_update', async () => {
      mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
      const { pushStatusUpdateToWebsite } = await importModule();
      const result = await pushStatusUpdateToWebsite({
        external_booking_id: 'eb-1', event_type: 'checked_in', idempotency_key: 'idem-1',
      });
      expect(mockInvoke).toHaveBeenCalledWith('website-sync', {
        body: { action: 'push_status_update', external_booking_id: 'eb-1', event_type: 'checked_in', idempotency_key: 'idem-1' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('checkWebsiteAvailability', () => {
    it('should check availability via function', async () => {
      mockInvoke.mockResolvedValue({ data: { available: true }, error: null });
      const { checkWebsiteAvailability } = await importModule();
      const result = await checkWebsiteAvailability({ pos_room_id: 'r1', check_in: '2024-06-01', check_out: '2024-06-03' });
      expect(result.available).toBe(true);
    });
  });

  describe('triggerRetryQueue', () => {
    it('should invoke retry_queue action', async () => {
      mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
      const { triggerRetryQueue } = await importModule();
      const result = await triggerRetryQueue();
      expect(mockInvoke).toHaveBeenCalledWith('website-sync', { body: { action: 'retry_queue' } });
      expect(result.success).toBe(true);
    });
  });

  describe('getRoomMappings', () => {
    it('should fetch room mappings', async () => {
      const mappings = [{ id: 'm1', pos_room_id: 'r1', website_room_id: 'wr1' }];
      const chain = makeChain(mappings);
      chain.order = vi.fn(() => chain);
      chain.limit = vi.fn().mockResolvedValue({ data: mappings, error: null });
      mockFrom.mockReturnValue(chain);

      const { getRoomMappings } = await importModule();
      const result = await getRoomMappings();
      expect(result).toEqual(mappings);
      expect(mockFrom).toHaveBeenCalledWith('room_mappings');
    });
  });

  describe('createRoomMapping', () => {
    it('should insert a room mapping', async () => {
      const mapping = { id: 'm1', pos_room_id: 'r1', website_room_id: 'wr1' };
      mockFrom.mockReturnValue(makeChain(mapping));

      const { createRoomMapping } = await importModule();
      const result = await createRoomMapping({ pos_room_id: 'r1', website_room_id: 'wr1' });
      expect(result.id).toBe('m1');
    });
  });

  describe('deleteRoomMapping', () => {
    it('should delete a room mapping', async () => {
      mockFrom.mockReturnValue(makeChain(null));
      const { deleteRoomMapping } = await importModule();
      await expect(deleteRoomMapping('m1')).resolves.not.toThrow();
    });
  });

  describe('getSyncLogs', () => {
    it('should fetch sync logs', async () => {
      const logs = [{ id: 'l1', status: 'success' }];
      mockFrom.mockReturnValue(makeChain(logs));

      const { getSyncLogs } = await importModule();
      const result = await getSyncLogs();
      expect(result).toEqual(logs);
    });

    it('should filter by status', async () => {
      const logs = [{ id: 'l1', status: 'failed' }];
      const chain = makeChain(logs);
      mockFrom.mockReturnValue(chain);

      const { getSyncLogs } = await importModule();
      await getSyncLogs(100, 'failed');
      expect(chain.eq).toHaveBeenCalledWith('status', 'failed');
    });
  });

  describe('getSyncLog', () => {
    it('should fetch single sync log', async () => {
      const log = { id: 'l1', status: 'success' };
      mockFrom.mockReturnValue(makeChain(log));

      const { getSyncLog } = await importModule();
      const result = await getSyncLog('l1');
      expect(result?.id).toBe('l1');
    });
  });

  describe('getSyncQueue', () => {
    it('should fetch sync queue items', async () => {
      const items = [{ id: 'q1', action: 'push_booking' }];
      mockFrom.mockReturnValue(makeChain(items));

      const { getSyncQueue } = await importModule();
      const result = await getSyncQueue();
      expect(result).toEqual(items);
    });
  });

  describe('getExternalBookings', () => {
    it('should fetch external bookings', async () => {
      const bookings = [{ id: 'eb1', external_booking_id: 'eb-1' }];
      const chain = makeChain(bookings);
      chain.order = vi.fn(() => chain);
      chain.limit = vi.fn().mockResolvedValue({ data: bookings, error: null });
      mockFrom.mockReturnValue(chain);

      const { getExternalBookings } = await importModule();
      const result = await getExternalBookings();
      expect(result).toEqual(bookings);
    });
  });

  describe('getExternalBookingByPosId', () => {
    it('should fetch external booking by POS id', async () => {
      const booking = { id: 'eb1', pos_booking_id: 'pb-1' };
      const chain = makeChain(booking);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: booking, error: null });
      mockFrom.mockReturnValue(chain);

      const { getExternalBookingByPosId } = await importModule();
      const result = await getExternalBookingByPosId('pb-1');
      expect(result?.pos_booking_id).toBe('pb-1');
    });
  });

  describe('getReconciliationIssues', () => {
    it('should call get_reconciliation_issues RPC', async () => {
      const issues = [{ id: 'i1', severity: 'high' }];
      mockRpc.mockResolvedValue({ data: issues, error: null });

      const { getReconciliationIssues } = await importModule();
      const result = await getReconciliationIssues({ severity: 'high', unresolvedOnly: true });
      expect(mockRpc).toHaveBeenCalledWith('get_reconciliation_issues', {
        p_severity: 'high', p_unresolved_only: true, p_limit: 100,
      });
      expect(result).toEqual(issues);
    });
  });

  describe('resolveReconciliationIssue', () => {
    it('should call resolve_reconciliation_issue RPC', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });
      const { resolveReconciliationIssue } = await importModule();
      await expect(resolveReconciliationIssue('i1', 'Fixed manually')).resolves.not.toThrow();
    });
  });

  describe('triggerReconciliation', () => {
    it('should invoke reconciliation function', async () => {
      mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
      const { triggerReconciliation } = await importModule();
      const result = await triggerReconciliation({ severity: 'high', limit: 50 });
      expect(mockInvoke).toHaveBeenCalledWith('reconciliation', {
        body: { severity: 'high', limit: 50 },
      });
      expect(result.success).toBe(true);
    });
  });
});
