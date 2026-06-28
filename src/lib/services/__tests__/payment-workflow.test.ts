import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllMocks, setRpcHandler } from '../../core/__tests__/setup';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() },
  attachLogStore: vi.fn(),
}));

vi.mock('../../workbench/workflows', () => ({
  executeWorkflowStep: vi.fn().mockResolvedValue({}),
}));

vi.mock('../table-occupancy', () => ({
  refreshTableStatus: vi.fn().mockResolvedValue(undefined),
}));

describe('payment-workflow', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  describe('processCashPayment', () => {
    it('should call process_cash_payment RPC and return success', async () => {
      setRpcHandler('process_cash_payment', () => ({
        data: { success: true, payment_log_id: 'pl-1', invoice_status: 'paid' },
      }));

      const { processCashPayment } = await import('../payment-workflow');
      const result = await processCashPayment('inv-1', 500, 'user-1', 'idem-1');

      expect(result.success).toBe(true);
      expect(result.payment_log_id).toBe('pl-1');
    });

    it('should throw on RPC error', async () => {
      setRpcHandler('process_cash_payment', () => ({
        error: new Error('Insufficient permissions'),
      }));

      const { processCashPayment } = await import('../payment-workflow');
      await expect(processCashPayment('inv-1', 500, 'user-1', 'idem-2')).rejects.toThrow('Insufficient permissions');
    });

    it('should return error result object when RPC returns error field', async () => {
      setRpcHandler('process_cash_payment', () => ({
        data: { success: false, error: 'Invoice already paid' },
      }));

      const { processCashPayment } = await import('../payment-workflow');
      const result = await processCashPayment('inv-1', 500, 'user-1', 'idem-3');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invoice already paid');
    });
  });

  describe('processFonepayPayment', () => {
    it('should call process_payment RPC with fonepay method', async () => {
      setRpcHandler('process_payment', () => ({
        data: { success: true, payment_log_id: 'pl-2', invoice_status: 'paid' },
      }));

      const { processFonepayPayment } = await import('../payment-workflow');
      const result = await processFonepayPayment('inv-2', 1000, 'user-1', 'idem-f1', 'tx-123', 'gw-ref-1');

      expect(result.success).toBe(true);
    });

    it('should handle payment without gateway reference', async () => {
      setRpcHandler('process_payment', () => ({
        data: { success: true, payment_log_id: 'pl-3', invoice_status: 'paid' },
      }));

      const { processFonepayPayment } = await import('../payment-workflow');
      const result = await processFonepayPayment('inv-3', 500, 'user-1', 'idem-f2', 'tx-456');

      expect(result.success).toBe(true);
    });
  });

  describe('processCreditPayment', () => {
    it('should call process_payment RPC with credit_account method', async () => {
      setRpcHandler('process_payment', () => ({
        data: { success: true, payment_log_id: 'pl-4', invoice_status: 'paid' },
      }));

      const { processCreditPayment } = await import('../payment-workflow');
      const result = await processCreditPayment('inv-4', 750, 'user-1', 'idem-c1', 'John Doe', '9800000000');

      expect(result.success).toBe(true);
    });
  });

  describe('markInvoicePaidAndSync', () => {
    it('should call create_system_event RPC', async () => {
      let eventCalled = false;
      setRpcHandler('create_system_event', () => {
        eventCalled = true;
        return { data: {}, error: null };
      });

      const { markInvoicePaidAndSync } = await import('../payment-workflow');
      await markInvoicePaidAndSync('inv-5');

      expect(eventCalled).toBe(true);
    });

    it('should not throw when optional tableId is provided', async () => {
      setRpcHandler('create_system_event', () => ({ data: {}, error: null }));

      const { markInvoicePaidAndSync } = await import('../payment-workflow');
      await expect(markInvoicePaidAndSync('inv-6', 'table-1', 'session-1')).resolves.not.toThrow();
    });
  });
});
