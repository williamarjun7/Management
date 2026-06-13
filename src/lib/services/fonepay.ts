import { insforge } from '../core/insforge';

export interface FonepayQRResult {
  success: boolean;
  qr_message?: string;
  websocket_url?: string;
  merchant_code?: string;
  transaction_id?: string;
  amount?: string;
  status?: string;
  qr_timeout_minutes?: number;
  qr_expiry?: string;
  error?: string;
}

export interface FonepayStatusResult {
  success: boolean;
  verified: boolean;
  payment_status?: string;
  fonepay_trace_id?: string | null;
  merchant_code?: string;
  gateway_reference?: string | null;
  prn?: string;
  error?: string;
}

export interface FonepayTaxRefundResult {
  success: boolean;
  fonepay_trace_id?: string | null;
  message?: string;
  error?: string;
}

export interface LogFonepayTxResult {
  success: boolean;
  id?: string;
}

export interface UpdateFonepayTxResult {
  success: boolean;
}

export interface CancelFonepayQrResult {
  success: boolean;
}

export interface ActiveFonepayQrResult {
  found: boolean;
  id?: string;
  transaction_id?: string;
  amount?: number;
  status?: string;
  qr_generated_at?: string;
  qr_expiry?: string;
}

const FONEPAY_FUNCTION = 'fonepay-v2';

export async function generateFonepayQR(amount: number, invoiceId: string): Promise<FonepayQRResult> {
  const { data, error } = await insforge.functions.invoke(FONEPAY_FUNCTION, {
    body: {
      action: 'generate_qr',
      amount: amount.toString(),
      invoice_id: invoiceId,
    },
  });
  if (error) throw error;
  return data as FonepayQRResult;
}

export async function checkFonepayStatus(prn: string): Promise<FonepayStatusResult> {
  const { data, error } = await insforge.functions.invoke(FONEPAY_FUNCTION, {
    body: {
      action: 'check_status',
      prn,
    },
  });
  if (error) throw error;
  return data as FonepayStatusResult;
}

export async function postFonepayTaxRefund(params: {
  fonepayTraceId: string;
  merchantPRN: string;
  invoiceNumber: string;
  invoiceDate: string;
  transactionAmount: string;
}): Promise<FonepayTaxRefundResult> {
  const { data, error } = await insforge.functions.invoke(FONEPAY_FUNCTION, {
    body: {
      action: 'post_tax_refund',
      ...params,
    },
  });
  if (error) throw error;
  return data as FonepayTaxRefundResult;
}

export async function logFonepayTransaction(invoiceId: string, transactionId: string, amount: number, qrExpiry?: string): Promise<LogFonepayTxResult> {
  const { data, error } = await insforge.database.rpc('log_fonepay_transaction', {
    p_invoice_id: invoiceId,
    p_transaction_id: transactionId,
    p_amount: amount,
    p_qr_expiry: qrExpiry || null,
  });
  if (error) throw error;
  return data as LogFonepayTxResult;
}

export async function updateFonepayTransaction(
  transactionId: string,
  status: string,
  paymentLogId?: string,
  gatewayReference?: string,
  paidAmount?: number,
): Promise<UpdateFonepayTxResult> {
  const { data, error } = await insforge.database.rpc('update_fonepay_transaction', {
    p_transaction_id: transactionId,
    p_status: status,
    p_payment_log_id: paymentLogId || null,
    p_gateway_reference: gatewayReference || null,
    p_paid_amount: paidAmount || null,
  });
  if (error) throw error;
  return data as UpdateFonepayTxResult;
}

export async function cancelActiveFonepayQR(invoiceId: string): Promise<CancelFonepayQrResult> {
  const { data, error } = await insforge.database.rpc('cancel_active_fonepay_qr', {
    p_invoice_id: invoiceId,
  });
  if (error) throw error;
  return data as CancelFonepayQrResult;
}

export async function getActiveFonepayQR(invoiceId: string): Promise<ActiveFonepayQrResult> {
  const { data, error } = await insforge.database.rpc('get_active_fonepay_qr', {
    p_invoice_id: invoiceId,
  });
  if (error) throw error;
  return data as ActiveFonepayQrResult;
}
