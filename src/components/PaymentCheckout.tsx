import { useState, useRef, useMemo, useEffect } from "react";
import { X, QrCode, Banknote, CreditCard, Check, ArrowLeft, Loader2, AlertCircle, Search, Users, Percent, DollarSign, UserPlus, Phone } from "lucide-react";
import { Button } from "./ui/button";
import { useProcessPayment, useProcessCashPayment } from "../lib/hooks";
import { useAuth } from "../lib/core/auth-context";
import { useSettings } from "../lib/core/settings-context";
import { showSuccess, showError } from "./ui/toast";
import { formatCurrency } from "../lib/core/format-currency";
import { FonepayQRDialog } from "./FonepayQRDialog";
import { CASH_QUICK_AMOUNTS, type Invoice, type Order } from "../types";
import { calculateChange, calculateRemainingDue, isPaymentSufficient, calculateOrderDiscount } from "../lib/core/financial-calculations";
import { insforge } from "../lib/core/insforge";

interface PaymentCheckoutProps {
  order: Order;
  tableId: string;
  customerName: string;
  onClose: () => void;
  onComplete: (invoice: Invoice) => void;
}

type PaymentTab = "review" | "cash" | "fonepay" | "credit";

interface CustomerResult {
  id: string;
  customer_id: string;
  name: string;
  phone: string | null;
  outstanding_balance: number;
  credit_limit: number;
  status: string;
}

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

export function PaymentCheckout({ order, customerName, onClose, onComplete }: PaymentCheckoutProps) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const initialTab = settings.pos.default_payment_method === 'cash' ? 'cash' as const
    : settings.pos.default_payment_method === 'fonepay' ? 'fonepay' as const
    : settings.pos.default_payment_method === 'credit_account' ? 'credit' as const
    : 'review' as const;
  const [tab, setTab] = useState<PaymentTab>(initialTab);
  const processPayment = useProcessPayment();
  const processCashPayment = useProcessCashPayment();
  const [cashReceived, setCashReceived] = useState('');
  const [creditSearch, setCreditSearch] = useState(customerName || "");
  const [creditPhone, setCreditPhone] = useState(order.customer_phone || "");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);
  const [searchResults, setSearchResults] = useState<CustomerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [noCustomerFound, setNoCustomerFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showFonepay, setShowFonepay] = useState(false);
  const [fonepayInvoice, setFonepayInvoice] = useState<Invoice | null>(null);
  const submitLockRef = useRef(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Customer creation form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    phone: '',
  });

  // Discount state (only in checkout)
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState(0);

  // Pricing — single source of truth
  const orderItems = order.order_items ?? [];
  const subtotal = useMemo(() =>
    orderItems.reduce((s, i) => s + Number(i.unit_price) * i.quantity, 0),
    [orderItems]
  );
  const discountAmount = useMemo(() =>
    calculateOrderDiscount(subtotal, discountType, discountValue),
    [subtotal, discountType, discountValue]
  );
  const grandTotal = subtotal - discountAmount;

  useEffect(() => {
    if (settings.pos.default_payment_method === 'cash' && tab === 'cash') {
      setCashReceived(String(grandTotal));
    }
  }, [settings.pos.default_payment_method, tab, grandTotal]);

  const cashReceivedNum = Number(cashReceived) || 0;
  const change = calculateChange(cashReceivedNum, grandTotal);
  const remainingDue = calculateRemainingDue(cashReceivedNum, grandTotal);
  const sufficient = isPaymentSufficient(cashReceivedNum, grandTotal);

  async function saveDiscountAndCreateInvoice(): Promise<Invoice> {
    await insforge.database
      .from('orders')
      .update({
        discount: discountAmount,
        discount_type: discountType,
        discount_value: discountValue,
        total: grandTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    const invoiceNumber = await generateInvoiceNumber();

    const customer_id = selectedCustomer?.id || null;
    const customer_name = selectedCustomer?.name || order.customer_name || null;
    const customer_phone = selectedCustomer?.phone || order.customer_phone || null;

    const { data: newInvoice, error: createErr } = await insforge.database
      .from('invoices')
      .insert([{
        invoice_number: invoiceNumber,
        order_id: order.id,
        customer_name,
        customer_phone,
        customer_id,
        subtotal,
        discount: discountAmount,
        discount_type: discountType,
        discount_value: discountValue,
        tax: order.tax ?? 0,
        tax_rate: order.tax_rate ?? 0,
        service_charge: order.service_charge ?? 0,
        service_charge_rate: order.service_charge_rate ?? 0,
        total: grandTotal,
        status: 'pending',
      }])
      .select('*, invoice_items(*), payment_logs(*)')
      .single();

    if (createErr) throw createErr;
    const invoice = newInvoice as Invoice;

    if (orderItems.length > 0) {
      const invItems = orderItems.map(item => ({
        invoice_id: invoice.id,
        description: item.item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount ?? 0,
        discount_type: item.discount_type ?? null,
        discount_value: item.discount_value ?? 0,
        total: Number(item.unit_price) * item.quantity - (item.discount ?? 0),
        reference_type: 'order_item',
        reference_id: item.id,
      }));
      await insforge.database.from('invoice_items').insert(invItems);
    }

    return invoice;
  }

  const handlePaymentError = (err: unknown, fallbackMsg: string) => {
    const msg = (err as Error)?.message || "";
    if (msg.includes("already processed") || msg.includes("idempotency")) {
      showSuccess("Payment was already processed");
    } else {
      showError(msg || fallbackMsg);
    }
  };

  const handleCashExact = async () => {
    if (!user || submitting || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const invoice = await saveDiscountAndCreateInvoice();
      const key = `cash:${invoice.id}:${Date.now()}`;
      await processCashPayment.mutateAsync({
        p_invoice_id: invoice.id,
        p_amount: grandTotal,
        p_processed_by: user.id,
        p_idempotency_key: key,
      });
      showSuccess(`Payment of ${formatCurrency(grandTotal)} received`);
      onComplete(invoice);
    } catch (err) {
      handlePaymentError(err, "Cash payment failed");
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const handleCashWithChange = async () => {
    if (!user || submitting || !sufficient || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const invoice = await saveDiscountAndCreateInvoice();
      const key = `cash:${invoice.id}:${Date.now()}`;
      await processCashPayment.mutateAsync({
        p_invoice_id: invoice.id,
        p_amount: grandTotal,
        p_processed_by: user.id,
        p_idempotency_key: key,
      });
      showSuccess(`Payment received. Change due: ${formatCurrency(change)}`);
      onComplete(invoice);
    } catch (err) {
      handlePaymentError(err, "Cash payment failed");
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const searchCustomers = async (query: string) => {
    setCreditSearch(query);
    setNoCustomerFound(false);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await import("../lib/core/insforge").then(m =>
          m.insforge.database.rpc('search_customers', { p_query: query })
        );
        const results = (data as CustomerResult[]) || [];
        setSearchResults(results);
        setNoCustomerFound(results.length === 0);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const searchByPhone = async (phone: string) => {
    if (phone.trim().length < 6) return;
    setSearching(true);
    try {
      const { data } = await import("../lib/core/insforge").then(m =>
        m.insforge.database.rpc('search_customers', { p_query: phone })
      );
      const results = (data as CustomerResult[]) || [];
      if (results.length === 1) {
        handleSelectCustomer(results[0]);
      } else if (results.length > 1) {
        setSearchResults(results);
      }
    } catch {
      // silent
    } finally {
      setSearching(false);
    }
  };

  // Auto-resolve customer by phone when credit tab opens
  const creditTabFirstRender = useRef(true);
  useEffect(() => {
    if (tab === "credit" && creditTabFirstRender.current) {
      creditTabFirstRender.current = false;
      if (order.customer_phone && !customerName) {
        searchByPhone(order.customer_phone);
      }
    }
  }, [tab, order.customer_phone, customerName]);

  const handleSelectCustomer = (customer: CustomerResult) => {
    setSelectedCustomer(customer);
    setSearchResults([]);
    setNoCustomerFound(false);
    setShowCreateForm(false);
    if (customer.credit_limit > 0 && customer.outstanding_balance + grandTotal > customer.credit_limit) {
      showError(`Customer credit limit exceeded. Outstanding: ${customer.outstanding_balance}, Limit: ${customer.credit_limit}, Would be: ${customer.outstanding_balance + grandTotal}`);
    }
  };

  const handleCreateCustomer = async () => {
    const name = createForm.name.trim();
    if (!name) return;
    setCreatingCustomer(true);
    try {
      const ts = Date.now().toString(36).toUpperCase();
      const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
      const customId = `CUST-${ts}${rand}`;

      const { data, error } = await insforge.database
        .from('customers')
        .insert([{
          name,
          customer_id: customId,
          phone: createForm.phone.trim() || null,
          status: 'active',
        }])
        .select()
        .single();
      if (error) throw error;

      const newCustomer: CustomerResult = {
        id: data.id,
        customer_id: data.customer_id,
        name: data.name,
        phone: data.phone,
        outstanding_balance: 0,
        credit_limit: data.credit_limit ?? 0,
        status: data.status || 'active',
      };
      handleSelectCustomer(newCustomer);
      setCreditSearch(name);
      showSuccess(`Customer "${name}" created and selected`);
    } catch (err) {
      showError((err as Error)?.message || 'Failed to create customer');
    } finally {
      setCreatingCustomer(false);
    }
  };

  const handleCreditPayment = async () => {
    if (!user || submitting || !selectedCustomer || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const invoice = await saveDiscountAndCreateInvoice();
      const key = `credit:${invoice.id}:${Date.now()}`;
      await processPayment.mutateAsync({
        p_invoice_id: invoice.id,
        p_amount: grandTotal,
        p_method: "credit_account",
        p_processed_by: user.id,
        p_idempotency_key: key,
        p_reference: selectedCustomer.name,
        p_notes: selectedCustomer.phone ? `Phone: ${selectedCustomer.phone}` : undefined,
        p_customer_id: selectedCustomer.id,
      });
      showSuccess(`Credit recorded for ${selectedCustomer.name}`);
      onComplete(invoice);
    } catch (err) {
      handlePaymentError(err, "Credit payment failed");
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  const isPhoneInput = (val: string) => /^[\d\s+\-()]{7,}$/.test(val.trim());

  const resetCreditFlow = () => {
    setSelectedCustomer(null);
    setCreditSearch('');
    setCreditPhone('');
    setSearchResults([]);
    setNoCustomerFound(false);
    setShowCreateForm(false);
    setCreateForm({ name: '', phone: '' });
  };

  if (showFonepay && fonepayInvoice) {
    return (
      <FonepayQRDialog
        invoice={fonepayInvoice}
        amount={grandTotal}
        onSuccess={async () => {
          if (!user || submitLockRef.current) return;
          submitLockRef.current = true;
          setSubmitting(true);
          try {
            const key = `fonepay:${fonepayInvoice.id}:${Date.now()}`;
            await processPayment.mutateAsync({
              p_invoice_id: fonepayInvoice.id,
              p_amount: grandTotal,
              p_method: "fonepay",
              p_processed_by: user.id,
              p_idempotency_key: key,
            });
            showSuccess(`FonePay payment of ${formatCurrency(grandTotal)} confirmed`);
            onComplete(fonepayInvoice);
          } catch (err) {
            handlePaymentError(err, "FonePay payment failed");
          } finally {
            setSubmitting(false);
            submitLockRef.current = false;
            setShowFonepay(false);
            setFonepayInvoice(null);
          }
        }}
        onCancel={() => { setShowFonepay(false); setFonepayInvoice(null); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
      <div className="w-full max-w-md rounded-xl border bg-background p-0 shadow-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            {tab !== "review" && (
              <button onClick={() => setTab("review")} className="min-h-[44px] min-w-[44px]" aria-label="Back to bill review">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 id="payment-modal-title" className="text-lg font-semibold">Bill Review</h2>
          </div>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] opacity-70 hover:opacity-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {tab === "review" && (
          <div className="overflow-y-auto flex-1 p-4 space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Items</p>
              {orderItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-muted-foreground shrink-0 w-5 text-right">{item.quantity}×</span>
                    <span className="truncate">{item.item_name}</span>
                  </div>
                  <span className="tabular-nums shrink-0 ml-2">{formatCurrency(Number(item.unit_price) * item.quantity)}</span>
                </div>
              ))}
            </div>

            <hr className="border-border" />

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Discount</p>
              <div className="flex items-center gap-1 rounded-md bg-muted p-0.5 w-fit">
                <button
                  onClick={() => { setDiscountType('percentage'); setDiscountValue(0); }}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded font-medium ${discountType === 'percentage' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                ><Percent className="h-3 w-3" /> %</button>
                <button
                  onClick={() => { setDiscountType('fixed'); setDiscountValue(0); }}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded font-medium ${discountType === 'fixed' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                ><DollarSign className="h-3 w-3" /> Amount</button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max={discountType === 'percentage' ? 100 : subtotal}
                  value={discountValue || ''}
                  onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
                  placeholder={discountType === 'percentage' ? '0%' : 'Rs. 0'}
                  className="flex-1 h-10 rounded-lg border border-border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                {discountAmount > 0 && (
                  <button onClick={() => setDiscountValue(0)} className="text-xs text-destructive hover:underline shrink-0">Clear</button>
                )}
              </div>
            </div>

            <hr className="border-border" />

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-destructive tabular-nums">-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              {Number(order.tax) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax{Number(order.tax_rate) > 0 ? ` (${order.tax_rate}%)` : ''}</span>
                  <span className="tabular-nums">{formatCurrency(Number(order.tax))}</span>
                </div>
              )}
              {Number(order.service_charge) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service Charge{Number(order.service_charge_rate) > 0 ? ` (${order.service_charge_rate}%)` : ''}</span>
                  <span className="tabular-nums">{formatCurrency(Number(order.service_charge))}</span>
                </div>
              )}
              <hr className="border-border" />
              <div className="flex justify-between items-center">
                <span className="text-base font-bold">Grand Total</span>
                <span className="text-xl font-bold text-primary tabular-nums">{formatCurrency(grandTotal)}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Other Payment Methods</p>
              <button
                onClick={() => { setCashReceived(String(grandTotal)); setTab("cash"); }}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary hover:bg-accent/30 transition-all text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <Banknote className="h-6 w-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">Cash with Change</p>
                  <p className="text-xs text-muted-foreground">When customer gives more than the exact amount</p>
                </div>
                <span className="text-2xl text-muted-foreground/30">→</span>
              </button>

              <button
                onClick={async () => {
                  if (submitLockRef.current) return;
                  submitLockRef.current = true;
                  setSubmitting(true);
                  try {
                    const inv = await saveDiscountAndCreateInvoice();
                    setFonepayInvoice(inv);
                    setShowFonepay(true);
                  } catch (err) {
                    handlePaymentError(err, "Failed to prepare invoice");
                  } finally {
                    setSubmitting(false);
                    submitLockRef.current = false;
                  }
                }}
                disabled={submitting}
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
                onClick={() => { resetCreditFlow(); setTab("credit"); }}
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
                <Button variant="outline" onClick={onClose} className="flex-1 min-h-[44px]">Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {/* Cash tab */}
        {tab === "cash" && (
          <div className="overflow-y-auto flex-1 p-4 space-y-4">
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
              <label className="text-sm font-medium mb-1 block">Cash Received</label>
              <input
                type="number"
                step="1"
                min="0"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className="w-full h-12 text-xl font-bold rounded-lg border border-border bg-transparent px-4 outline-none focus:ring-2 focus:ring-ring text-center"
                aria-label="Cash received amount"
              />
            </div>

            {cashReceivedNum > 0 && (
              <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Due</span>
                  <span className="font-medium">{formatCurrency(grandTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Received</span>
                  <span className="font-medium">{formatCurrency(cashReceivedNum)}</span>
                </div>
                {sufficient && (
                  <div className="flex justify-between pt-1 border-t border-border font-bold text-emerald-600">
                    <span>Change Due</span>
                    <span>{formatCurrency(change)}</span>
                  </div>
                )}
                {!sufficient && (
                  <div className="flex items-center gap-1 text-xs text-amber-600 mt-1 pt-1 border-t border-border">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span>Remaining Due: {formatCurrency(remainingDue)}</span>
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
                Exact {formatCurrency(grandTotal)}
              </Button>
              <Button
                onClick={handleCashWithChange}
                disabled={submitting || !sufficient}
                className="min-h-[48px] text-sm"
                title={!sufficient ? `Insufficient payment — need ${formatCurrency(remainingDue)} more` : ''}
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processing...</>
                ) : (
                  <>Receive {formatCurrency(cashReceivedNum)}</>
                )}
              </Button>
            </div>

            {change > 0 && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3 text-center">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Give change: {formatCurrency(change)}</p>
              </div>
            )}

            {!sufficient && cashReceivedNum > 0 && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-center">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Short by: {formatCurrency(remainingDue)}</p>
              </div>
            )}
          </div>
        )}

        {/* Credit tab */}
        {tab === "credit" && (
          <div className="overflow-y-auto flex-1 p-4 space-y-4">
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-purple-500" /> Credit Account
              </h3>
              <p className="text-xs text-muted-foreground">A registered customer is required for credit billing</p>
            </div>

            {!showCreateForm && !selectedCustomer && (
              <>
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={creditSearch}
                      onChange={(e) => searchCustomers(e.target.value)}
                      placeholder="Search customer by name or phone..."
                      className="w-full h-11 rounded-lg border border-border bg-transparent pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                    />
                  </div>

                  {searching && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {searchResults.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {searchResults.map((customer) => (
                        <button
                          key={customer.id}
                          onClick={() => handleSelectCustomer(customer)}
                          className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-950/10 transition-all text-left"
                        >
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center font-bold text-white text-sm shrink-0 shadow-sm">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{customer.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {customer.customer_id}{customer.phone ? ` · ${customer.phone}` : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-xs font-medium ${customer.outstanding_balance > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                              Due: {formatCurrency(customer.outstanding_balance)}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {noCustomerFound && creditSearch.trim().length >= 2 && (
                    <div className="text-center py-4 text-muted-foreground rounded-lg border-2 border-dashed border-purple-200 dark:border-purple-800">
                      {isPhoneInput(creditSearch) ? (
                        <>
                          <Users className="h-8 w-8 mx-auto mb-1.5 opacity-40" />
                          <p className="text-sm font-medium">No customer found with this phone</p>
                          <p className="text-xs mt-1">Try searching by name or create a new customer.</p>
                        </>
                      ) : (
                        <>
                          <Users className="h-8 w-8 mx-auto mb-1.5 opacity-40" />
                          <p className="text-sm font-medium">"{creditSearch.trim()}" not found</p>
                          <p className="text-xs mt-0.5 mb-3">Create a new customer to bill on credit</p>
                        </>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Phone (optional, helps find existing)</label>
                    <input
                      type="text"
                      value={creditPhone}
                      onChange={(e) => {
                        setCreditPhone(e.target.value);
                        if (e.target.value.trim().length >= 6) {
                          searchCustomers(e.target.value);
                        }
                      }}
                      placeholder="98XXXXXXXX"
                      className="w-full h-11 rounded-lg border border-border bg-transparent px-3 text-sm outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <Button
                    onClick={() => { setShowCreateForm(true); setCreateForm({ name: creditSearch, phone: creditPhone }); }}
                    variant="outline"
                    className="w-full min-h-[44px] gap-2 border-dashed border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/20"
                  >
                    <UserPlus className="h-4 w-4" />
                    New Customer
                  </Button>

                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                          Credit Account payments require a registered customer.
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                          Please select an existing customer or create a new one before continuing.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {showCreateForm && !selectedCustomer && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <UserPlus className="h-4 w-4 text-purple-500" />
                  <h4 className="font-semibold text-sm">New Customer</h4>
                </div>

                <div>
                  <label className="text-xs font-medium mb-1 block">Customer Name <span className="text-destructive">*</span></label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      placeholder="Full name"
                      className="w-full h-11 rounded-lg border border-border bg-transparent pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium mb-1 block">Phone Number <span className="text-destructive">*</span></label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={createForm.phone}
                      onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                      placeholder="98XXXXXXXX"
                      className="w-full h-11 rounded-lg border border-border bg-transparent pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateForm(false)}
                    className="flex-1 min-h-[44px]"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleCreateCustomer}
                    disabled={creatingCustomer || !createForm.name.trim() || !createForm.phone.trim()}
                    className="flex-1 min-h-[44px] bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400"
                  >
                    {creatingCustomer ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating...</>
                    ) : (
                      <><UserPlus className="h-4 w-4 mr-1" /> Create & Select</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {selectedCustomer && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-xl border border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/20 dark:to-background shadow-sm">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-sm shrink-0">
                    {selectedCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base">{selectedCustomer.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedCustomer.customer_id}{selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ''}</p>
                    <div className="flex gap-4 mt-1.5 text-xs">
                      <span className="flex items-center gap-1">
                        <span className="text-muted-foreground">Due</span>
                        <strong className={selectedCustomer.outstanding_balance > 0 ? 'text-destructive' : 'text-emerald-600'}>
                          {formatCurrency(selectedCustomer.outstanding_balance)}
                        </strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-muted-foreground">Limit</span>
                        <strong>{formatCurrency(selectedCustomer.credit_limit)}</strong>
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={resetCreditFlow}
                    className="text-xs text-muted-foreground hover:text-foreground underline whitespace-nowrap"
                  >Change</button>
                </div>

                <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/20 p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Amount to bill</span>
                    <span className="font-bold text-xl text-purple-700 dark:text-purple-300">{formatCurrency(grandTotal)}</span>
                  </div>
                  {selectedCustomer.credit_limit > 0 && (
                    <div className="flex justify-between text-xs mt-2 pt-2 border-t border-purple-200/50 dark:border-purple-800/50">
                      <span className="text-muted-foreground">New balance</span>
                      <span className={selectedCustomer.outstanding_balance + grandTotal > selectedCustomer.credit_limit ? 'text-destructive font-medium' : 'font-medium'}>
                        {formatCurrency(selectedCustomer.outstanding_balance + grandTotal)}
                        {selectedCustomer.outstanding_balance + grandTotal > selectedCustomer.credit_limit && (
                          <span className="text-destructive ml-1">(exceeds limit)</span>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleCreditPayment}
                  disabled={submitting}
                  className="w-full min-h-[48px] bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-sm gap-2"
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processing...</>
                  ) : (
                    <><CreditCard className="h-4 w-4" /> Bill {formatCurrency(grandTotal)} to {selectedCustomer.name}</>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
