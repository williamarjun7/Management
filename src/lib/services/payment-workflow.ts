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
 * Transition all active (non-cancelled, non-refunded) orders for a table
 * to 'completed' status after payment.
 *
 * Payment RPCs mark the invoice as paid but leave the order status as 'active',
 * which causes refreshFromOrders to immediately set the table back to 'occupied'.
 */
async function completeActiveOrders(tableId: string, invoiceId: string): Promise<void> {
  const { data: orders } = await insforge.database
    .from('orders')
    .select('id')
    .eq('table_id', tableId)
    .not('status', 'in', '("cancelled","refunded")');

  if (!orders || orders.length === 0) return;

  const { data: session } = await insforge.auth.getCurrentUser();
  const userId = session?.user?.id;
  if (!userId) return;

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
}
export async function processCashPayment(
  invoiceId: string,
  amount: number,
  userId: string,
  idempotencyKey: string,
): Promise<PaymentResult> {
  const { data, error } = await insforge.database.rpc('process_cash_payment', {
    p_invoice_id: invoiceId,
    p_amount: amount,
    p_user_id: userId,
    p_idempotency_key: idempotencyKey,
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
    p_user_id: userId,
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
    p_user_id: userId,
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
  const tasks: Array<Promise<unknown>> = [];

  if (tableId) {
    tasks.push(completeActiveOrders(tableId, invoiceId));
    tasks.push(refreshFromOrders(tableId));

    if (sessionId) {
      tasks.push(
        Promise.resolve(
          insforge.database
            .from('table_sessions')
            .update({ status: 'closed', closed_at: new Date().toISOString() })
            .eq('id', sessionId)
        )
      );
    }
  }

  tasks.push(
    Promise.resolve(
      insforge.database
        .rpc('create_system_event', {
          p_event_type: 'PAYMENT_PROCESSED',
          p_entity_type: 'invoice',
          p_entity_id: invoiceId,
          p_payload: JSON.stringify({ invoice_id: invoiceId, table_id: tableId }),
        })
    )
  );

  await Promise.allSettled(tasks);
}
