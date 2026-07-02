import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Plus, CreditCard, AlertCircle } from "lucide-react";
import { useInvoice } from "../../lib/hooks";
import { useOrderById } from "../../lib/hooks/orders.hooks";
import { showError } from "../../components/ui/toast";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";
import { PaymentModal } from "./PaymentModal";
import { PrintInvoice } from "./PrintInvoice";
import { useSettings } from '../../lib/core/settings-context';
import { formatCurrency } from "../../lib/core/format-currency";
import type { InvoiceItem as InvoiceItemType, PaymentLog } from "../../types";

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case "paid": return "default" as const;
    case "unpaid":
    case "credit": return "destructive" as const;
    case "partial":
    case "partially_paid":
    case "pending": return "secondary" as const;
    case "refunded":
    case "cancelled": return "outline" as const;
    default: return "default" as const;
  }
};

const methodLabel: Record<string, string> = {
  cash: "Cash", card: "Card", upi: "UPI", credit_account: "Credit Account", fonepay: "FonePay",
};

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: invoice, isLoading } = useInvoice(id);
  const [showPayment, setShowPayment] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const printWindowRef = useRef<Window | null>(null);
  const { data: orderData } = useOrderById(invoice?.order_id);
  const { settings } = useSettings();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/billing")} className="min-h-[44px]">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="text-center text-muted-foreground">Invoice not found</div>
      </div>
    );
  }

  const paidAmount = invoice.payment_logs?.filter((p: PaymentLog) => p.status === "paid").reduce((s: number, p: PaymentLog) => s + Number(p.amount), 0) ?? 0;
  const total = Number(invoice.total);
  const change = paidAmount > total ? paidAmount - total : 0;
  const remaining = paidAmount > total ? 0 : total - paidAmount;
  const subtotal = Number(invoice.subtotal);
  const discount = Number(invoice.discount);
  const tax = Number(invoice.tax);
  const serviceCharge = Number(invoice.service_charge);
  const hasItemDiscounts = invoice.invoice_items?.some(i => Number(i.discount) > 0) ?? false;
  const totalItemDiscounts = invoice.invoice_items?.reduce((s, i) => s + Number(i.discount), 0) ?? 0;
  const totalDiscount = discount + totalItemDiscounts;

  return (
    <>
      <div className="space-y-6 border-t-4 border-t-violet-500 pt-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/billing")} className="min-h-[44px]">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { const pw = window.open("", "", "width=400,height=600,scrollbars=yes"); if (!pw) { showError("Please allow popups for this site to print invoices"); return; } printWindowRef.current = pw; setShowPrint(true); }} className="min-h-[44px]">
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            {invoice.status !== "paid" && invoice.status !== "refunded" && invoice.status !== "cancelled" && (
              <Button onClick={() => setShowPayment(true)} className="min-h-[44px]">
                <Plus className="mr-2 h-4 w-4" /> Add Payment
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-xl">{invoice.invoice_number}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {new Date(invoice.created_at).toLocaleDateString("ne-NP", {
                    weekday: "long", year: "numeric", month: "long", day: "numeric",
                  })}
                </p>
              </div>
              <Badge variant={statusBadgeVariant(invoice.status)} className="text-sm px-3 py-1">
                {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
              </Badge>
            </div>
            {invoice.customer_name && (
              <div className="mt-2">
                <p className="text-sm"><span className="text-muted-foreground">Customer:</span> {invoice.customer_name}</p>
                {invoice.customer_phone && (
                  <p className="text-sm"><span className="text-muted-foreground">Phone:</span> {invoice.customer_phone}</p>
                )}
              </div>
            )}
            {invoice.status === "credit" && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="font-medium">CREDIT SALE</span>
                <span className="text-amber-600 dark:text-amber-400">— Payment pending from customer</span>
              </div>
            )}
            {invoice.status === "partially_paid" && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/20 px-3 py-2 text-sm text-blue-800 dark:text-blue-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="font-medium">PARTIALLY PAID</span>
                <span className="text-blue-600 dark:text-blue-400">— Remaining balance due</span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Separator className="mb-4" />
            <table className="w-full">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 text-sm font-medium text-muted-foreground">Item</th>
                  <th className="pb-2 text-right text-sm font-medium text-muted-foreground">Qty</th>
                  <th className="pb-2 text-right text-sm font-medium text-muted-foreground">Price</th>
                  <th className="pb-2 text-right text-sm font-medium text-muted-foreground">Disc</th>
                  <th className="pb-2 text-right text-sm font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.invoice_items?.map((item: InvoiceItemType) => {
                  const itemDiscount = Number(item.discount);
                  return (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-2 text-sm">{item.description}</td>
                      <td className="py-2 text-right text-sm">{item.quantity}</td>
                      <td className="py-2 text-right text-sm">{formatCurrency(Number(item.unit_price))}</td>
                      <td className="py-2 text-right text-sm">{itemDiscount > 0 ? `-${formatCurrency(itemDiscount)}` : '-'}</td>
                      <td className="py-2 text-right text-sm font-medium">{formatCurrency(Number(item.total))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-4 space-y-1 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {hasItemDiscounts && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Item Discounts</span>
                  <span className="text-destructive">-{formatCurrency(totalItemDiscounts)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Order Discount</span>
                  <span className="text-destructive">-{formatCurrency(discount)}</span>
                </div>
              )}
              {totalDiscount > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Total Discount</span>
                  <span className="text-destructive">-{formatCurrency(totalDiscount)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax{invoice.tax_rate > 0 ? ` (${invoice.tax_rate}%)` : ''}</span>
                  <span>{formatCurrency(tax)}</span>
                </div>
              )}
              {serviceCharge > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Service Charge{invoice.service_charge_rate > 0 ? ` (${invoice.service_charge_rate}%)` : ''}</span>
                  <span>{formatCurrency(serviceCharge)}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-bold">
                <span>Grand Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
              {paidAmount > 0 && (
                <div className="flex justify-between text-sm text-primary">
                  <span>Paid</span>
                  <span>{formatCurrency(paidAmount)}</span>
                </div>
              )}
              {change > 0 ? (
                <div className="flex justify-between text-sm text-emerald-600 font-medium">
                  <span>Change</span>
                  <span>{formatCurrency(change)}</span>
                </div>
              ) : remaining > 0 ? (
                <div className="flex justify-between text-sm text-destructive font-medium">
                  <span>Remaining</span>
                  <span>{formatCurrency(remaining)}</span>
                </div>
              ) : null}
            </div>

            {invoice.payment_logs && invoice.payment_logs.length > 0 && (
              <>
                <Separator className="my-4" />
                <div>
                  <h4 className="mb-2 text-sm font-semibold flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> Payment History
                  </h4>
                  <div className="space-y-2">
                    {invoice.payment_logs.map((log: PaymentLog) => (
                      <div key={log.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                        <div>
                          <span className="font-medium">{methodLabel[log.method] || log.method}</span>
                          {log.reference && <span className="ml-2 text-muted-foreground">Ref: {log.reference}</span>}
                          {log.notes && <p className="text-xs text-muted-foreground">{log.notes}</p>}
                        </div>
                        <div className="text-right">
                          <span className="font-medium">{formatCurrency(Number(log.amount))}</span>
                          <p className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {invoice.notes && (
              <p className="mt-4 text-sm text-muted-foreground">
                <span className="font-medium">Notes:</span> {invoice.notes}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {showPayment && (
        <PaymentModal
          invoice={invoice}
          remaining={remaining}
          onClose={() => setShowPayment(false)}
        />
      )}

      {showPrint && (
        <PrintInvoice
          invoice={invoice}
          printWindow={printWindowRef.current}
          tableNumber={orderData?.restaurant_tables?.table_number ? Number(orderData.restaurant_tables.table_number) : null}
          orderNumber={orderData?.order_number ?? null}
          businessName={settings.business_name}
          onClose={() => { printWindowRef.current = null; setShowPrint(false); }}
        />
      )}
    </>
  );
}
