import { useState, useRef } from "react";
import { X } from "lucide-react";
import { useProcessPayment, useProcessCashPayment } from "../../lib/hooks";
import { useAuth } from "../../lib/core/auth-context";
import { insforge } from "../../lib/core/insforge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { showSuccess, showError } from "../../components/ui/toast";
import { FonepayQRDialog } from "../../components/FonepayQRDialog";
import { CASH_QUICK_AMOUNTS, PAYMENT_METHOD_LABELS, type Invoice } from "../../types";
import { formatCurrency } from "../../lib/core/format-currency";
import { refreshTableStatus } from "../../lib/services/table-occupancy";

const paymentMethods = [
  { value: "cash", label: "Cash" },
  { value: "credit_account", label: "Credit Account" },
  { value: "fonepay", label: "FonePay" },
];

interface PaymentModalProps {
  invoice: Invoice;
  remaining: number;
  onClose: () => void;
}

export function PaymentModal({ invoice, remaining, onClose }: PaymentModalProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState(String(remaining > 0 ? remaining : invoice.total));
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [cashReceived, setCashReceived] = useState(String(remaining));
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const processPayment = useProcessPayment();
  const processCashPayment = useProcessCashPayment();
  const submitLockRef = useRef(false);
  const [showFonepayQR, setShowFonepayQR] = useState(false);
  const [quickCash, setQuickCash] = useState(false);

  const change = Math.max(0, Number(cashReceived) - remaining);

  const payAmount = Math.min(Number(amount), remaining);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || submitted || submitLockRef.current) return;

    if (payAmount <= 0) {
      showError('Payment amount must be greater than 0');
      return;
    }

    if (method === "fonepay") {
      setShowFonepayQR(true);
      return;
    }

    submitLockRef.current = true;
    setSubmitted(true);
    try {
      const key = `payment:${invoice.id}:${Date.now()}`;
      if (method === "cash") {
        await processCashPayment.mutateAsync({
          p_invoice_id: invoice.id,
          p_amount: payAmount,
          p_processed_by: user.id,
          p_idempotency_key: key,
          p_notes: notes || undefined,
        });
      } else {
        await processPayment.mutateAsync({
          p_invoice_id: invoice.id,
          p_amount: payAmount,
          p_method: method,
          p_processed_by: user.id,
          p_idempotency_key: key,
          p_reference: method === "credit_account" ? (customerName || reference) : (reference || undefined),
          p_notes: notes || undefined,
        });
      }
      showSuccess(`${PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] || method} payment of ${formatCurrency(payAmount)} recorded`);
      try {
        const { data: inv } = await insforge.database.from('invoices').select('order_id').eq('id', invoice.id).single();
        if (inv?.order_id) {
          const { data: ord } = await insforge.database.from('orders').select('table_id').eq('id', inv.order_id).single();
          if (ord?.table_id) await refreshTableStatus(ord.table_id);
        }
      } catch {
        // non-blocking
      }
      onClose();
    } catch (err) {
      const msg = (err as Error)?.message || "Payment failed";
      if (msg.includes("already processed") || msg.includes("idempotency")) {
        showSuccess("Payment was already processed successfully. No duplicate charge was created.");
        onClose();
      } else {
        setErrorMessage(msg);
        showError(msg);
        submitLockRef.current = false;
        setSubmitted(false);
      }
    }
  };

  const handleQuickCash = async (received: number) => {
    if (!user || submitted) return;
    const payAmt = Math.min(received, remaining);
    if (payAmt <= 0) return;
    setSubmitted(true);
    try {
      const key = `cash:${invoice.id}:${Date.now()}`;
      await processCashPayment.mutateAsync({
        p_invoice_id: invoice.id,
        p_amount: payAmt,
        p_processed_by: user.id,
        p_idempotency_key: key,
      });
      const chg = Math.max(0, received - payAmt);
      const msg = chg > 0
        ? `Payment received. Change due: ${formatCurrency(chg)}`
        : `Cash payment of ${formatCurrency(payAmt)} completed`;
      showSuccess(msg);
      onClose();
    } catch (err) {
      const msg = (err as Error)?.message || "";
      if (msg.includes("already processed") || msg.includes("idempotency")) {
        showSuccess("Payment was already processed");
        onClose();
      } else {
        showError(msg);
        setSubmitted(false);
      }
    }
  };

  if (showFonepayQR) {
    return (
      <FonepayQRDialog
        invoice={invoice}
        amount={Number(amount)}
        onSuccess={onClose}
        onCancel={() => setShowFonepayQR(false)}
      />
    );
  }

  const isCash = method === "cash";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Payment</h2>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-sm opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 rounded-lg border bg-muted p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Invoice</span>
            <span className="font-medium">{invoice.invoice_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="font-medium">{formatCurrency(Number(invoice.total))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Remaining</span>
            <span className="font-bold text-primary">{formatCurrency(remaining)}</span>
          </div>
        </div>

        {isCash && !quickCash ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {CASH_QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => {
                    setCashReceived(String(amt));
                    if (amt >= remaining) handleQuickCash(amt);
                  }}
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
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setQuickCash(true)} className="flex-1 min-h-[44px]">
                Custom Amount
              </Button>
              <Button onClick={() => handleQuickCash(remaining)} disabled={submitted} className="flex-1 min-h-[44px]">
                Exact {formatCurrency(remaining)}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={remaining}
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setErrorMessage(''); }}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="method">Payment Method</Label>
              <Select
                id="method"
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value);
                  if (e.target.value !== "cash") setQuickCash(false);
                }}
                options={paymentMethods}
              />
            </div>

            {isCash && (
              <div className="space-y-2">
                <Label htmlFor="cashReceived">Amount Received</Label>
                <Input
                  id="cashReceived"
                  type="number"
                  step="1"
                  min="0"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                />
                {Number(cashReceived) > remaining && (
                  <p className="text-xs text-emerald-600 font-medium">
                    Change due: {formatCurrency(change)}
                  </p>
                )}
              </div>
            )}

            {!isCash && method === "credit_account" && (
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer Name</Label>
                <Input
                  id="customerName"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Required for credit"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reference">
                {method === "credit_account" ? "Reference" : "Reference (Transaction ID)"}
              </Label>
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={method === "credit_account" ? "Optional reference" : "Optional transaction ID"}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="min-h-[44px]">
                Cancel
              </Button>
              <Button type="submit" disabled={submitted || processPayment.isPending || processCashPayment.isPending} className="min-h-[44px]">
                {processPayment.isPending || processCashPayment.isPending ? "Processing..." : "Process Payment"}
              </Button>
            </div>
          </form>
        )}

        {errorMessage && (
          <p className="mt-2 text-sm text-destructive">{errorMessage}</p>
        )}
      </div>
    </div>
  );
}
