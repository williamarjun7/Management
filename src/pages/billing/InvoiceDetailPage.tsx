import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Plus, CreditCard, SplitSquareVertical, Users } from "lucide-react";
import { useInvoice, useSplits, useRefundSplit } from "../../lib/hooks";
import { useAuth } from "../../lib/core/auth-context";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";
import { PaymentModal } from "./PaymentModal";
import { PrintInvoice } from "./PrintInvoice";
import SplitPaymentModal from "./SplitPaymentModal";
import SplitBillModal from "../pos/SplitBillModal";
import { showSuccess, showError } from "../../components/ui/toast";
import { formatCurrency } from "../../lib/core/format-currency";
import type { InvoiceItem as InvoiceItemType, PaymentLog, BillSplit } from "../../types";

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case "paid": return "default" as const;
    case "unpaid": return "destructive" as const;
    case "partial": return "secondary" as const;
    case "refunded": return "outline" as const;
    default: return "default" as const;
  }
};

const methodLabel: Record<string, string> = {
  cash: "Cash", card: "Card", upi: "UPI", credit_account: "Credit Account", fonepay: "FonePay",
};

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: invoice, isLoading } = useInvoice(id);
  const { data: splits } = useSplits(id);
  const refundSplit = useRefundSplit();
  const [showPayment, setShowPayment] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [showSplitBill, setShowSplitBill] = useState(false);
  const [payingSplit, setPayingSplit] = useState<BillSplit | null>(null);

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

  const paidAmount = invoice.payment_logs?.reduce((s: number, p: PaymentLog) => s + Number(p.amount), 0) ?? 0;
  const remaining = Number(invoice.total) - paidAmount;

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/billing")} className="min-h-[44px]">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowPrint(true)} className="min-h-[44px]">
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            {invoice.status !== "paid" && invoice.status !== "refunded" && (
              <>
                <Button variant="outline" onClick={() => setShowSplitBill(true)} className="min-h-[44px]">
                  <SplitSquareVertical className="mr-2 h-4 w-4" /> Split Bill
                </Button>
                <Button onClick={() => setShowPayment(true)} className="min-h-[44px]">
                  <Plus className="mr-2 h-4 w-4" /> Add Payment
                </Button>
              </>
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
          </CardHeader>
          <CardContent>
            <Separator className="mb-4" />
            <table className="w-full">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 text-sm font-medium text-muted-foreground">Item</th>
                  <th className="pb-2 text-right text-sm font-medium text-muted-foreground">Qty</th>
                  <th className="pb-2 text-right text-sm font-medium text-muted-foreground">Price</th>
                  <th className="pb-2 text-right text-sm font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.invoice_items?.map((item: InvoiceItemType) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2 text-sm">{item.description}</td>
                    <td className="py-2 text-right text-sm">{item.quantity}</td>
                    <td className="py-2 text-right text-sm">Rs. {Number(item.unit_price).toFixed(2)}</td>
                    <td className="py-2 text-right text-sm font-medium">Rs. {Number(item.total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 space-y-1 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>Rs. {Number(invoice.subtotal).toFixed(2)}</span>
              </div>

              {Number(invoice.discount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span>-Rs. {Number(invoice.discount).toFixed(2)}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>Rs. {Number(invoice.total).toFixed(2)}</span>
              </div>
              {paidAmount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Paid</span>
                  <span>Rs. {paidAmount.toFixed(2)}</span>
                </div>
              )}
              {remaining > 0 && (
                <div className="flex justify-between text-sm text-destructive font-medium">
                  <span>Remaining</span>
                  <span>Rs. {remaining.toFixed(2)}</span>
                </div>
              )}
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
                          <span className="font-medium">Rs. {Number(log.amount).toFixed(2)}</span>
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

            {splits && splits.length > 0 && (
              <>
                <Separator className="my-4" />
                <div>
                  <h4 className="mb-2 text-sm font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4" /> Split Details ({splits.length} guests)
                  </h4>
                  <div className="space-y-2">
                    {splits.map((split) => {
                      const splitPaid = (split.split_payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
                      const splitRemaining = split.total_amount - splitPaid;
                      return (
                        <div key={split.id} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{split.guest_name}</span>
                              <Badge variant={split.payment_status === 'paid' ? 'default' : split.payment_status === 'partially_paid' ? 'secondary' : 'destructive'} className="text-[10px] px-1.5 py-0">
                                {split.payment_status.replace('_', ' ')}
                              </Badge>
                            </div>
                            <span className="font-bold text-sm">{formatCurrency(split.total_amount)}</span>
                          </div>
                          {splitPaid > 0 && (
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Paid: {formatCurrency(splitPaid)}</span>
                              {splitRemaining > 0 && <span>Remaining: {formatCurrency(splitRemaining)}</span>}
                            </div>
                          )}
                          {(split.split_payments ?? []).length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {(split.split_payments ?? []).map(p => (
                                <div key={p.id} className="flex justify-between text-[11px] text-muted-foreground">
                                  <span>{p.payment_method} {p.transaction_reference && `(${p.transaction_reference})`}</span>
                                  <span>{formatCurrency(p.amount)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-1 mt-2">
                            {split.payment_status !== 'paid' && split.payment_status !== 'refunded' && (
                              <button
                                onClick={() => setPayingSplit(split)}
                                className="text-xs text-primary hover:underline"
                              >
                                Pay {formatCurrency(splitRemaining > 0 ? splitRemaining : split.total_amount)}
                              </button>
                            )}
                            {split.payment_status === 'paid' && (
                              <button
                                onClick={() => {
                                  if (!user) return;
                                  refundSplit.mutate({ p_split_id: split.id, p_processed_by: user.id, p_reason: 'Refunded from invoice' }, {
                                    onSuccess: () => showSuccess('Split refunded'),
                                    onError: (e) => showError((e as Error).message),
                                  });
                                }}
                                className="text-xs text-destructive hover:underline"
                              >
                                Refund
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
          splits={splits ?? []}
          onClose={() => setShowPrint(false)}
        />
      )}

      {payingSplit && (
        <SplitPaymentModal
          split={payingSplit}
          onClose={() => setPayingSplit(null)}
          onComplete={() => setPayingSplit(null)}
        />
      )}

      {showSplitBill && (
        <SplitBillModal
          invoice={invoice}
          onClose={() => setShowSplitBill(false)}
          onComplete={() => setShowSplitBill(false)}
        />
      )}
    </>
  );
}
