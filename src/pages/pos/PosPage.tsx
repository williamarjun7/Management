import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMenuCategories, useMenuItems, useTables, useCreateOrder } from '../../lib/hooks';
import { showSuccess, showError } from '../../components/ui/toast';
import { formatCurrency } from '../../lib/core/format-currency';
import { updateTableStatus } from '../../components/tables/table.service';
import { insforge } from '../../lib/core/insforge';
import { markInvoicePaidAndSync } from '../../lib/services/payment-workflow';
import type { MenuItem, RestaurantTable, Invoice, Order } from '../../types';
import { Coffee, Egg, UtensilsCrossed, Wine, Search, X, Plus, Minus, User as UserIcon, Table2, Receipt, CreditCard } from 'lucide-react';
import SplitBillModal from './SplitBillModal';
import { PaymentCheckout } from '../../components/PaymentCheckout';

interface CartItem {
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  notes: string;
}

const categoryIcons: Record<string, React.ElementType> = {
  coffee: Coffee,
  breakfast: Egg,
  lunch: UtensilsCrossed,
  bar: Wine,
};

function getIconForCategory(name: string): React.ElementType {
  const key = Object.keys(categoryIcons).find(
    (k) => name.toLowerCase().includes(k)
  );
  return key ? categoryIcons[key] : UtensilsCrossed;
}

export default function PosPage() {
  const { data: categories } = useMenuCategories();
  const { data: items } = useMenuItems();
  const { data: tables } = useTables();
  const createOrder = useCreateOrder();
  const npr = (amount: number) => formatCurrency(amount);
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState(0);
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitInvoice, setSplitInvoice] = useState<Invoice | null>(null);
  const [splitOrderItems, setSplitOrderItems] = useState<Order['order_items']>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentRemaining, setPaymentRemaining] = useState(0);

  // Auto-select table from URL param (set by dashboard click)
  useEffect(() => {
    const tableParam = searchParams.get('table');
    if (tableParam && (tables ?? []).some((t: RestaurantTable) => t.id === tableParam)) {
      setSelectedTableId(tableParam);
    }
  }, [tables, searchParams]);

  // When table changes via dropdown, update URL to retain selection
  const handleTableChange = (tableId: string) => {
    setSelectedTableId(tableId);
    if (tableId) {
      setSearchParams({ table: tableId }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const filteredItems = selectedCat === 'all'
    ? (items ?? [])
    : (items ?? []).filter((i: MenuItem) => i.category_id === selectedCat);

  const availableItems = filteredItems.filter((i: MenuItem) => i.is_available);

  const selectedTableInfo = (tables ?? []).find((t: RestaurantTable) => t.id === selectedTableId);

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((l) => l.menu_item_id === item.id);
      if (existing) {
        return prev.map((l) =>
          l.menu_item_id === item.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        { menu_item_id: item.id, name: item.name, quantity: 1, unit_price: item.price, notes: '' },
      ];
    });
  }

  function updateQty(menuItemId: string, delta: number) {
    setCart((prev) =>
      prev.map((l) =>
        l.menu_item_id === menuItemId
          ? { ...l, quantity: Math.max(0, l.quantity + delta) }
          : l
      ).filter((l) => l.quantity > 0)
    );
  }

  function updateNotes(menuItemId: string, notes: string) {
    setCart((prev) =>
      prev.map((l) =>
        l.menu_item_id === menuItemId ? { ...l, notes } : l
      )
    );
  }

  const subtotal = cart.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const discountAmount = discountType === 'percentage'
    ? Math.min(subtotal * (Math.min(discountValue, 100) / 100), subtotal)
    : Math.min(discountValue, subtotal);
  const total = subtotal - discountAmount;

  async function handleBill() {
    if (!selectedTableId) {
      showError('Please select a table first');
      return;
    }

    try {
      // Find the latest non-cancelled order for this table
      const { data: tableOrders, error: orderErr } = await insforge.database
        .from('orders')
        .select('*, order_items(*)')
        .eq('table_id', selectedTableId)
        .not('status', 'in', '("cancelled","refunded")')
        .order('created_at', { ascending: false })
        .limit(1);

      if (orderErr) throw orderErr;
      const latestOrder = (tableOrders as Order[])?.[0];

      if (!latestOrder) {
        showError('No active orders for this table. Place an order first.');
        return;
      }

      // Check if an invoice already exists for this order
      const { data: existingInvoices, error: invErr } = await insforge.database
        .from('invoices')
        .select('*, invoice_items(*)')
        .eq('order_id', latestOrder.id)
        .limit(1);

      if (invErr) throw invErr;
      let invoice = (existingInvoices as Invoice[])?.[0];

      if (!invoice) {
        // Create a new invoice
        const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
        const { data: newInvoice, error: createErr } = await insforge.database
          .from('invoices')
          .insert([{
            invoice_number: invoiceNumber,
            order_id: latestOrder.id,
            customer_name: latestOrder.customer_name,
            customer_phone: latestOrder.customer_phone,
            subtotal: latestOrder.subtotal,
            discount: latestOrder.discount,
            total: latestOrder.total,
            status: 'unpaid',
          }])
          .select('*, invoice_items(*)')
          .single();

        if (createErr) throw createErr;
        invoice = newInvoice as Invoice;

        // Create invoice items from order items
        if (latestOrder.order_items && latestOrder.order_items.length > 0) {
          const invoiceItems = latestOrder.order_items.map(item => ({
            invoice_id: invoice.id,
            description: item.item_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.unit_price * item.quantity,
            reference_type: 'order_item',
            reference_id: item.id,
          }));
          await insforge.database.from('invoice_items').insert(invoiceItems);
        }
      }

      setSplitInvoice(invoice);
      setSplitOrderItems(latestOrder.order_items ?? []);
      setShowSplitModal(true);
    } catch (err) {
      showError((err as Error)?.message || 'Failed to prepare bill');
    }
  }

  async function handlePay() {
    if (!selectedTableId) {
      showError('Please select a table first');
      return;
    }

    try {
      const { data: tableOrders, error: orderErr } = await insforge.database
        .from('orders')
        .select('*, order_items(*)')
        .eq('table_id', selectedTableId)
        .not('status', 'in', '("cancelled","refunded")')
        .order('created_at', { ascending: false })
        .limit(1);

      if (orderErr) throw orderErr;
      const latestOrder = (tableOrders as Order[])?.[0];

      if (!latestOrder) {
        showError('No active orders for this table');
        return;
      }

      const { data: invoices, error: invErr } = await insforge.database
        .from('invoices')
        .select('*, invoice_items(*), payment_logs(*)')
        .eq('order_id', latestOrder.id)
        .limit(1);

      if (invErr) throw invErr;
      let invoice = (invoices as Invoice[])?.[0];

      if (!invoice) {
        const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
        const { data: newInvoice, error: createErr } = await insforge.database
          .from('invoices')
          .insert([{
            invoice_number: invoiceNumber,
            order_id: latestOrder.id,
            customer_name: latestOrder.customer_name,
            customer_phone: latestOrder.customer_phone,
            subtotal: latestOrder.subtotal,
            discount: latestOrder.discount,
            total: latestOrder.total,
            status: 'unpaid',
          }])
          .select('*, invoice_items(*), payment_logs(*)')
          .single();

        if (createErr) throw createErr;
        invoice = newInvoice as Invoice;

        if (latestOrder.order_items && latestOrder.order_items.length > 0) {
          const invItems = latestOrder.order_items.map(item => ({
            invoice_id: invoice.id,
            description: item.item_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.unit_price * item.quantity,
            reference_type: 'order_item',
            reference_id: item.id,
          }));
          await insforge.database.from('invoice_items').insert(invItems);
        }
      }

      const paidAmount = (invoice.payment_logs ?? []).reduce((s, p) => s + Number(p.amount), 0);
      const remaining = Number(invoice.total) - paidAmount;

      setPaymentInvoice(invoice);
      setPaymentRemaining(remaining);
      setShowPayment(true);
    } catch (err) {
      showError((err as Error)?.message || 'Failed to prepare payment');
    }
  }

  async function handlePlaceOrder() {
    if (!selectedTableId || cart.length === 0) return;
    setSubmitting(true);
    try {
      await createOrder.mutateAsync({
        table_id: selectedTableId,
        customer_name: customerName.trim() || undefined,
        discount: discountAmount,
        items: cart.map((l) => ({
          menu_item_id: l.menu_item_id,
          item_name: l.name,
          quantity: l.quantity,
          unit_price: l.unit_price,
          notes: l.notes || undefined,
        })),
      });

      // Update table status to occupied/ordering
      await updateTableStatus(selectedTableId, 'ordering');

      showSuccess('Order placed successfully');
      setCart([]);
      setCustomerName('');
      setDiscountValue(0);
    } catch (err) {
      showError((err as Error)?.message || 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] -m-6">
      <aside className="w-24 bg-card border-r border-border flex flex-col items-center py-4 gap-4 shrink-0">
        <button
          onClick={() => setSelectedCat('all')}
          className={`flex flex-col items-center gap-1 w-full px-2 ${selectedCat === 'all' ? 'opacity-100' : 'opacity-60 hover:opacity-100'} transition-opacity`}
        >
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${selectedCat === 'all' ? 'bg-primary text-background' : 'bg-muted text-foreground'}`}>
            <Search className="h-6 w-6" />
          </div>
          <span className="text-[10px] font-medium text-center leading-tight">All</span>
        </button>
        {(categories ?? []).map((cat) => {
          const Icon = getIconForCategory(cat.name);
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={`flex flex-col items-center gap-1 w-full px-2 ${selectedCat === cat.id ? 'opacity-100' : 'opacity-60 hover:opacity-100'} transition-opacity`}
            >
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${selectedCat === cat.id ? 'bg-primary text-background' : 'bg-muted text-foreground'}`}>
                <Icon className="h-6 w-6" />
              </div>
              <span className="text-[10px] font-medium text-center leading-tight">{cat.name}</span>
            </button>
          );
        })}
      </aside>

      <section className="flex-1 p-5 overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={selectedTableId}
                onChange={(e) => handleTableChange(e.target.value)}
                className="rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer"
              >
                <option value="">Select Table</option>
                {(tables ?? []).map((t: RestaurantTable) => (
                  <option key={t.id} value={t.id}>
                    Table {t.table_number} - {t.status} {t.capacity ? `(${t.capacity}pax)` : ''}
                  </option>
                ))}
                <option value="takeaway">Takeaway</option>
              </select>
              <Table2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
            {selectedTableInfo && (
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                selectedTableInfo.status === 'available' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {selectedTableInfo.status}
              </span>
            )}
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <input
                placeholder="Customer name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="bg-transparent outline-none w-32 text-sm"
              />
            </div>
          </div>
          <span className="text-xs text-muted-foreground">Showing {availableItems.length} items</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {availableItems.map((item: MenuItem) => (
            <button
              key={item.id}
              onClick={() => addToCart(item)}
              className="group relative rounded-xl border border-border bg-card overflow-hidden text-left hover:border-primary transition-colors active:scale-[0.98]"
            >
              <div className="h-28 bg-muted flex items-center justify-center">
                <UtensilsCrossed className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div className="absolute top-2 right-2 rounded-lg bg-background/80 px-2 py-0.5 text-xs font-medium backdrop-blur-sm">
                {npr(item.price)}
              </div>
              <div className="p-3">
                <h3 className="text-sm font-semibold truncate">{item.name}</h3>
                {item.description && (
                  <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      <aside className="w-96 bg-card border-l border-border flex flex-col shrink-0">
        <div className="p-5 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Current Order</h2>
            {cart.length > 0 && (
              <button onClick={() => setCart([])} className="text-xs text-destructive hover:underline">Clear All</button>
            )}
          </div>
          {customerName && (
            <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
              <UserIcon className="h-4 w-4 text-emerald-400" />
              <div className="flex-1">
                <p className="text-sm font-medium">{customerName}</p>
              </div>
              <button onClick={() => setCustomerName('')}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          )}
          {selectedTableInfo && (
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <Table2 className="h-3 w-3" />
              <span>Table {selectedTableInfo.table_number}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {cart.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Select items to add to order</p>
          ) : (
            cart.map((line) => (
              <div key={line.menu_item_id} className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-sm font-bold shrink-0">
                  {line.quantity}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{line.name}</span>
                    <span className="text-sm font-medium">{npr(line.unit_price * line.quantity)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => updateQty(line.menu_item_id, -1)}
                      className="flex h-6 w-6 items-center justify-center rounded border border-border text-xs"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="text-xs w-5 text-center">{line.quantity}</span>
                    <button
                      onClick={() => updateQty(line.menu_item_id, 1)}
                      className="flex h-6 w-6 items-center justify-center rounded border border-border text-xs"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <input
                      placeholder="Notes"
                      value={line.notes}
                      onChange={(e) => updateNotes(line.menu_item_id, e.target.value)}
                      className="ml-auto h-6 w-24 rounded border border-border bg-transparent px-2 text-[10px] outline-none"
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

          <div className="p-5 bg-card border-t border-border space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="text-sm">{npr(subtotal)}</span>
            </div>
            {cart.length > 0 && (
              <div className="space-y-1.5 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Discount</span>
                  <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
                    <button
                      onClick={() => { setDiscountType('percentage'); setDiscountValue(0); }}
                      className={`px-2 py-0.5 text-xs rounded ${discountType === 'percentage' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
                    >%</button>
                    <button
                      onClick={() => { setDiscountType('fixed'); setDiscountValue(0); }}
                      className={`px-2 py-0.5 text-xs rounded ${discountType === 'fixed' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
                    >Rs.</button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max={discountType === 'percentage' ? 100 : subtotal}
                    value={discountValue || ''}
                    onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
                    placeholder={discountType === 'percentage' ? '0%' : '0'}
                    className="flex-1 h-8 rounded border border-border bg-transparent px-2 text-xs outline-none"
                  />
                  {discountAmount > 0 && (
                    <button
                      onClick={() => setDiscountValue(0)}
                      className="text-xs text-destructive hover:underline"
                    >Clear</button>
                  )}
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-xs text-destructive">
                    <span>Savings</span>
                    <span>- {npr(discountAmount)}</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-1 border-t border-border">
              <span>Total</span>
              <span>{npr(total)}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handlePay}
              className="h-11 rounded-lg bg-primary text-background text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
            >
              <CreditCard className="h-4 w-4" /> Pay
            </button>
            <button
              onClick={handleBill}
              className="h-11 rounded-lg border-2 border-border text-sm font-medium hover:bg-muted transition-colors flex items-center justify-center gap-2"
            >
              <Receipt className="h-4 w-4" /> Bill
            </button>
            <button
              onClick={() => navigate('/billing')}
              className="h-11 rounded-lg border-2 border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              View Bills
            </button>
          </div>
          <button
            onClick={handlePlaceOrder}
            disabled={!selectedTableId || cart.length === 0 || submitting || createOrder.isPending}
            className="w-full h-14 rounded-lg bg-emerald-500 text-background font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-400 transition-colors active:scale-[0.99]"
          >
            {submitting || createOrder.isPending ? 'Placing Order...' : 'Place Order'}
          </button>
        </div>
      </aside>
      {showSplitModal && splitInvoice && (
        <SplitBillModal
          invoice={splitInvoice}
          orderItems={splitOrderItems as any}
          onClose={() => { setShowSplitModal(false); setSplitInvoice(null); }}
          onComplete={() => { setShowSplitModal(false); setSplitInvoice(null); }}
        />
      )}

      {showPayment && paymentInvoice && (
        <PaymentCheckout
          invoice={paymentInvoice}
          remaining={paymentRemaining}
          onClose={() => { setShowPayment(false); setPaymentInvoice(null); }}
          onComplete={async () => {
            await markInvoicePaidAndSync(
              paymentInvoice.id,
              selectedTableId || undefined,
            ).catch(() => {});
            setShowPayment(false);
            setPaymentInvoice(null);
            showSuccess('Payment completed');
            setTimeout(() => { window.print(); }, 300);
          }}
        />
      )}
    </div>
  );
}
