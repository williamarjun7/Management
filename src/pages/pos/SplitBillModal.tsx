import { useState, useMemo } from 'react';
import { X, UserPlus, UserMinus, Equal, ListOrdered, SlidersHorizontal } from 'lucide-react';
import { useCreateSplitBill, useSplits } from '../../lib/hooks';
import { useAuth } from '../../lib/core/auth-context';
import { showError } from '../../components/ui/toast';
import { formatCurrency } from '../../lib/core/format-currency';
import type { Invoice, OrderItem, SplitGuest } from '../../types';

interface SplitBillModalProps {
  invoice: Invoice;
  orderItems?: OrderItem[];
  onClose: () => void;
  onComplete?: () => void;
}

type SplitTab = 'equal' | 'item_based' | 'custom';

function npr(a: number) { return formatCurrency(a); }

export default function SplitBillModal({ invoice, orderItems, onClose, onComplete }: SplitBillModalProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SplitTab>('equal');
  const [guests, setGuests] = useState<SplitGuest[]>([
    { id: crypto.randomUUID(), name: 'Guest 1' },
    { id: crypto.randomUUID(), name: 'Guest 2' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const createSplit = useCreateSplitBill();
  const { data: existingSplits } = useSplits(invoice.id);

  const grandTotal = Number(invoice.total);

  const totalAssigned = useMemo(() => {
    if (activeTab === 'equal') return grandTotal;
    if (activeTab === 'custom') {
      return guests.reduce((s, g) => s + (g.amount ?? 0), 0);
    }
    return guests.reduce((s, g) => {
      return s + (g.items ?? []).reduce((si, item) => si + item.quantity * item.unit_price, 0);
    }, 0);
  }, [activeTab, guests, grandTotal]);

  const remaining = grandTotal - totalAssigned;
  const isValid = Math.abs(remaining) < 0.01 && guests.length > 0 && guests.every(g => {
    if (activeTab === 'custom') return (g.amount ?? 0) > 0;
    if (activeTab === 'item_based') return (g.items ?? []).length > 0;
    return true;
  });

  function addGuest() {
    setGuests(prev => [...prev, { id: crypto.randomUUID(), name: `Guest ${prev.length + 1}` }]);
  }

  function removeGuest(id: string) {
    if (guests.length <= 1) return;
    setGuests(prev => prev.filter(g => g.id !== id));
  }

  function renameGuest(id: string, name: string) {
    setGuests(prev => prev.map(g => g.id === id ? { ...g, name } : g));
  }

  function setGuestAmount(id: string, amount: number) {
    setGuests(prev => prev.map(g => g.id === id ? { ...g, amount: Math.max(0, amount) } : g));
  }

  function toggleItemForGuest(guestId: string, item: OrderItem) {
    setGuests(prev => prev.map(g => {
      if (g.id !== guestId) return g;
      const existing = g.items ?? [];
      const hasItem = existing.some(i => i.order_item_id === item.id);
      if (hasItem) {
        return { ...g, items: existing.filter(i => i.order_item_id !== item.id) };
      }
      return { ...g, items: [...existing, {
        order_item_id: item.id,
        item_name: item.item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }] };
    }));
  }

  function updateItemQuantity(guestId: string, orderItemId: string, qty: number) {
    setGuests(prev => prev.map(g => {
      if (g.id !== guestId) return g;
      return {
        ...g,
        items: (g.items ?? []).map(i =>
          i.order_item_id === orderItemId ? { ...i, quantity: Math.max(1, Math.min(qty, 99)) } : i
        ),
      };
    }));
  }

  function recalculateEqual() {
    const perPerson = grandTotal / guests.length;
    const rounded = Math.floor(perPerson * 100) / 100;
    const remainder = Math.round((perPerson - rounded) * 100);
    setGuests(prev => prev.map((g, i) => ({
      ...g,
      amount: i === prev.length - 1 ? rounded + remainder * 0.01 : rounded,
    })));
  }

  async function handleCreateSplits() {
    if (!user || !isValid || submitting) return;
    setSubmitting(true);
    try {
      const result = await createSplit.mutateAsync({
        p_invoice_id: invoice.id,
        p_order_id: invoice.order_id ?? undefined,
        p_split_type: activeTab,
        p_guests: guests.map((g, i) => ({
          guest_name: g.name,
          sort_order: i,
        })),
        p_processed_by: user.id,
      });

      const data = result as { success: boolean; splits: { id: string; guest_name: string; total_amount: number }[] };
      if (data?.success) {
        onClose();
        if (onComplete) onComplete();
      }
    } catch (err) {
      showError((err as Error)?.message || 'Failed to create split');
    } finally {
      setSubmitting(false);
    }
  }

  const tabs: { key: SplitTab; label: string; icon: React.ElementType }[] = [
    { key: 'equal', label: 'Equal', icon: Equal },
    { key: 'item_based', label: 'By Items', icon: ListOrdered },
    { key: 'custom', label: 'Custom', icon: SlidersHorizontal },
  ];

  if (existingSplits && existingSplits.length > 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="w-full max-w-2xl rounded-xl border bg-background p-6 shadow-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Existing Splits</h2>
            <button onClick={onClose} className="min-h-[44px] min-w-[44px]"><X className="h-4 w-4" /></button>
          </div>
          <p className="text-sm text-muted-foreground mb-4">This invoice already has splits. View them in the invoice detail page.</p>
          <div className="space-y-3">
            {existingSplits.map(split => (
              <div key={split.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">{split.guest_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{split.payment_status}</p>
                </div>
                <span className="font-bold">{npr(split.total_amount)}</span>
              </div>
            ))}
          </div>
          <button onClick={onClose} className="mt-4 w-full h-11 rounded-lg bg-primary text-background font-medium">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-3xl rounded-xl border bg-background shadow-lg max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Split Bill</h2>
            <p className="text-xs text-muted-foreground">{invoice.invoice_number} &mdash; {npr(grandTotal)}</p>
          </div>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] rounded-lg hover:bg-muted flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 p-3 bg-muted/50 mx-5 mt-3 rounded-lg shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'equal' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Bill will be split equally among all guests. Remainder goes to the last guest.</p>
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex justify-between text-sm mb-2">
                  <span>Total</span>
                  <span className="font-bold">{npr(grandTotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Per person</span>
                  <span className="font-medium">{npr(grandTotal / guests.length)}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'item_based' && orderItems && orderItems.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Assign menu items to each guest. Toggle items on/off for each guest.</p>
              <div className="rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Menu Items</p>
                <div className="space-y-1">
                  {orderItems.map(item => {
                    return (
                      <div key={item.id} className="flex items-center justify-between text-sm py-1">
                        <span>{item.item_name} x{item.quantity}</span>
                        <span className="text-muted-foreground">{npr(item.unit_price * item.quantity)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'custom' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Manually enter the amount each guest should pay.</p>
              <button
                onClick={recalculateEqual}
                className="text-xs text-primary hover:underline"
              >
                Auto-fill equal amounts
              </button>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Guests ({guests.length})</span>
              <button
                onClick={addGuest}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <UserPlus className="h-3 w-3" /> Add Guest
              </button>
            </div>
            {guests.map((guest, idx) => (
              <div key={guest.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                      {idx + 1}
                    </span>
                    <input
                      value={guest.name}
                      onChange={e => renameGuest(guest.id, e.target.value)}
                      className="text-sm font-medium bg-transparent outline-none border-b border-transparent hover:border-border focus:border-primary"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {activeTab === 'custom' && (
                      <span className="text-sm font-bold">{npr(guest.amount ?? 0)}</span>
                    )}
                    {activeTab === 'item_based' && (
                      <span className="text-xs text-muted-foreground">
                        {npr((guest.items ?? []).reduce((s, i) => s + i.quantity * i.unit_price, 0))}
                      </span>
                    )}
                    {guests.length > 1 && (
                      <button onClick={() => removeGuest(guest.id)} className="text-muted-foreground hover:text-destructive">
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {activeTab === 'custom' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Rs.</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      max={grandTotal}
                      value={guest.amount ?? ''}
                      onChange={e => setGuestAmount(guest.id, Number(e.target.value))}
                      placeholder="0.00"
                      className="flex-1 h-8 rounded border border-border bg-transparent px-2 text-sm outline-none"
                    />
                  </div>
                )}

                {activeTab === 'item_based' && orderItems && (
                  <div className="space-y-1 pl-8">
                    {orderItems.map(item => {
                      const isAssigned = (guest.items ?? []).some(i => i.order_item_id === item.id);
                      const assignedItem = (guest.items ?? []).find(i => i.order_item_id === item.id);
                      return (
                        <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                          <input
                            type="checkbox"
                            checked={isAssigned}
                            onChange={() => toggleItemForGuest(guest.id, item)}
                            className="rounded border-border"
                          />
                          <span className="flex-1">{item.item_name}</span>
                          {isAssigned && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={e => { e.preventDefault(); updateItemQuantity(guest.id, item.id, (assignedItem?.quantity ?? 1) - 1); }}
                                className="w-5 h-5 rounded border text-xs flex items-center justify-center"
                              >-</button>
                              <span className="w-5 text-center text-xs">{assignedItem?.quantity ?? 1}</span>
                              <button
                                type="button"
                                onClick={e => { e.preventDefault(); updateItemQuantity(guest.id, item.id, (assignedItem?.quantity ?? 1) + 1); }}
                                className="w-5 h-5 rounded border text-xs flex items-center justify-center"
                              >+</button>
                            </div>
                          )}
                          <span className="text-muted-foreground text-xs">
                            {npr(item.unit_price * (isAssigned ? (assignedItem?.quantity ?? 1) : 0))}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>Total</span>
            <span className="font-bold">{npr(grandTotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Assigned</span>
            <span className={Math.abs(remaining) < 0.01 ? 'text-green-600 font-medium' : 'text-destructive'}>
              {npr(totalAssigned)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Remaining</span>
            <span className={Math.abs(remaining) < 0.01 ? 'text-green-600' : 'text-amber-600 font-medium'}>
              {Math.abs(remaining) < 0.01 ? 'Rs. 0.00' : npr(remaining)}
            </span>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 h-11 rounded-lg border text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={handleCreateSplits}
              disabled={!isValid || submitting || createSplit.isPending}
              className="flex-1 h-11 rounded-lg bg-primary text-background text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
            >
              {submitting || createSplit.isPending ? 'Creating...' : `Split into ${guests.length} parts`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
