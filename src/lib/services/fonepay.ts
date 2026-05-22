import { insforge } from '../core/insforge';

export interface FonepayQRResult {
  success: boolean;
  payment_url?: string;
  merchant_code?: string;
  transaction_id?: string;
  amount?: string;
  expires_at?: string;
  error?: string;
}

export interface FonepayVerifyResult {
  success: boolean;
  verified?: boolean;
  error?: string;
}

export interface LogFonepayTxResult {
  success: boolean;
  id?: string;
}

export interface UpdateFonepayTxResult {
  success: boolean;
}

const FONEPAY_FUNCTION = 'fonepay';

export async function generateFonepayQR(amount: number, transactionId: string, invoiceId?: string): Promise<FonepayQRResult> {
  const { data, error } = await insforge.functions.invoke(FONEPAY_FUNCTION, {
    body: {
      action: 'generate_qr',
      amount: amount.toString(),
      transaction_id: transactionId,
      invoice_id: invoiceId,
    },
  });
  if (error) throw error;
  return data as FonepayQRResult;
}

export async function verifyFonepayPayment(transactionId: string, amount: number): Promise<FonepayVerifyResult> {
  const { data, error } = await insforge.functions.invoke(FONEPAY_FUNCTION, {
    body: {
      action: 'verify',
      transaction_id: transactionId,
      amount: amount.toString(),
    },
  });
  if (error) throw error;
  return data as FonepayVerifyResult;
}

export async function logFonepayTransaction(invoiceId: string, transactionId: string, amount: number): Promise<LogFonepayTxResult> {
  const { data, error } = await insforge.database.rpc('log_fonepay_transaction', {
    p_invoice_id: invoiceId,
    p_transaction_id: transactionId,
    p_amount: amount,
  });
  if (error) throw error;
  return data as LogFonepayTxResult;
}

export async function updateFonepayTransaction(transactionId: string, status: string, paymentLogId?: string): Promise<UpdateFonepayTxResult> {
  const { data, error } = await insforge.database.rpc('update_fonepay_transaction', {
    p_transaction_id: transactionId,
    p_status: status,
    p_payment_log_id: paymentLogId || null,
  });
  if (error) throw error;
  return data as UpdateFonepayTxResult;
}

export function generateTransactionId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `FP${ts}${rand}`;
}
