import { useState, useRef } from 'react';
import { X } from 'lucide-react';
import { useAddSplitPayment } from '../../lib/hooks';
import { useAuth } from '../../lib/core/auth-context';
import { showError } from '../../components/ui/toast';
import { formatCurrency } from '../../lib/core/format-currency';
import type { BillSplit } from '../../types';

interface SplitPaymentModalProps {
  split: BillSplit;
  onClose: () => void;
  onComplete?: () => void;
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'credit_account', label: 'Credit Account' },
  { value: 'fonepay', label: 'FonePay' },
  { value: 'digital_wallet', label: 'Digital Wallet' },
  { value: 'mixed', label: 'Mixed' },
];

function npr(a: number) { return formatCurrency(a); }

export default function SplitPaymentModal({ split, onClose, onComplete }: SplitPaymentModalProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState(String(split.total_amount));
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [idempotencyKey] = useState(() => `split_pay:${split.id}:${Date.now()}`);
  const addPayment = useAddSplitPayment();
  const submitLockRef = useRef(false);

  const paidSoFar = (split.split_payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const remaining = split.total_amount - paidSoFar;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || submitted || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitted(true);
    try {
      await addPayment.mutateAsync({
        p_split_id: split.id,
        p_amount: Number(amount),
        p_payment_method: method,
        p_transaction_reference: reference || undefined,
        p_processed_by: user.id,
        p_idempotency_key: idempotencyKey,
      });
      if (onComplete) onComplete();
      onClose();
    } catch (err) {
      const msg = (err as Error)?.message || 'Payment failed';
      if (msg.includes('already processed') || msg.includes('idempotency')) {
        if (onComplete) onComplete();
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
          <h2 className="text-lg font-semibold">Pay for {split.guest_name}</h2>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 rounded-lg border bg-muted p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Split Total</span>
            <span className="font-medium">{npr(split.total_amount)}</span>
          </div>
          {paidSoFar > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid</span>
              <span className="font-medium text-green-600">{npr(paidSoFar)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Remaining</span>
            <span className="font-medium">{npr(remaining)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Amount</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={remaining}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full h-10 rounded-lg border border-border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Payment Method</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              className="w-full h-10 rounded-lg border border-border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {PAYMENT_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Reference (Transaction ID)</label>
            <input
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="Optional transaction ID"
              className="w-full h-10 rounded-lg border border-border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="h-11 px-4 rounded-lg border text-sm font-medium hover:bg-muted">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitted || addPayment.isPending}
              className="h-11 px-4 rounded-lg bg-primary text-background text-sm font-medium disabled:opacity-50"
            >
              {addPayment.isPending ? 'Processing...' : `Pay ${npr(Number(amount))}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
