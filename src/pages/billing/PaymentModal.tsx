import { useState, useRef } from "react";
import { X } from "lucide-react";
import { useProcessPayment } from "../../lib/hooks";
import { useAuth } from "../../lib/core/auth-context";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { showSuccess, showError } from "../../components/ui/toast";
import type { Invoice } from "../../types";

const paymentMethods = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
  { value: "credit_account", label: "Credit Account" },
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
  const [submitted, setSubmitted] = useState(false);
  const [idempotencyKey] = useState(() => `payment:${invoice.id}:${Date.now()}`);
  const processPayment = useProcessPayment();
  const submitLockRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || submitted || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitted(true);
    try {
      await processPayment.mutateAsync({
        p_invoice_id: invoice.id,
        p_amount: Number(amount),
        p_method: method,
        p_processed_by: user.id,
        p_idempotency_key: idempotencyKey,
        p_reference: reference || undefined,
        p_notes: notes || undefined,
      });
      showSuccess(`Payment of Rs. ${Number(amount).toFixed(2)} recorded for ${invoice.invoice_number}`);
      onClose();
    } catch (err) {
      const msg = (err as Error)?.message || "Payment failed";
      if (msg.includes("already processed") || msg.includes("idempotency")) {
        showSuccess("Payment was already processed successfully. No duplicate charge was created.");
        onClose();
      } else {
        showError(msg);
        submitLockRef.current = false;
        setSubmitted(false);
      }
    }
  };

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
            <span className="font-medium">Rs. {Number(invoice.total).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Remaining</span>
            <span className="font-medium">Rs. {remaining.toFixed(2)}</span>
          </div>
        </div>

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
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="method">Payment Method</Label>
            <Select
              id="method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              options={paymentMethods}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reference">Reference (Transaction ID)</Label>
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional transaction ID"
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
            <Button type="submit" disabled={submitted || processPayment.isPending} className="min-h-[44px]">
              {processPayment.isPending ? "Processing..." : "Process Payment"}
            </Button>
          </div>
        </form>

        {processPayment.isError && !submitted && (
          <p className="mt-2 text-sm text-destructive">
            {(processPayment.error as Error)?.message || "Payment failed"}
          </p>
        )}
      </div>
    </div>
  );
}
