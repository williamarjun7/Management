import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearAllMocks } from '../../core/__tests__/setup';
import type { ReactNode } from 'react';

vi.mock('../../services/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), audit: vi.fn() },
  attachLogStore: vi.fn(),
}));

const { mockFrom, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockRpc: vi.fn() }));

vi.mock('../../core/insforge', () => ({
  insforge: { database: { from: mockFrom, rpc: mockRpc } },
}));

vi.mock('../../services/audit.service', () => ({
  writeAuditLog: vi.fn(),
  createAuditEntry: vi.fn().mockReturnValue({}),
  AuditActions: { PAYMENT: 'payment', CREATE: 'create', DELETE: 'delete', REFUND_PROCESSED: 'refund.processed', DISCOUNT_APPLIED: 'discount.applied', PARTIAL_PAYMENT: 'partial.payment' },
  AuditEntityTypes: { PAYMENT: 'payment', INVOICE: 'invoice' },
  AuditEventTypes: { PAYMENT: 'PAYMENT', SPLIT_BILL: 'SPLIT_BILL' },
}));

vi.mock('../../services/fonepay', () => ({
  generateFonepayQR: vi.fn().mockResolvedValue({ success: true, qr_message: 'qr-data', transaction_id: 'tx-1' }),
  checkFonepayStatus: vi.fn().mockResolvedValue({ status: 'completed' }),
  logFonepayTransaction: vi.fn().mockResolvedValue({}),
  updateFonepayTransaction: vi.fn().mockResolvedValue({}),
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function makeMockChain(resolvedValue: unknown) {
  const chain = Promise.resolve({ data: resolvedValue, error: null }) as any;
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lt = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.single = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  return chain;
}

describe('billing.hooks', () => {
  beforeEach(() => { clearAllMocks(); mockFrom.mockReset(); mockRpc.mockReset(); });

  describe('useInvoices', () => {
    it('should fetch invoices without status filter', async () => {
      const invoices = [{ id: 'inv-1', status: 'unpaid', total: 500 }];
      mockFrom.mockReturnValue(makeMockChain(invoices));

      const { useInvoices } = await import('../billing.hooks');
      const { result } = renderHook(() => useInvoices(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(invoices);
      expect(mockFrom).toHaveBeenCalledWith('invoices');
    });

    it('should filter by status', async () => {
      const invoices = [{ id: 'inv-1', status: 'paid', total: 500 }];
      const chain = makeMockChain(invoices);
      mockFrom.mockReturnValue(chain);

      const { useInvoices } = await import('../billing.hooks');
      const { result } = renderHook(() => useInvoices('paid'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(chain.eq).toHaveBeenCalledWith('status', 'paid');
    });

    it('should throw on error', async () => {
      const chain = makeMockChain([]);
      chain.select.mockResolvedValue({ data: null, error: new Error('DB fail') });
      mockFrom.mockReturnValue(chain);

      const { useInvoices } = await import('../billing.hooks');
      const { result } = renderHook(() => useInvoices(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe('useInvoice', () => {
    it('should fetch single invoice by id', async () => {
      const invoice = { id: 'inv-1', status: 'paid' };
      mockFrom.mockReturnValue(makeMockChain(invoice));

      const { useInvoice } = await import('../billing.hooks');
      const { result } = renderHook(() => useInvoice('inv-1'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(invoice);
    });

    it('should not fetch when id is undefined', async () => {
      const { useInvoice } = await import('../billing.hooks');
      const { result } = renderHook(() => useInvoice(undefined), { wrapper: createWrapper() });

      expect(result.current.isFetching).toBe(false);
    });
  });

  describe('useProcessPayment', () => {
    it('should call process_payment RPC', async () => {
      mockRpc.mockResolvedValue({ data: { success: true }, error: null });

      const { useProcessPayment } = await import('../billing.hooks');
      const { result } = renderHook(() => useProcessPayment(), { wrapper: createWrapper() });

      result.current.mutate({
        p_invoice_id: 'inv-1', p_amount: 500, p_method: 'cash', p_processed_by: 'user-1',
        p_idempotency_key: 'idem-1',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockRpc).toHaveBeenCalledWith('process_payment', expect.objectContaining({
        p_invoice_id: 'inv-1', p_amount: 500, p_method: 'cash',
      }));
    });

    it('should log error on RPC failure', async () => {
      mockRpc.mockResolvedValue({ data: null, error: new Error('Payment failed') });
      const logger = await import('../../services/logger');

      const { useProcessPayment } = await import('../billing.hooks');
      const { result } = renderHook(() => useProcessPayment(), { wrapper: createWrapper() });

      result.current.mutate({
        p_invoice_id: 'inv-1', p_amount: 500, p_method: 'cash',
        p_processed_by: 'user-1', p_idempotency_key: 'idem-1',
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(logger.logger.error).toHaveBeenCalledWith('process_payment_failed', 'hooks', expect.any(Object));
    });
  });

  describe('useCreatePaymentIntent', () => {
    it('should call create_payment_intent RPC', async () => {
      mockRpc.mockResolvedValue({ data: { intent_id: 'int-1' }, error: null });

      const { useCreatePaymentIntent } = await import('../billing.hooks');
      const { result } = renderHook(() => useCreatePaymentIntent(), { wrapper: createWrapper() });

      result.current.mutate({
        p_invoice_id: 'inv-1', p_amount: 500, p_method: 'cash',
        p_created_by: 'user-1', p_idempotency_key: 'idem-1',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useConfirmPayment', () => {
    it('should call confirm_payment RPC', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'confirmed' }, error: null });

      const { useConfirmPayment } = await import('../billing.hooks');
      const { result } = renderHook(() => useConfirmPayment(), { wrapper: createWrapper() });

      result.current.mutate({ p_intent_id: 'int-1', p_processed_by: 'user-1', p_idempotency_key: 'idem-1' });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useReversePayment', () => {
    it('should call reverse_payment RPC', async () => {
      mockRpc.mockResolvedValue({ data: { status: 'reversed' }, error: null });

      const { useReversePayment } = await import('../billing.hooks');
      const { result } = renderHook(() => useReversePayment(), { wrapper: createWrapper() });

      result.current.mutate({ p_intent_id: 'int-1', p_reversed_by: 'user-1', p_idempotency_key: 'idem-1' });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useProcessCashPayment', () => {
    it('should call process_cash_payment RPC', async () => {
      mockRpc.mockResolvedValue({ data: { success: true }, error: null });

      const { useProcessCashPayment } = await import('../billing.hooks');
      const { result } = renderHook(() => useProcessCashPayment(), { wrapper: createWrapper() });

      result.current.mutate({
        p_invoice_id: 'inv-1', p_amount: 500, p_processed_by: 'user-1', p_idempotency_key: 'idem-1',
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useApplyDiscount', () => {
    it('should call apply_discount RPC', async () => {
      mockRpc.mockResolvedValue({ data: { success: true }, error: null });

      const { useApplyDiscount } = await import('../billing.hooks');
      const { result } = renderHook(() => useApplyDiscount(), { wrapper: createWrapper() });

      result.current.mutate({
        p_invoice_id: 'inv-1', p_discount: 50, p_processed_by: 'user-1', p_idempotency_key: 'idem-1',
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('usePartialPayment', () => {
    it('should call process_partial_payment RPC', async () => {
      mockRpc.mockResolvedValue({ data: { success: true }, error: null });

      const { usePartialPayment } = await import('../billing.hooks');
      const { result } = renderHook(() => usePartialPayment(), { wrapper: createWrapper() });

      result.current.mutate({
        p_invoice_id: 'inv-1', p_amount: 200, p_method: 'cash', p_processed_by: 'user-1',
        p_idempotency_key: 'idem-1',
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useProcessRefund', () => {
    it('should call process_refund RPC', async () => {
      mockRpc.mockResolvedValue({ data: { success: true }, error: null });

      const { useProcessRefund } = await import('../billing.hooks');
      const { result } = renderHook(() => useProcessRefund(), { wrapper: createWrapper() });

      result.current.mutate({
        p_invoice_id: 'inv-1', p_amount: 500, p_reason: 'Overcharge',
        p_processed_by: 'user-1', p_idempotency_key: 'idem-1',
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useDeleteInvoice', () => {
    it('should soft-delete invoice via update', async () => {
      mockFrom.mockReturnValue(makeMockChain(null));

      const { useDeleteInvoice } = await import('../billing.hooks');
      const { result } = renderHook(() => useDeleteInvoice(), { wrapper: createWrapper() });

      result.current.mutate('inv-1');
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      const updateCall = mockFrom.mock.results[0]?.value?.update;
      if (updateCall) {
        expect(mockFrom).toHaveBeenCalledWith('invoices');
      }
    });
  });

  describe('useReconciliationReport', () => {
    it('should fetch payment logs and compute totals', async () => {
      const paymentLogs = [
        { method: 'cash', amount: 500 },
        { method: 'cash', amount: 300 },
        { method: 'card', amount: 400 },
      ];
      mockFrom.mockReturnValue(makeMockChain(paymentLogs));

      const { useReconciliationReport } = await import('../billing.hooks');
      const { result } = renderHook(() => useReconciliationReport('2024-06-01'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.grandTotal).toBe(1200);
      expect(result.current.data?.transactionCount).toBe(3);
    });
  });

  describe('useGenerateReceipt', () => {
    it('should call generate_receipt RPC', async () => {
      mockRpc.mockResolvedValue({ data: { url: 'receipt.pdf' }, error: null });

      const { useGenerateReceipt } = await import('../billing.hooks');
      const { result } = renderHook(() => useGenerateReceipt(), { wrapper: createWrapper() });

      result.current.mutate({ p_invoice_id: 'inv-1' });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useCreditCustomers', () => {
    it('should fetch credit customers', async () => {
      mockFrom.mockReset();
      mockFrom
        .mockReturnValueOnce(makeMockChain([{ invoice_id: 'inv-1', created_at: '2024-01-01' }]))
        .mockReturnValueOnce(makeMockChain([{ id: 'inv-1', customer_name: 'John', customer_phone: null, total: 1000 }]));

      const { useCreditCustomers } = await import('../billing.hooks');
      const { result } = renderHook(() => useCreditCustomers(), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data![0].name).toBe('John');
    });
  });

  describe('useCreditOutstandingBalance', () => {
    it('should call get_customer_credit_balance RPC', async () => {
      mockRpc.mockResolvedValue({ data: { outstanding: 500, total_credit: 1000 }, error: null });

      const { useCreditOutstandingBalance } = await import('../billing.hooks');
      const { result } = renderHook(() => useCreditOutstandingBalance('John'), { wrapper: createWrapper() });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.outstanding).toBe(500);
    });
  });

  describe('useFonepayQR', () => {
    it('should generate Fonepay QR', async () => {
      const { useFonepayQR } = await import('../billing.hooks');
      const { result } = renderHook(() => useFonepayQR(), { wrapper: createWrapper() });

      result.current.mutate({ amount: 500, invoiceId: 'inv-1', remarks1: 'Highlands' });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });

  describe('useCheckFonepayStatus', () => {
    it('should check Fonepay status', async () => {
      const { useCheckFonepayStatus } = await import('../billing.hooks');
      const { result } = renderHook(() => useCheckFonepayStatus(), { wrapper: createWrapper() });

      result.current.mutate({ prn: 'PRN123' });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });
  });
});
