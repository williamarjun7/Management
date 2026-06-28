import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMenuCategories, useMenuItems, useTables, useCreateOrder, useActiveOrderByTable, useAddOrderItems } from '../../lib/hooks';
import { showSuccess, showError } from '../../components/ui/toast';
import { formatCurrency } from '../../lib/core/format-currency';
import { refreshTableStatus } from '../../lib/services/table-occupancy';
import { insforge } from '../../lib/core/insforge';
import { markInvoicePaidAndSync } from '../../lib/services/payment-workflow';
import type { MenuItem, RestaurantTable, Invoice, Order } from '../../types';
import { PrintInvoice } from '../billing/PrintInvoice';

async function generateInvoiceNumber(): Promise<string> {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const prefix = `HCM-${y}${m}${d}-`;
  const { data } = await insforge.database
    .from('invoices')
    .select('invoice_number')
    .like('invoice_number', `${prefix}%`)
    .order('invoice_number', { ascending: false })
    .limit(1);
  const lastSeq = (data as { invoice_number: string }[] | null)?.[0]?.invoice_number;
  const next = lastSeq ? parseInt(lastSeq.slice(-3), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}
import { Coffee, Egg, UtensilsCrossed, Wine, Search, X, Plus, Minus, User as UserIcon, Table2, CreditCard, ChevronLeft, ChevronRight, ShoppingCart, Grid3X3, ArrowLeft } from 'lucide-react';
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
  const [showPayment, setShowPayment] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentRemaining, setPaymentRemaining] = useState(0);
  const [payLoading, setPayLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [existingOrderId, setExistingOrderId] = useState<string | null>(null);
  const [originalItemIds, setOriginalItemIds] = useState<Set<string>>(new Set());
  const [showPrint, setShowPrint] = useState(false);
  const [printInvoiceData, setPrintInvoiceData] = useState<Invoice | null>(null);

  const addOrderItems = useAddOrderItems();
  const { data: activeOrder } = useActiveOrderByTable(selectedTableId);

  // Clear cart when table selection changes
  useEffect(() => {
    setExistingOrderId(null);
    setOriginalItemIds(new Set());
    setCart([]);
    setCustomerName('');
    setDiscountValue(0);
    setShowDiscount(false);
  }, [selectedTableId]);

  // Populate cart from existing order when query resolves
  useEffect(() => {
    if (!selectedTableId) return;
    if (activeOrder === undefined) return; // still loading

    if (activeOrder && activeOrder.table_id === selectedTableId) {
      setExistingOrderId(activeOrder.id);
      const ids = new Set((activeOrder.order_items ?? []).map(i => i.menu_item_id));
      setOriginalItemIds(ids);
      setCustomerName(activeOrder.customer_name ?? '');
      setCart((activeOrder.order_items ?? []).map(i => ({
        menu_item_id: i.menu_item_id,
        name: i.item_name,
        quantity: i.quantity,
        unit_price: Number(i.unit_price),
        notes: i.notes ?? '',
      })));
    } else if (activeOrder === null) {
      setExistingOrderId(null);
      setOriginalItemIds(new Set());
    }
  }, [activeOrder, selectedTableId]);

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

  const cartItemIds = new Set(cart.map(c => c.menu_item_id));

  const cartCountByItem = cart.reduce((acc, c) => { acc[c.menu_item_id] = (acc[c.menu_item_id] ?? 0) + c.quantity; return acc; }, {} as Record<string, number>);

  const cartCountByCategory = (categories ?? []).reduce((acc, cat) => {
    const catItems = (items ?? []).filter(i => i.category_id === cat.id);
    acc[cat.id] = catItems.reduce((sum, i) => sum + (cartCountByItem[i.id] ?? 0), 0);
    return acc;
  }, {} as Record<string, number>);
  const totalCartItems = cart.reduce((s, l) => s + l.quantity, 0);

  const q = searchQuery.toLowerCase();
  const filteredByCategory = selectedCat === 'all'
    ? (items ?? [])
    : (items ?? []).filter((i: MenuItem) => i.category_id === selectedCat);
  const filteredItems = q
    ? filteredByCategory.filter(i => i.name.toLowerCase().includes(q) || (i.description ?? '').toLowerCase().includes(q))
    : filteredByCategory;

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

  async function handlePay() {
    if (!selectedTableId) {
      showError('Please select a table first');
      return;
    }

    setPayLoading(true);
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
        const invoiceNumber = await generateInvoiceNumber();
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
    } finally {
      setPayLoading(false);
    }
  }

  async function handlePlaceOrder() {
    if (!selectedTableId || cart.length === 0) return;
    setSubmitting(true);
    try {
      if (existingOrderId) {
        const newItems = cart.filter(l => !originalItemIds.has(l.menu_item_id));
        if (newItems.length === 0) {
          showError('All items already on order — add more or change quantity');
          setSubmitting(false);
          return;
        }
        await addOrderItems.mutateAsync({
          order_id: existingOrderId,
          discount: discountAmount,
          items: newItems.map(l => ({
            menu_item_id: l.menu_item_id,
            item_name: l.name,
            quantity: l.quantity,
            unit_price: l.unit_price,
            notes: l.notes || undefined,
          })),
        });
        showSuccess('Items added to existing order');
      } else {
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

        await refreshTableStatus(selectedTableId);
        showSuccess('Order placed successfully');
      }

      setCart([]);
      setCustomerName('');
      setDiscountValue(0);
      setExistingOrderId(null);
      setOriginalItemIds(new Set());
    } catch (err) {
      showError((err as Error)?.message || 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-dvh">
      {/* Mobile top bar */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-border bg-card shrink-0 lg:hidden">
        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          <span>Home</span>
        </button>
        <span className="text-xs text-muted-foreground ml-auto">POS</span>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
      {/* Category sidebar: horizontal scroll on mobile, vertical on lg+ */}
      <div className="flex lg:flex-col items-center gap-2 lg:gap-1 p-2 lg:p-0 lg:py-4 lg:w-auto overflow-x-auto lg:overflow-x-visible border-b lg:border-b-0 lg:border-r border-border shrink-0">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="hidden lg:flex mb-2 p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
          title={sidebarOpen ? 'Collapse' : 'Expand'}
        >
          {sidebarOpen ? <ChevronLeft className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </button>
        <div className="flex lg:flex-col items-center gap-2 lg:gap-1 lg:w-full">
          <button
            onClick={() => setSelectedCat('all')}
            className={`flex flex-col items-center gap-1 lg:w-full px-2 shrink-0 ${selectedCat === 'all' ? 'opacity-100' : 'opacity-60 hover:opacity-100'} transition-opacity relative`}
          >
            <div className={`w-12 h-12 lg:w-14 lg:h-14 rounded-xl flex items-center justify-center ${selectedCat === 'all' ? 'bg-primary text-background' : 'bg-muted text-foreground'}`}>
              <Grid3X3 className="h-5 w-5 lg:h-6 lg:w-6" />
            </div>
            <span className="text-[11px] font-medium text-center leading-tight">All</span>
          </button>
          {(categories ?? []).map((cat) => {
            const Icon = getIconForCategory(cat.name);
            const catCount = cartCountByCategory[cat.id] ?? 0;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCat(cat.id)}
                className={`flex flex-col items-center gap-1 lg:w-full px-2 shrink-0 ${selectedCat === cat.id ? 'opacity-100' : 'opacity-60 hover:opacity-100'} transition-opacity relative`}
              >
                <div className={`relative w-12 h-12 lg:w-14 lg:h-14 rounded-xl flex items-center justify-center ${selectedCat === cat.id ? 'bg-primary text-background' : 'bg-muted text-foreground'}`}>
                  <Icon className="h-5 w-5 lg:h-6 lg:w-6" />
                  {catCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary text-[11px] font-bold text-background shadow-sm">
                      {catCount}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-medium text-center leading-tight">{cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="flex-1 p-4 lg:p-5 overflow-y-auto">
        <div className="mb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-1">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search items..."
                aria-label="Search menu items"
                className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="relative">
              <select
                value={selectedTableId}
                onChange={(e) => handleTableChange(e.target.value)}
                className="rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer"
              >
                <option value="">Select Table</option>
                {(tables ?? []).map((t: RestaurantTable) => (
                  <option key={t.id} value={t.id}>
                    {t.table_number} - {t.status} {t.capacity ? `(${t.capacity})` : ''}
                  </option>
                ))}
                <option value="takeaway">Takeaway</option>
              </select>
              <Table2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm flex-1 sm:flex-initial">
              <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                placeholder="Customer"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="bg-transparent outline-none w-24 text-sm"
              />
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">{availableItems.length} items</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {availableItems.map((item: MenuItem) => {
            const inCart = cartItemIds.has(item.id);
            const qty = cartCountByItem[item.id] ?? 0;
            return (
              <div
                key={item.id}
                onClick={() => { if (!inCart) addToCart(item); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!inCart) addToCart(item); } }}
                role="button"
                tabIndex={0}
                className={`group relative rounded-xl border overflow-hidden text-left cursor-pointer transition-all active:scale-[0.98] ${inCart ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/60 bg-card'}`}
              >
                <div className={`h-20 lg:h-24 flex items-center justify-center bg-gradient-to-br ${inCart ? 'from-primary/10 to-primary/5' : 'from-muted to-muted/50'}`}>
                  {inCart ? (
                    <span className="text-3xl font-bold text-primary/30">{qty}</span>
                  ) : (
                    <UtensilsCrossed className="h-7 w-7 text-muted-foreground/30" />
                  )}
                </div>
                <div className="absolute top-1.5 right-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold shadow-sm backdrop-blur-sm">
                  {npr(item.price)}
                </div>
                {inCart && (
                  <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 bg-primary text-background rounded-md px-1.5 py-0.5 text-xs font-bold shadow-sm">
                    <ShoppingCart className="h-3 w-3" />
                    {qty}
                  </div>
                )}
                <div className="p-2.5">
                  <h3 className="text-sm font-semibold truncate">{item.name}</h3>
                  {item.description && (
                    <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">{item.description}</p>
                  )}
                  {inCart && (
                    <div className="flex items-center gap-1 mt-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => updateQty(item.id, -1)}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-card hover:bg-muted transition-colors"
                        aria-label={`Decrease quantity of ${item.name}`}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-10 text-center text-sm font-bold tabular-nums">{qty}</span>
                      <button
                        onClick={() => addToCart(item)}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-primary text-background hover:bg-primary/90 transition-colors"
                        aria-label={`Increase quantity of ${item.name}`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Desktop cart sidebar (lg+) */}
      <aside className="hidden lg:flex w-96 bg-card border-l border-border flex-col shrink-0">
        <div className="p-5 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Current Order</h2>
              {totalCartItems > 0 && (
                <span className="flex items-center justify-center min-w-[22px] h-5 rounded-full bg-primary text-[11px] font-bold text-background px-1.5">
                  {totalCartItems}
                </span>
              )}
            </div>
            {cart.length > 0 && (
              <button onClick={() => setCart([])} className="text-xs text-destructive hover:underline">Clear All</button>
            )}
          </div>
          {customerName && (
            <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
              <UserIcon className="h-4 w-4 text-emerald-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">{customerName}</p>
              </div>
              <button onClick={() => setCustomerName('')} className="shrink-0">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          )}
          {selectedTableInfo && (
            <div className={`flex items-center gap-2 mt-2 rounded-lg px-3 py-2 text-sm font-medium ${selectedTableInfo.status === 'available' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20'}`}>
              <Table2 className="h-4 w-4 shrink-0" />
              <span>Table {selectedTableInfo.table_number}</span>
              {existingOrderId ? (
                <span className="text-[11px] ml-auto text-muted-foreground">Active Order</span>
              ) : (
                <span className="text-xs ml-auto capitalize">{selectedTableInfo.status}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mb-3 text-muted-foreground/30" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs mt-1">Tap items to add them</p>
            </div>
          ) : (
            cart.map((line) => (
              <div key={line.menu_item_id} className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                  {line.quantity}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{line.name}</span>
                    <span className="text-sm font-medium tabular-nums ml-2">{npr(line.unit_price * line.quantity)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <button
                      onClick={() => updateQty(line.menu_item_id, -1)}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
                      aria-label={`Decrease quantity of ${line.name}`}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-bold w-10 text-center tabular-nums">{line.quantity}</span>
                    <button
                      onClick={() => updateQty(line.menu_item_id, 1)}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
                      aria-label={`Increase quantity of ${line.name}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <input
                      placeholder="Notes"
                      value={line.notes}
                      onChange={(e) => updateNotes(line.menu_item_id, e.target.value)}
                      className="ml-auto min-h-[44px] w-20 rounded-md border border-border bg-transparent px-2 text-[11px] outline-none focus:ring-1 focus:ring-ring"
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
              <span className="text-sm tabular-nums">{npr(subtotal)}</span>
            </div>
            {cart.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setShowDiscount(!showDiscount)}
                  className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium hover:bg-muted/50 transition-colors"
                >
                  <span>Discount</span>
                  <div className="flex items-center gap-1.5">
                    {discountAmount > 0 && <span className="text-destructive">-{npr(discountAmount)}</span>}
                    <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showDiscount ? 'rotate-90' : ''}`} />
                  </div>
                </button>
                {showDiscount && (
                  <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                    <div className="flex items-center gap-1 rounded-md bg-muted p-0.5 w-fit">
                      <button
                        onClick={() => { setDiscountType('percentage'); setDiscountValue(0); }}
                        className={`px-2.5 py-1 text-xs rounded ${discountType === 'percentage' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
                      >%</button>
                      <button
                        onClick={() => { setDiscountType('fixed'); setDiscountValue(0); }}
                        className={`px-2.5 py-1 text-xs rounded ${discountType === 'fixed' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
                      >Rs.</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max={discountType === 'percentage' ? 100 : subtotal}
                        value={discountValue || ''}
                        onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
                        placeholder={discountType === 'percentage' ? '0%' : '0'}
                        className="flex-1 h-8 rounded-md border border-border bg-transparent px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                      />
                      {discountAmount > 0 && (
                        <button onClick={() => setDiscountValue(0)} className="text-xs text-destructive hover:underline shrink-0">Clear</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
              <span>Total</span>
              <span className="tabular-nums">{npr(total)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handlePay}
              disabled={payLoading || totalCartItems === 0}
              className="h-12 rounded-lg bg-primary text-background text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {payLoading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" /> : <CreditCard className="h-4 w-4" />}
              {payLoading ? 'Preparing...' : 'Pay'}
            </button>
            <button
              onClick={() => navigate('/billing')}
              className="h-12 rounded-lg border-2 border-border text-sm font-medium hover:bg-muted transition-colors"
            >
              View Bills
            </button>
          </div>
          <button
            onClick={handlePlaceOrder}
            disabled={!selectedTableId || cart.length === 0 || submitting || createOrder.isPending}
            className="w-full h-14 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-background font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:from-emerald-400 hover:to-emerald-500 transition-all active:scale-[0.99] shadow-sm"
          >
            {submitting || createOrder.isPending ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                Placing Order...
              </div>
            ) : existingOrderId ? (
              <>Add Items{totalCartItems > 0 && ` (${totalCartItems})`}</>
            ) : (
              <>Place Order{totalCartItems > 0 && ` (${totalCartItems})`}</>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile cart drawer */}
      {mobileCartOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMobileCartOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl bg-card shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">Current Order</h2>
                {totalCartItems > 0 && (
                  <span className="flex items-center justify-center min-w-[22px] h-5 rounded-full bg-primary text-[11px] font-bold text-background px-1.5">
                    {totalCartItems}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button onClick={() => setCart([])} className="text-xs text-destructive hover:underline">Clear All</button>
                )}
                <button onClick={() => setMobileCartOpen(false)} className="p-1 hover:bg-muted rounded-lg transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            {customerName && (
              <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-b border-border">
                <UserIcon className="h-4 w-4 text-emerald-400 shrink-0" />
                <p className="text-sm font-medium flex-1">{customerName}</p>
                <button onClick={() => setCustomerName('')} className="shrink-0">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            )}
            {selectedTableInfo && (
              <div className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b border-border ${selectedTableInfo.status === 'available' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20'}`}>
                <Table2 className="h-4 w-4 shrink-0" />
                <span>Table {selectedTableInfo.table_number}</span>
                {existingOrderId ? (
                  <span className="text-[11px] ml-auto text-muted-foreground">Active Order</span>
                ) : (
                  <span className="text-xs ml-auto capitalize">{selectedTableInfo.status}</span>
                )}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ShoppingCart className="h-10 w-10 mb-3 text-muted-foreground/30" />
                  <p className="text-sm">Cart is empty</p>
                  <p className="text-xs mt-1">Tap items to add them</p>
                </div>
              ) : (
                cart.map((line) => (
                  <div key={line.menu_item_id} className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                      {line.quantity}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{line.name}</span>
                        <span className="text-sm font-medium tabular-nums ml-2">{npr(line.unit_price * line.quantity)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <button
                          onClick={() => updateQty(line.menu_item_id, -1)}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
                          aria-label={`Decrease quantity of ${line.name}`}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="text-sm font-bold w-10 text-center tabular-nums">{line.quantity}</span>
                        <button
                          onClick={() => updateQty(line.menu_item_id, 1)}
                          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
                          aria-label={`Increase quantity of ${line.name}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <input
                          placeholder="Notes"
                          value={line.notes}
                          onChange={(e) => updateNotes(line.menu_item_id, e.target.value)}
                          className="ml-auto min-h-[44px] w-20 rounded-md border border-border bg-transparent px-2 text-[11px] outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 bg-card border-t border-border space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Subtotal</span>
                <span className="text-sm tabular-nums">{npr(subtotal)}</span>
              </div>
              {cart.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <button
                    onClick={() => setShowDiscount(!showDiscount)}
                    className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium hover:bg-muted/50 transition-colors"
                  >
                    <span>Discount</span>
                    <div className="flex items-center gap-1.5">
                      {discountAmount > 0 && <span className="text-destructive">-{npr(discountAmount)}</span>}
                      <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showDiscount ? 'rotate-90' : ''}`} />
                    </div>
                  </button>
                  {showDiscount && (
                    <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                      <div className="flex items-center gap-1 rounded-md bg-muted p-0.5 w-fit">
                        <button
                          onClick={() => { setDiscountType('percentage'); setDiscountValue(0); }}
                          className={`px-2.5 py-1 text-xs rounded ${discountType === 'percentage' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
                        >%</button>
                        <button
                          onClick={() => { setDiscountType('fixed'); setDiscountValue(0); }}
                          className={`px-2.5 py-1 text-xs rounded ${discountType === 'fixed' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
                        >Rs.</button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max={discountType === 'percentage' ? 100 : subtotal}
                          value={discountValue || ''}
                          onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
                          placeholder={discountType === 'percentage' ? '0%' : '0'}
                          className="flex-1 h-8 rounded-md border border-border bg-transparent px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                        />
                        {discountAmount > 0 && (
                          <button onClick={() => setDiscountValue(0)} className="text-xs text-destructive hover:underline shrink-0">Clear</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
                <span>Total</span>
                <span className="tabular-nums">{npr(total)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handlePay}
                  disabled={payLoading || totalCartItems === 0}
                  className="h-12 rounded-lg bg-primary text-background text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {payLoading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" /> : <CreditCard className="h-4 w-4" />}
                  {payLoading ? 'Preparing...' : 'Pay'}
                </button>
                <button
                  onClick={() => navigate('/billing')}
                  className="h-12 rounded-lg border-2 border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  View Bills
                </button>
              </div>
              <button
                onClick={handlePlaceOrder}
                disabled={!selectedTableId || cart.length === 0 || submitting || createOrder.isPending}
                className="w-full h-14 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-background font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:from-emerald-400 hover:to-emerald-500 transition-all active:scale-[0.99] shadow-sm"
              >
                {submitting || createOrder.isPending ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                    Placing Order...
                  </div>
                ) : existingOrderId ? (
                  <>Add Items{totalCartItems > 0 && ` (${totalCartItems})`}</>
                ) : (
                  <>Place Order{totalCartItems > 0 && ` (${totalCartItems})`}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile cart FAB */}
      <button
        onClick={() => setMobileCartOpen(true)}
        className="fixed bottom-20 right-4 z-40 lg:hidden flex items-center justify-center w-14 h-14 rounded-full bg-primary text-background shadow-lg active:scale-95 transition-transform"
        aria-label={`Open cart with ${totalCartItems} items`}
      >
        <ShoppingCart className="h-6 w-6" />
        {totalCartItems > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[22px] h-5 rounded-full bg-destructive text-[11px] font-bold text-background px-1.5 shadow-sm">
            {totalCartItems}
          </span>
        )}
      </button>

      {showPrint && printInvoiceData && (
        <PrintInvoice
          invoice={printInvoiceData}
          onClose={() => { setShowPrint(false); setPrintInvoiceData(null); }}
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
            setPrintInvoiceData(paymentInvoice);
            setShowPrint(true);
            showSuccess('Payment completed');
          }}
        />
      )}
      </div>
    </div>
  );
}
