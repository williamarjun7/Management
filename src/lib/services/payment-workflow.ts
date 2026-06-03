import { insforge } from '../core/insforge';
import { executeWorkflowStep } from '../../workbench/workflows';

export type PaymentWorkflowAction = 'cash' | 'fonepay' | 'credit';

interface PaymentResult {
  success: boolean;
  payment_log_id?: string;
  invoice_status?: string;
  error?: string;
}

export async function processCashPayment(
  invoiceId: string,
  amount: number,
  processedBy: string,
  idempotencyKey: string,
): Promise<PaymentResult> {
  const { data, error } = await insforge.database.rpc('process_cash_payment', {
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_processed_by: processedBy,
    p_idempotency_key: idempotencyKey,
  });

  if (error) throw error;

  const result = data as PaymentResult;
  if (result.success !== false && !result.error) {
    await executeWorkflowStep('billing', 'process_payment', {
      invoice_id: invoiceId,
      amount,
      method: 'cash',
    }).catch(() => {});
  }

  return result;
}

export async function processFonepayPayment(
  invoiceId: string,
  amount: number,
  processedBy: string,
  idempotencyKey: string,
  transactionId: string,
  gatewayReference?: string,
): Promise<PaymentResult> {
  const { data, error } = await insforge.database.rpc('process_payment', {
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_method: 'fonepay',
    p_processed_by: processedBy,
    p_idempotency_key: idempotencyKey,
    p_reference: gatewayReference || transactionId,
    p_notes: gatewayReference
      ? `FonePay payment. Gateway Ref: ${gatewayReference}`
      : `FonePay payment. TX: ${transactionId}`,
  });

  if (error) throw error;

  const result = data as PaymentResult;
  if (result.success !== false && !result.error) {
    await executeWorkflowStep('billing', 'process_payment', {
      invoice_id: invoiceId,
      amount,
      method: 'fonepay',
      transaction_id: transactionId,
      gateway_reference: gatewayReference,
    }).catch(() => {});
  }

  return result;
}

export async function processCreditPayment(
  invoiceId: string,
  amount: number,
  processedBy: string,
  idempotencyKey: string,
  customerName: string,
  customerPhone?: string,
): Promise<PaymentResult> {
  const { data, error } = await insforge.database.rpc('process_payment', {
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_method: 'credit_account',
    p_processed_by: processedBy,
    p_idempotency_key: idempotencyKey,
    p_reference: customerName,
    p_notes: customerPhone ? `Phone: ${customerPhone}` : undefined,
  });

  if (error) throw error;

  const result = data as PaymentResult;
  if (result.success !== false && !result.error) {
    await executeWorkflowStep('billing', 'process_payment', {
      invoice_id: invoiceId,
      amount,
      method: 'credit_account',
      customer_name: customerName,
    }).catch(() => {});
  }

  return result;
}

export async function markInvoicePaidAndSync(
  invoiceId: string,
  tableId?: string,
  sessionId?: string,
): Promise<void> {
  // Update table status via workflow
  if (tableId) {
    await executeWorkflowStep('billing', 'close_session', {
      invoice_id: invoiceId,
      table_id: tableId,
      table_session_id: sessionId,
    }).catch(() => {});

    await executeWorkflowStep('billing', 'reset_table', {
      invoice_id: invoiceId,
      table_id: tableId,
    }).catch(() => {});
  }

  // Notify system via event
  await insforge.database.rpc('create_system_event', {
    p_event_type: 'PAYMENT_PROCESSED',
    p_entity_type: 'invoice',
    p_entity_id: invoiceId,
    p_payload: JSON.stringify({ invoice_id: invoiceId, table_id: tableId }),
  }).catch(() => {});
}
