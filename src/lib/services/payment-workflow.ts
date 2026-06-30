import { insforge } from '../core/insforge';
import { refreshFromOrders } from './table-state';

export type PaymentWorkflowAction = 'cash' | 'fonepay' | 'credit';

interface PaymentResult {
  success: boolean;
  payment_log_id?: string;
  invoice_status?: string;
  error?: string;
}

/**
 * Transition all active orders for a table to 'completed' status after payment.
 * Only targets orders with status 'active' to avoid touching already-completed orders.
 */
async function completeActiveOrders(tableId: string, invoiceId: string): Promise<string | null> {
  const { data: orders } = await insforge.database
    .from('orders')
    .select('id')
    .eq('table_id', tableId)
    .eq('status', 'active');

  if (!orders || orders.length === 0) return null;

  const { data: session } = await insforge.auth.getCurrentUser();
  const userId = session?.user?.id;
  if (!userId) return null;

  await Promise.allSettled(
    orders.map((order) =>
      insforge.database.rpc('transition_order_status', {
        p_order_id: order.id,
        p_new_status: 'completed',
        p_user_id: userId,
        p_idempotency_key: `paid:${invoiceId}:${order.id}`,
      })
    )
  );

  return tableId;
}
export async function processCashPayment(
  invoiceId: string,
  amount: number,
  userId: string,
  idempotencyKey: string,
  notes?: string,
): Promise<PaymentResult> {
  const { data, error } = await insforge.database.rpc('process_cash_payment', {
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_processed_by: userId,
    p_idempotency_key: idempotencyKey,
    p_notes: notes ?? null,
  });

  if (error) throw error;
  const result = data as PaymentResult;
  if (result.error) return { success: false, error: result.error };
  return result;
}

export async function processFonepayPayment(
  invoiceId: string,
  amount: number,
  userId: string,
  idempotencyKey: string,
  transactionId: string,
  gatewayReference?: string,
): Promise<PaymentResult> {
  const { data, error } = await insforge.database.rpc('process_payment', {
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_processed_by: userId,
    p_idempotency_key: idempotencyKey,
    p_method: 'fonepay',
    p_transaction_id: transactionId,
    p_gateway_reference: gatewayReference ?? null,
  });

  if (error) throw error;
  const result = data as PaymentResult;
  if (result.error) return { success: false, error: result.error };
  return result;
}

export async function processCreditPayment(
  invoiceId: string,
  amount: number,
  userId: string,
  idempotencyKey: string,
  customerName: string,
  customerPhone: string,
): Promise<PaymentResult> {
  const { data, error } = await insforge.database.rpc('process_payment', {
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_processed_by: userId,
    p_idempotency_key: idempotencyKey,
    p_method: 'credit_account',
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
  });

  if (error) throw error;
  const result = data as PaymentResult;
  if (result.error) return { success: false, error: result.error };
  return result;
}

export async function markInvoicePaidAndSync(
  invoiceId: string,
  tableId?: string,
  sessionId?: string,
): Promise<void> {
  if (tableId) {
    // 1. Mark all active orders as completed — ensures any later order query
    //    for this table returns no active orders.
    await completeActiveOrders(tableId, invoiceId);

    // 2. Close the active table session — must happen BEFORE refreshFromOrders
    //    so the session check sees no active session.
    const activeSessionId = sessionId || await resolveActiveSession(tableId);
    if (activeSessionId) {
      await insforge.database
        .from('table_sessions')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', activeSessionId);
    }

    // 3. Re-evaluate table status based on current orders & sessions.
    //    Both orders and sessions are clean at this point, so the table
    //    will transition to 'available'.
    await refreshFromOrders(tableId);
  }

  // 4. Fire-and-forget system event for audit trail
  try {
    await insforge.database.rpc('create_system_event', {
      p_event_type: 'PAYMENT_PROCESSED',
      p_entity_type: 'invoice',
      p_entity_id: invoiceId,
      p_payload: JSON.stringify({ invoice_id: invoiceId, table_id: tableId }),
    });
  } catch {
    // system event is non-critical
  }
}

async function resolveActiveSession(tableId: string): Promise<string | null> {
  try {
    const { data, error } = await insforge.database
      .from('table_sessions')
      .select('id')
      .eq('table_id', tableId)
      .eq('status', 'active')
      .maybeSingle();
    if (error || !data) return null;
    return data.id;
  } catch {
    return null;
  }
}
