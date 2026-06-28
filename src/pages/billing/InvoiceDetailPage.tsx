import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Plus, CreditCard } from "lucide-react";
import { useInvoice } from "../../lib/hooks";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Separator } from "../../components/ui/separator";
import { PaymentModal } from "./PaymentModal";
import { PrintInvoice } from "./PrintInvoice";
import { formatCurrency } from "../../lib/core/format-currency";
import type { InvoiceItem as InvoiceItemType, PaymentLog } from "../../types";

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
  const { data: invoice, isLoading } = useInvoice(id);
  const [showPayment, setShowPayment] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

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
          </CardHeader>
          <CardContent>
            <Separator className="mb-4" />
            <div className="overflow-x-auto">
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
                    <td className="py-2 text-right text-sm">{formatCurrency(Number(item.unit_price))}</td>
                    <td className="py-2 text-right text-sm font-medium">{formatCurrency(Number(item.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            <div className="mt-4 space-y-1 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(Number(invoice.subtotal))}</span>
              </div>

              {Number(invoice.discount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span>-{formatCurrency(Number(invoice.discount))}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>{formatCurrency(Number(invoice.total))}</span>
              </div>
              {paidAmount > 0 && (
                <div className="flex justify-between text-sm text-primary">
                  <span>Paid</span>
                  <span>{formatCurrency(paidAmount)}</span>
                </div>
              )}
              {remaining > 0 && (
                <div className="flex justify-between text-sm text-destructive font-medium">
                  <span>Remaining</span>
                  <span>{formatCurrency(remaining)}</span>
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
          onClose={() => setShowPrint(false)}
        />
      )}
    </>
  );
}
