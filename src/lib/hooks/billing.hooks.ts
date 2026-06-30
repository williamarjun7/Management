import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { insforge } from '../core/insforge';
import { logger } from '../services/logger';
import { writeAuditLog, createAuditEntry, AuditActions, AuditEntityTypes, AuditEventTypes } from '../services/audit.service';
import { generateFonepayQR, checkFonepayStatus, logFonepayTransaction, updateFonepayTransaction } from '../services/fonepay';
import { refreshFromOrders } from '../services/table-state';
import type { Invoice, CreditCustomer } from '../../types';
import { queryKeys } from '../core/query-keys';

function requireOnline() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('You are currently offline. Please check your connection and try again.');
  }
}

function invalidateAfterPayment(queryClient: ReturnType<typeof useQueryClient>, tableId?: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.tables });
  queryClient.invalidateQueries({ queryKey: queryKeys.invoices });
  queryClient.invalidateQueries({ queryKey: queryKeys.orders });
  queryClient.invalidateQueries({ queryKey: queryKeys.tableSessions });
  if (tableId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.activeOrderByTable(tableId) });
  }
}
// ─────────────── INVOICES ───────────────

export function useInvoices(status?: string) {
  return useQuery({
    queryKey: ['invoices', status],
    queryFn: async () => {
      let query = insforge.database
        .from('invoices')
        .select('*, invoice_items(*), payment_logs(*)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ['invoice', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('invoices')
        .select('*, invoice_items(*), payment_logs(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Invoice;
    },
  });
}

export function useProcessPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_invoice_id: string;
      p_amount: number;
      p_method: string;
      p_processed_by: string;
      p_idempotency_key: string;
      p_reference?: string;
      p_notes?: string;
      p_transaction_id?: string;
      p_customer_id?: string;
    }) => {
      requireOnline();
      const { data, error } = await insforge.database.rpc('process_payment', params);
      if (error) {
        logger.error('process_payment_failed', 'hooks', {
          metadata: { p_invoice_id: params.p_invoice_id, p_amount: params.p_amount, error: (error as Error)?.message },
          operation: 'process_payment',
        });
        throw error;
      }
      return data;
    },
    onSuccess: async (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.PAYMENT, AuditEntityTypes.PAYMENT, vars.p_invoice_id, { new_state: { amount: vars.p_amount, method: vars.p_method }, event_type: AuditEventTypes.PAYMENT }));
      invalidateAfterPayment(queryClient);
    },
  });
}

export function useCreatePaymentIntent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_invoice_id: string;
      p_amount: number;
      p_method: string;
      p_created_by: string;
      p_idempotency_key: string;
    }) => {
      const { data, error } = await insforge.database.rpc('create_payment_intent', params);
      if (error) {
        logger.error('create_payment_intent_failed', 'hooks', {
          metadata: { params, error: (error as Error)?.message },
          operation: 'create_payment_intent',
        });
        throw error;
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.CREATE, AuditEntityTypes.PAYMENT, vars.p_invoice_id, { new_state: { amount: vars.p_amount, method: vars.p_method } }));
      invalidateAfterPayment(queryClient);
    },
  });
}

export function useConfirmPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_intent_id: string;
      p_processed_by: string;
      p_idempotency_key: string;
    }) => {
      const { data, error } = await insforge.database.rpc('confirm_payment', params);
      if (error) {
        logger.error('confirm_payment_failed', 'hooks', {
          metadata: { params, error: (error as Error)?.message },
          operation: 'confirm_payment',
        });
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      invalidateAfterPayment(queryClient);
    },
  });
}

export function useReversePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_intent_id: string;
      p_reversed_by: string;
      p_idempotency_key: string;
      p_reason?: string;
    }) => {
      const { data, error } = await insforge.database.rpc('reverse_payment', params);
      if (error) {
        logger.error('reverse_payment_failed', 'hooks', {
          metadata: { params, error: (error as Error)?.message },
          operation: 'reverse_payment',
        });
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      invalidateAfterPayment(queryClient);
    },
  });
}

export function useProcessCashPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_invoice_id: string;
      p_amount: number;
      p_processed_by: string;
      p_idempotency_key: string;
      p_notes?: string;
    }) => {
      requireOnline();
      const { data, error } = await insforge.database.rpc('process_cash_payment', params);
      if (error) {
        logger.error('process_cash_payment_failed', 'hooks', {
          metadata: { p_invoice_id: params.p_invoice_id, p_amount: params.p_amount, error: (error as Error)?.message },
          operation: 'process_cash_payment',
        });
        throw error;
      }
      return data;
    },
    onSuccess: async (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.PAYMENT, AuditEntityTypes.PAYMENT, vars.p_invoice_id, { new_state: { amount: vars.p_amount, method: 'cash' }, event_type: AuditEventTypes.PAYMENT }));
      invalidateAfterPayment(queryClient);
    },
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await insforge.database
        .from('invoices')
        .update({ status: 'refunded', notes: 'Invoice voided/deleted' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: async (_data, id) => {
      writeAuditLog(createAuditEntry(AuditActions.DELETE, AuditEntityTypes.INVOICE, id, { reason: 'Invoice voided/deleted' }));
      invalidateAfterPayment(queryClient);
      try {
        const { data: invoice } = await insforge.database
          .from('invoices')
          .select('order_id')
          .eq('id', id)
          .single();
        if ((invoice as { order_id: string | null })?.order_id) {
          const { data: order } = await insforge.database
            .from('orders')
            .select('table_id')
            .eq('id', (invoice as { order_id: string }).order_id)
            .single();
          if ((order as { table_id: string | null })?.table_id) {
            await refreshFromOrders((order as { table_id: string }).table_id);
          }
        }
      } catch { /* non-blocking */ }
    },
  });
}

// ─────────────── PARTIAL PAYMENT ───────────────

export function usePartialPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_invoice_id: string;
      p_amount: number;
      p_method: string;
      p_processed_by: string;
      p_idempotency_key: string;
      p_notes?: string;
    }) => {
      const { data, error } = await insforge.database.rpc('process_partial_payment', params);
      if (error) {
        logger.error('partial_payment_failed', 'hooks', {
          metadata: { invoice_id: params.p_invoice_id, amount: params.p_amount, error: (error as Error)?.message },
          operation: 'process_partial_payment',
        });
        throw error;
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.PARTIAL_PAYMENT, AuditEntityTypes.PAYMENT, vars.p_invoice_id, {
        new_state: { amount: vars.p_amount, method: vars.p_method },
        event_type: AuditEventTypes.SPLIT_BILL,
      }));
      invalidateAfterPayment(queryClient);
    },
  });
}

// ─────────────── REFUND ───────────────

export function useProcessRefund() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_invoice_id: string;
      p_amount: number;
      p_reason: string;
      p_processed_by: string;
      p_idempotency_key: string;
    }) => {
      const { data, error } = await insforge.database.rpc('process_refund', params);
      if (error) {
        logger.error('process_refund_failed', 'hooks', {
          metadata: { invoice_id: params.p_invoice_id, amount: params.p_amount, error: (error as Error)?.message },
          operation: 'process_refund',
        });
        throw error;
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.REFUND_PROCESSED, AuditEntityTypes.INVOICE, vars.p_invoice_id, {
        previous_state: { status: 'paid' },
        new_state: { status: 'refunded', amount: vars.p_amount },
        reason: vars.p_reason,
      }));
      invalidateAfterPayment(queryClient);
    },
  });
}

// ─────────────── DISCOUNT ───────────────

export function useApplyDiscount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_invoice_id: string;
      p_discount: number;
      p_reason?: string;
      p_processed_by: string;
      p_idempotency_key: string;
    }) => {
      const { data, error } = await insforge.database.rpc('apply_discount', params);
      if (error) {
        logger.error('apply_discount_failed', 'hooks', {
          metadata: { invoice_id: params.p_invoice_id, discount: params.p_discount, error: (error as Error)?.message },
          operation: 'apply_discount',
        });
        throw error;
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.DISCOUNT_APPLIED, AuditEntityTypes.INVOICE, vars.p_invoice_id, {
        metadata: { discount: vars.p_discount, reason: vars.p_reason },
      }));
      invalidateAfterPayment(queryClient);
    },
  });
}

// ─────────────── RECONCILIATION ───────────────

export function useReconciliationReport(date?: string) {
  return useQuery({
    queryKey: ['reconciliation', date],
    queryFn: async () => {
      const targetDate = date ?? new Date().toISOString().split('T')[0];
      const { data: payments, error: payErr } = await insforge.database
        .from('payment_logs')
        .select('*')
        .gte('created_at', targetDate)
        .lt('created_at', new Date(new Date(targetDate).getTime() + 86400000).toISOString())
        .order('created_at', { ascending: true });
      if (payErr) throw payErr;

      const totals = (payments ?? []).reduce((acc: Record<string, { count: number; total: number }>, p: { method: string; amount: number }) => {
        const method = p.method || 'unknown';
        if (!acc[method]) acc[method] = { count: 0, total: 0 };
        acc[method].count++;
        acc[method].total += Number(p.amount);
        return acc;
      }, {});

      const grandTotal = Object.values(totals as Record<string, { count: number; total: number }>).reduce((s, m) => s + m.total, 0);

      return { date: targetDate, payments: payments ?? [], totals, grandTotal, transactionCount: (payments ?? []).length };
    },
  });
}

export function useGenerateReceipt() {
  return useMutation({
    mutationFn: async (params: { p_invoice_id: string }) => {
      const { data, error } = await insforge.database.rpc('generate_receipt', params);
      if (error) {
        logger.error('generate_receipt_failed', 'hooks', {
          metadata: { invoice_id: params.p_invoice_id, error: (error as Error)?.message },
          operation: 'generate_receipt',
        });
        throw error;
      }
      return data;
    },
  });
}

// ─────────────── FONEPAY ───────────────

export function useFonepayQR() {
  return useMutation({
    mutationFn: async (params: { amount: number; invoiceId: string; remarks1?: string; remarks2?: string }) => {
      const result = await generateFonepayQR(params.amount, params.invoiceId, params.remarks1, params.remarks2);
      if (!result.success) throw new Error(result.error || 'Failed to generate QR');
      return result;
    },
  });
}

export function useCheckFonepayStatus() {
  return useMutation({
    mutationFn: async (params: { prn: string }) => {
      const result = await checkFonepayStatus(params.prn);
      return result;
    },
  });
}

// ─────────────── CREDIT CUSTOMERS ───────────────

export function useCreditCustomers() {
  return useQuery({
    queryKey: queryKeys.creditCustomers,
    queryFn: async () => {
      const { data: payments, error: payErr } = await insforge.database
        .from('payment_logs')
        .select('invoice_id, created_at')
        .eq('method', 'credit_account')
        .eq('status', 'paid')
        .order('created_at', { ascending: false });
      if (payErr) throw payErr;
      const invoiceIds = [...new Set((payments ?? []).map((p: { invoice_id: string }) => p.invoice_id))];
      if (invoiceIds.length === 0) return [] as CreditCustomer[];
      const { data: invoices, error: invErr } = await insforge.database
        .from('invoices')
        .select('id, customer_name, customer_phone, total')
        .in('id', invoiceIds)
        .order('created_at', { ascending: false });
      if (invErr) throw invErr;
      return ((invoices ?? []) as { id: string; customer_name: string; customer_phone: string | null; total: number }[]).map((inv) => ({
        id: inv.id,
        name: inv.customer_name ?? '',
        phone: inv.customer_phone ?? null,
        total_balance: Number(inv.total) || 0,
        outstanding: Number(inv.total) || 0,
        last_payment: null,
      })) as CreditCustomer[];
    },
  });
}

export function useCreditOutstandingBalance(customerName: string | undefined) {
  return useQuery({
    queryKey: ['credit-outstanding', customerName],
    enabled: !!customerName,
    queryFn: async () => {
      const { data, error } = await insforge.database.rpc('get_customer_credit_balance', {
        p_customer_name: customerName,
      });
      if (error) throw error;
      return data as { outstanding: number; total_credit: number };
    },
  });
}

// ─────────────── FONEPAY TRANSACTIONS ───────────────

export function useLogFonepayTransaction() {
  return useMutation({
    mutationFn: async (params: { invoiceId: string; transactionId: string; amount: number; qrExpiry?: string }) => {
      return await logFonepayTransaction(params.invoiceId, params.transactionId, params.amount, params.qrExpiry);
    },
  });
}

export function useUpdateFonepayTransaction() {
  return useMutation({
    mutationFn: async (params: { transactionId: string; status: string; paymentLogId?: string; gatewayReference?: string; paidAmount?: number }) => {
      return await updateFonepayTransaction(params.transactionId, params.status, params.paymentLogId, params.gatewayReference, params.paidAmount);
    },
  });
}
