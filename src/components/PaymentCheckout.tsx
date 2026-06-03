import { useState, useRef } from "react";
import { X, QrCode, Banknote, CreditCard, Check, ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { useProcessPayment, useProcessCashPayment } from "../lib/hooks";
import { useAuth } from "../lib/core/auth-context";
import { showSuccess, showError } from "./ui/toast";
import { formatCurrency } from "../lib/core/format-currency";
import { FonepayQRDialog } from "./FonepayQRDialog";
import { markInvoicePaidAndSync } from "../lib/services/payment-workflow";
import { CASH_QUICK_AMOUNTS, type Invoice } from "../types";

interface PaymentCheckoutProps {
  invoice: Invoice;
  remaining: number;
  onClose: () => void;
  onComplete: () => void;
}

type PaymentTab = "select" | "cash" | "fonepay" | "credit";

export function PaymentCheckout({ invoice, remaining, onClose, onComplete }: PaymentCheckoutProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<PaymentTab>("select");
  const processPayment = useProcessPayment();
  const processCashPayment = useProcessCashPayment();
  const [cashReceived, setCashReceived] = useState(String(remaining));
  const [creditName, setCreditName] = useState(invoice.customer_name || "");
  const [creditPhone, setCreditPhone] = useState(invoice.customer_phone || "");
  const [submitting, setSubmitting] = useState(false);
  const [showFonepay, setShowFonepay] = useState(false);
  const submitLockRef = useRef(false);

  const change = Math.max(0, Number(cashReceived) - remaining);

  const handlePaymentError = (err: unknown, fallbackMsg: string) => {
    const msg = (err as Error)?.message || "";
    if (msg.includes("already processed") || msg.includes("idempotency")) {
      showSuccess("Payment was already processed");
      onComplete();
    } else {
      showError(msg || fallbackMsg);
    }
  };

  const handleCashExact = async () => {
    if (!user || submitting || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const key = `cash:${invoice.id}:${Date.now()}`;
      await processCashPayment.mutateAsync({
        p_invoice_id: invoice.id,
        p_amount: remaining,
        p_processed_by: user.id,
        p_idempotency_key: key,
      });
      await markInvoicePaidAndSync(invoice.id).catch(() => {});
      showSuccess(`Payment of ${formatCurrency(remaining)} received`);
      onComplete();
    } catch (err) {
      handlePaymentError(err, "Cash payment failed");
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const handleCashWithChange = async () => {
    if (!user || submitting || Number(cashReceived) < remaining || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const key = `cash:${invoice.id}:${Date.now()}`;
      await processCashPayment.mutateAsync({
        p_invoice_id: invoice.id,
        p_amount: remaining,
        p_processed_by: user.id,
        p_idempotency_key: key,
      });
      await markInvoicePaidAndSync(invoice.id).catch(() => {});
      showSuccess(`Payment received. Change due: ${formatCurrency(change)}`);
      onComplete();
    } catch (err) {
      handlePaymentError(err, "Cash payment failed");
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const handleCreditPayment = async () => {
    if (!user || submitting || !creditName.trim() || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const key = `credit:${invoice.id}:${Date.now()}`;
      await processPayment.mutateAsync({
        p_invoice_id: invoice.id,
        p_amount: remaining,
        p_method: "credit_account",
        p_processed_by: user.id,
        p_idempotency_key: key,
        p_reference: creditName.trim(),
        p_notes: creditPhone ? `Phone: ${creditPhone}` : undefined,
      });
      await markInvoicePaidAndSync(invoice.id).catch(() => {});
      showSuccess(`Credit payment recorded for ${creditName.trim()}`);
      onComplete();
    } catch (err) {
      handlePaymentError(err, "Credit payment failed");
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  if (showFonepay) {
    return (
      <FonepayQRDialog
        invoice={invoice}
        amount={remaining}
        onSuccess={onComplete}
        onCancel={() => setShowFonepay(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl border bg-background p-0 shadow-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            {tab !== "select" && (
              <button onClick={() => setTab("select")} className="min-h-[44px] min-w-[44px]">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-lg font-semibold">Payment</h2>
          </div>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 border-b border-border bg-muted/30">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-muted-foreground">Invoice</span>
            <span className="text-sm font-medium">{invoice.invoice_number}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-base font-bold">{formatCurrency(invoice.total)}</span>
          </div>
          {Number(invoice.total) - remaining > 0 && (
            <div className="flex justify-between items-center text-sm text-green-600">
              <span>Already Paid</span>
              <span>{formatCurrency(Number(invoice.total) - remaining)}</span>
            </div>
          )}
          <div className="flex justify-between items-center mt-1 pt-2 border-t border-border">
            <span className="text-base font-semibold">Due</span>
            <span className="text-xl font-bold text-primary">{formatCurrency(remaining)}</span>
          </div>
        </div>

        {tab === "select" && (
          <div className="p-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground mb-2">Select payment method</p>

            <button
              onClick={() => setTab("cash")}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary hover:bg-accent/30 transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Banknote className="h-6 w-6 text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Cash</p>
                <p className="text-xs text-muted-foreground">Quick cash shortcuts & change calculation</p>
              </div>
              <span className="text-2xl text-muted-foreground/30">→</span>
            </button>

            <button
              onClick={() => setShowFonepay(true)}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary hover:bg-accent/30 transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <QrCode className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">FonePay QR</p>
                <p className="text-xs text-muted-foreground">Scan QR & pay via mobile banking app</p>
              </div>
              <span className="text-2xl text-muted-foreground/30">→</span>
            </button>

            <button
              onClick={() => setTab("credit")}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary hover:bg-accent/30 transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <CreditCard className="h-6 w-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Credit Account</p>
                <p className="text-xs text-muted-foreground">Bill to customer credit account</p>
              </div>
              <span className="text-2xl text-muted-foreground/30">→</span>
            </button>

            <div className="pt-2 flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1 min-h-[44px]">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {tab === "cash" && (
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {CASH_QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setCashReceived(String(amt))}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all min-h-[44px] ${
                    Number(cashReceived) === amt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {formatCurrency(amt)}
                </button>
              ))}
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Amount Received</label>
              <input
                type="number"
                step="1"
                min="0"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className="w-full h-12 text-xl font-bold rounded-lg border border-border bg-transparent px-4 outline-none focus:ring-2 focus:ring-ring text-center"
              />
            </div>

            {Number(cashReceived) > 0 && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Due</span>
                  <span>{formatCurrency(remaining)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Received</span>
                  <span>{formatCurrency(Number(cashReceived))}</span>
                </div>
                {Number(cashReceived) >= remaining && (
                  <div className="flex justify-between pt-1 border-t border-border font-bold text-emerald-600">
                    <span>Change Due</span>
                    <span>{formatCurrency(change)}</span>
                  </div>
                )}
                {Number(cashReceived) > 0 && Number(cashReceived) < remaining && (
                  <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>Still due: {formatCurrency(remaining - Number(cashReceived))}</span>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={handleCashExact}
                disabled={submitting}
                className="min-h-[48px] text-sm"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Exact {formatCurrency(remaining)}
              </Button>
              <Button
                onClick={handleCashWithChange}
                disabled={submitting || Number(cashReceived) < remaining}
                className="min-h-[48px] text-sm"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processing...</>
                ) : (
                  <>Receive {formatCurrency(Number(cashReceived))}</>
                )}
              </Button>
            </div>

            {change > 0 && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3 text-center">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  Give change: {formatCurrency(change)}
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "credit" && (
          <div className="p-4 space-y-4">
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Customer Name *</label>
                <input
                  type="text"
                  value={creditName}
                  onChange={(e) => setCreditName(e.target.value)}
                  placeholder="Enter customer name"
                  className="w-full h-11 rounded-lg border border-border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Phone (optional)</label>
                <input
                  type="text"
                  value={creditPhone}
                  onChange={(e) => setCreditPhone(e.target.value)}
                  placeholder="98XXXXXXXX"
                  className="w-full h-11 rounded-lg border border-border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/20 p-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount to bill</span>
                <span className="font-bold text-lg">{formatCurrency(remaining)}</span>
              </div>
            </div>

            <Button
              onClick={handleCreditPayment}
              disabled={submitting || !creditName.trim()}
              className="w-full min-h-[48px]"
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processing...</>
              ) : (
                <>Bill {formatCurrency(remaining)} to {creditName.trim() || "customer"}</>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
