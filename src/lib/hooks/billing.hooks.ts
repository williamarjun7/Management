import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { insforge } from '../core/insforge';
import { logger } from '../services/logger';
import { writeAuditLog, createAuditEntry, AuditActions, AuditEntityTypes, AuditEventTypes } from '../services/audit.service';
import { generateFonepayQR, verifyFonepayPayment, generateTransactionId, logFonepayTransaction, updateFonepayTransaction } from '../services/fonepay';
import type { Invoice, BillSplit, CreditCustomer } from '../../types';
import { queryKeys } from '../core/query-keys';
import { showSuccess, showPending } from '../../components/ui/toast';

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
    }) => {
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
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.PAYMENT, AuditEntityTypes.PAYMENT, vars.p_invoice_id, { new_state: { amount: vars.p_amount, method: vars.p_method }, event_type: AuditEventTypes.PAYMENT }));
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
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
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
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
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
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
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
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
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.PAYMENT, AuditEntityTypes.PAYMENT, vars.p_invoice_id, { new_state: { amount: vars.p_amount, method: 'cash' }, event_type: AuditEventTypes.PAYMENT }));
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices });
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
    onSuccess: (_data, id) => {
      writeAuditLog(createAuditEntry(AuditActions.DELETE, AuditEntityTypes.INVOICE, id, { reason: 'Invoice voided/deleted' }));
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices });
    },
  });
}

// ─────────────── SPLIT BILL ───────────────

export function useSplitBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_source_invoice_id: string;
      p_split_amounts: number[];
      p_split_items?: string[][];
      p_processed_by: string;
      p_idempotency_key: string;
    }) => {
      const { data, error } = await insforge.database.rpc('split_bill', params);
      if (error) {
        logger.error('split_bill_failed', 'hooks', {
          metadata: { invoice_id: params.p_source_invoice_id, error: (error as Error)?.message },
          operation: 'split_bill',
        });
        throw error;
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.SPLIT_BILL, AuditEntityTypes.INVOICE, vars.p_source_invoice_id, {
        metadata: { split_amounts: vars.p_split_amounts },
        event_type: AuditEventTypes.SPLIT_BILL,
      }));
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices });
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
        .select('*, invoices(invoice_number, total)')
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

// ─────────────── SPLIT BILL FRONTEND ───────────────

export function useSplits(invoiceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.splitsByInvoice(invoiceId ?? ''),
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await insforge.database.rpc('get_splits_for_invoice', {
        p_invoice_id: invoiceId,
      });
      if (error) throw error;
      const result = data as { success: boolean; invoice_id: string; splits: BillSplit[] };
      return result?.splits ?? [];
    },
  });
}

export function useCreateSplitBill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_invoice_id: string;
      p_order_id?: string;
      p_split_type: string;
      p_guests: { guest_name: string; sort_order: number }[];
      p_processed_by: string;
    }) => {
      const { data, error } = await insforge.database.rpc('create_split_bill', params);
      if (error) {
        logger.error('create_split_bill_failed', 'hooks', {
          metadata: { invoice_id: params.p_invoice_id, error: (error as Error)?.message },
          operation: 'create_split_bill',
        });
        throw error;
      }
      return data;
    },
    onSuccess: (_data: unknown, vars) => {
      const data = _data as { success: boolean; invoice_id: string; split_type: string; split_count: number };
      writeAuditLog(createAuditEntry(AuditActions.SPLIT_CREATED, AuditEntityTypes.BILL_SPLIT, vars.p_invoice_id, {
        metadata: { split_type: vars.p_split_type, guest_count: vars.p_guests.length },
        event_type: 'SPLIT_CREATED',
      }));
      queryClient.invalidateQueries({ queryKey: queryKeys.splitsByInvoice(vars.p_invoice_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices });
      if (data?.success) {
        showSuccess(`Bill split into ${data.split_count} parts`);
      }
    },
  });
}

export function useAddSplitPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_split_id: string;
      p_amount: number;
      p_payment_method: string;
      p_transaction_reference?: string;
      p_notes?: string;
      p_processed_by: string;
      p_idempotency_key: string;
    }) => {
      const { data, error } = await insforge.database.rpc('add_split_payment', params);
      if (error) {
        logger.error('add_split_payment_failed', 'hooks', {
          metadata: { split_id: params.p_split_id, error: (error as Error)?.message },
          operation: 'add_split_payment',
        });
        throw error;
      }
      return data;
    },
    onSuccess: (_data: unknown, vars) => {
      const data = _data as { success: boolean; split_id: string; amount: number; payment_status: string };
      writeAuditLog(createAuditEntry(AuditActions.SPLIT_PAID, AuditEntityTypes.SPLIT_PAYMENT, vars.p_split_id, {
        new_state: { amount: vars.p_amount, method: vars.p_payment_method },
        event_type: 'SPLIT_PAID',
      }));
      queryClient.invalidateQueries({ queryKey: ['splits'] });
      if (data?.success) {
        showSuccess(`Payment of Rs. ${Number(vars.p_amount).toFixed(2)} recorded`);
      }
    },
  });
}

export function useFinalizeSplit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_split_id: string;
      p_processed_by: string;
    }) => {
      const { data, error } = await insforge.database.rpc('finalize_split', params);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['splits'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices });
    },
  });
}

export function useRefundSplit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      p_split_id: string;
      p_reason?: string;
      p_processed_by: string;
    }) => {
      const { data, error } = await insforge.database.rpc('refund_split', params);
      if (error) throw error;
      return data;
    },
    onSuccess: (_data: unknown, vars) => {
      writeAuditLog(createAuditEntry(AuditActions.SPLIT_REFUNDED, AuditEntityTypes.BILL_SPLIT, vars.p_split_id, {
        reason: vars.p_reason ?? 'Split refunded',
        event_type: 'SPLIT_REFUNDED',
      }));
      queryClient.invalidateQueries({ queryKey: ['splits'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices });
    },
  });
}

// ─────────────── FONEPAY ───────────────

export function useFonepayQR() {
  return useMutation({
    mutationFn: async (params: { amount: number; transactionId?: string; invoiceId?: string }) => {
      const txId = params.transactionId || generateTransactionId();
      const result = await generateFonepayQR(params.amount, txId, params.invoiceId);
      if (!result.success) throw new Error(result.error || 'Failed to generate QR');
      return { ...result, transaction_id: txId };
    },
  });
}

export function useVerifyFonepayPayment() {
  return useMutation({
    mutationFn: async (params: { transactionId: string; amount: number }) => {
      const result = await verifyFonepayPayment(params.transactionId, params.amount);
      return result;
    },
  });
}

// ─────────────── CREDIT CUSTOMERS ───────────────

export function useCreditCustomers() {
  return useQuery({
    queryKey: queryKeys.creditCustomers,
    queryFn: async () => {
      const { data, error } = await insforge.database
        .from('payment_logs')
        .select('invoices!inner(customer_name, customer_phone)')
        .eq('method', 'credit_account')
        .eq('status', 'paid')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CreditCustomer[];
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
    mutationFn: async (params: { invoiceId: string; transactionId: string; amount: number }) => {
      return await logFonepayTransaction(params.invoiceId, params.transactionId, params.amount);
    },
  });
}

export function useUpdateFonepayTransaction() {
  return useMutation({
    mutationFn: async (params: { transactionId: string; status: string; paymentLogId?: string }) => {
      return await updateFonepayTransaction(params.transactionId, params.status, params.paymentLogId);
    },
  });
}
