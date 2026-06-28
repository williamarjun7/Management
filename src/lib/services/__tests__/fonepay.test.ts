import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearAllMocks } from '../../core/__tests__/setup';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() },
  attachLogStore: vi.fn(),
}));

const { mockInvoke, mockRpc } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('../../core/insforge', () => ({
  insforge: {
    functions: { invoke: mockInvoke },
    database: { rpc: mockRpc, from: vi.fn() },
  },
}));

describe('fonepay', () => {
  beforeEach(() => {
    clearAllMocks();
    mockInvoke.mockReset();
    mockRpc.mockReset();
  });

  describe('generateFonepayQR', () => {
    it('should invoke fonepay-v2 function with generate_qr action', async () => {
      mockInvoke.mockResolvedValue({
        data: { success: true, qr_message: 'qr-data', transaction_id: 'tx-1' },
      });

      const { generateFonepayQR } = await import('../fonepay');
      const result = await generateFonepayQR(500, 'inv-1', 'Highlands Cafe');

      expect(mockInvoke).toHaveBeenCalledWith('fonepay-v2', {
        body: { action: 'generate_qr', amount: '500', invoice_id: 'inv-1', remarks1: 'Highlands Cafe' },
      });
      expect(result.success).toBe(true);
    });

    it('should throw on function error', async () => {
      mockInvoke.mockResolvedValue({
        error: new Error('FonePay service unavailable'),
      });

      const { generateFonepayQR } = await import('../fonepay');
      await expect(generateFonepayQR(500, 'inv-1')).rejects.toThrow('FonePay service unavailable');
    });
  });

  describe('checkFonepayStatus', () => {
    it('should invoke fonepay-v2 with check_status action', async () => {
      mockInvoke.mockResolvedValue({
        data: { success: true, verified: true, payment_status: 'completed' },
      });

      const { checkFonepayStatus } = await import('../fonepay');
      const result = await checkFonepayStatus('PRN123');

      expect(mockInvoke).toHaveBeenCalledWith('fonepay-v2', {
        body: { action: 'check_status', prn: 'PRN123' },
      });
      expect(result.verified).toBe(true);
    });
  });

  describe('database RPC functions', () => {
    it('logFonepayTransaction should call correct RPC', async () => {
      mockRpc.mockResolvedValue({
        data: { success: true, id: 'log-1' },
      });

      const { logFonepayTransaction } = await import('../fonepay');
      await logFonepayTransaction('inv-1', 'tx-1', 500, '2026-06-28T12:00:00Z');

      expect(mockRpc).toHaveBeenCalledWith('log_fonepay_transaction', {
        p_invoice_id: 'inv-1',
        p_transaction_id: 'tx-1',
        p_amount: 500,
        p_qr_expiry: '2026-06-28T12:00:00Z',
      });
    });

    it('updateFonepayTransaction should call correct RPC', async () => {
      mockRpc.mockResolvedValue({
        data: { success: true },
      });

      const { updateFonepayTransaction } = await import('../fonepay');
      await updateFonepayTransaction('tx-1', 'completed', 'pl-1', 'gw-ref', 500);

      expect(mockRpc).toHaveBeenCalledWith('update_fonepay_transaction', {
        p_transaction_id: 'tx-1',
        p_status: 'completed',
        p_payment_log_id: 'pl-1',
        p_gateway_reference: 'gw-ref',
        p_paid_amount: 500,
      });
    });
  });
});
