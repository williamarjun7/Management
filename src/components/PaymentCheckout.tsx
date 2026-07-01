import { useState, useRef, useMemo } from "react";
import { X, QrCode, Banknote, CreditCard, Check, ArrowLeft, Loader2, AlertCircle, Search, Users, Percent, DollarSign } from "lucide-react";
import { Button } from "./ui/button";
import { useProcessPayment, useProcessCashPayment } from "../lib/hooks";
import { useAuth } from "../lib/core/auth-context";
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
  const [tab, setTab] = useState<PaymentTab>("review");
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
  const submitLockRef = useRef(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const cashReceivedNum = Number(cashReceived) || 0;
  const change = calculateChange(cashReceivedNum, grandTotal);
  const remainingDue = calculateRemainingDue(cashReceivedNum, grandTotal);
  const sufficient = isPaymentSufficient(cashReceivedNum, grandTotal);

  async function saveDiscountAndCreateInvoice(): Promise<Invoice> {
    // 1. Save discount to order in DB
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

    // 2. Generate invoice number
    const invoiceNumber = await generateInvoiceNumber();

    // 3. Create invoice
    const { data: newInvoice, error: createErr } = await insforge.database
      .from('invoices')
      .insert([{
        invoice_number: invoiceNumber,
        order_id: order.id,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        subtotal,
        discount: discountAmount,
        discount_type: discountType,
        discount_value: discountValue,
        tax: order.tax ?? 0,
        tax_rate: order.tax_rate ?? 0,
        service_charge: order.service_charge ?? 0,
        service_charge_rate: order.service_charge_rate ?? 0,
        total: grandTotal,
        status: 'unpaid',
      }])
      .select('*, invoice_items(*), payment_logs(*)')
      .single();

    if (createErr) throw createErr;
    const invoice = newInvoice as Invoice;

    // 4. Create invoice items from order items
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

  const handleSelectCustomer = (customer: CustomerResult) => {
    setSelectedCustomer(customer);
    setSearchResults([]);
    setNoCustomerFound(false);
    if (customer.credit_limit > 0 && customer.outstanding_balance + grandTotal > customer.credit_limit) {
      showError(`Customer credit limit exceeded. Outstanding: ${customer.outstanding_balance}, Limit: ${customer.credit_limit}, Would be: ${customer.outstanding_balance + grandTotal}`);
      return;
    }
  };

  const handleCreditPayment = async () => {
    const customerId = selectedCustomer?.id;
    if (!user || submitting || (!selectedCustomer && !creditSearch.trim()) || submitLockRef.current) return;
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
        p_reference: selectedCustomer?.name || creditSearch.trim(),
        p_notes: creditPhone ? `Phone: ${creditPhone}` : undefined,
        p_customer_id: customerId,
      });
      showSuccess(`Credit payment recorded for ${selectedCustomer?.name || creditSearch.trim()}`);
      onComplete(invoice);
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
        invoice={null as unknown as Invoice}
        amount={grandTotal}
        onSuccess={async () => {
          if (!user || submitLockRef.current) return;
          submitLockRef.current = true;
          setSubmitting(true);
          try {
            const invoice = await saveDiscountAndCreateInvoice();
            const key = `fonepay:${invoice.id}:${Date.now()}`;
            await processPayment.mutateAsync({
              p_invoice_id: invoice.id,
              p_amount: grandTotal,
              p_method: "fonepay",
              p_processed_by: user.id,
              p_idempotency_key: key,
            });
            showSuccess(`FonePay payment of ${formatCurrency(grandTotal)} confirmed`);
            onComplete(invoice);
          } catch (err) {
            handlePaymentError(err, "FonePay payment failed");
          } finally {
            setSubmitting(false);
            submitLockRef.current = false;
            setShowFonepay(false);
          }
        }}
        onCancel={() => setShowFonepay(false)}
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
            {/* Order items */}
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

            {/* Discount controls */}
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

            {/* Financial breakdown */}
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

            {/* Quick actions */}
            <div className="space-y-2 pt-2">
              <Button
                onClick={handleCashExact}
                disabled={submitting}
                className="w-full min-h-[52px] text-base font-semibold gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Banknote className="h-5 w-5" />
                )}
                {submitting ? "Processing..." : `Pay Exact ${formatCurrency(grandTotal)}`}
              </Button>
            </div>

            {/* Payment method selection */}
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
            {!selectedCustomer ? (
              <>
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={creditSearch}
                      onChange={(e) => searchCustomers(e.target.value)}
                      placeholder="Search customer by name or phone..."
                      className="w-full h-11 rounded-lg border border-border bg-transparent pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
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
                          className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-accent/30 transition-all text-left"
                        >
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary text-sm shrink-0">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{customer.name}</p>
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
                    <div className="text-center py-4 text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Customer not found</p>
                      <p className="text-xs mt-1">Continue below to create a new customer or proceed without one.</p>
                    </div>
                  )}

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
                    <span className="font-bold text-lg">{formatCurrency(grandTotal)}</span>
                  </div>
                </div>

                <Button
                  onClick={handleCreditPayment}
                  disabled={submitting || !creditSearch.trim()}
                  className="w-full min-h-[48px]"
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processing...</>
                  ) : (
                    <>Bill {formatCurrency(grandTotal)} to {creditSearch.trim() || "customer"}</>
                  )}
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/20">
                  <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center font-semibold text-purple-600">
                    {selectedCustomer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{selectedCustomer.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedCustomer.customer_id}{selectedCustomer.phone ? ` · ${selectedCustomer.phone}` : ''}</p>
                    <div className="flex gap-3 mt-1 text-xs">
                      <span>Due: <strong className="text-destructive">{formatCurrency(selectedCustomer.outstanding_balance)}</strong></span>
                      <span>Limit: <strong>{formatCurrency(selectedCustomer.credit_limit)}</strong></span>
                    </div>
                  </div>
                  <button
                    onClick={() => { setSelectedCustomer(null); setCreditSearch(''); }}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >Change</button>
                </div>

                <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/20 p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount to bill</span>
                    <span className="font-bold text-lg">{formatCurrency(grandTotal)}</span>
                  </div>
                  {selectedCustomer.credit_limit > 0 && (
                    <div className="flex justify-between text-xs mt-1">
                      <span className="text-muted-foreground">New balance would be</span>
                      <span className={selectedCustomer.outstanding_balance + grandTotal > selectedCustomer.credit_limit ? 'text-destructive font-medium' : ''}>
                        {formatCurrency(selectedCustomer.outstanding_balance + grandTotal)}
                      </span>
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleCreditPayment}
                  disabled={submitting}
                  className="w-full min-h-[48px]"
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processing...</>
                  ) : (
                    <>Bill {formatCurrency(grandTotal)} to {selectedCustomer.name}</>
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
