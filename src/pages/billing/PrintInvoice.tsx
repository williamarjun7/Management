import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { formatCurrency } from "../../lib/core/format-currency";
import type { Invoice, InvoiceItem, PaymentLog } from "../../types";
import logoSrc from "../../assets/logo.png";
import reviewQrSrc from "../../assets/review.png";

interface PrintInvoiceProps {
  invoice: Invoice;
  onClose: () => void;
}

export function PrintInvoice({ invoice, onClose }: PrintInvoiceProps) {
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      window.print();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const paidAmount = invoice.payment_logs?.reduce((s: number, p: PaymentLog) => s + Number(p.amount), 0) ?? 0;
  const remaining = Number(invoice.total) - paidAmount;

  const d = new Date(invoice.created_at);
  const dateStr = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  const methodLabel: Record<string, string> = {
    cash: "Cash", card: "Card", upi: "UPI", credit_account: "Credit Account", fonepay: "FonePay",
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-white print:relative print:inset-auto print:z-auto">
        <div className="flex items-center justify-between border-b p-4 print:hidden">
          <h2 className="text-lg font-semibold">Print Preview</h2>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div ref={printRef} className="invoice-print p-8 print:p-0">
          <style>{`
            @media print {
              @page { margin: 8mm 6mm; }
              body { font-family: 'Courier New', monospace; font-size: 10px; color: #000; line-height: 1.3; }
              .invoice-print { max-width: 80mm; margin: 0 auto; }
              .no-print { display: none !important; }
              .divider { border: none; border-top: 1px dashed #999; margin: 6px 0; }
              .divider-thick { border: none; border-top: 2px solid #333; margin: 8px 0; }
              .text-center { text-align: center; }
              .text-right { text-align: right; }
              .font-bold { font-weight: bold; }
              .text-xs { font-size: 8px; }
              .text-sm { font-size: 9px; }
              .text-base { font-size: 10px; }
              .text-lg { font-size: 12px; }
              .text-xl { font-size: 14px; }
              .mt-1 { margin-top: 3px; }
              .mt-2 { margin-top: 6px; }
              .mt-3 { margin-top: 9px; }
              .mb-1 { margin-bottom: 3px; }
              .mb-2 { margin-bottom: 6px; }
              .mb-3 { margin-bottom: 9px; }
              .px-1 { padding-left: 2px; padding-right: 2px; }
              .py-1 { padding-top: 2px; padding-bottom: 2px; }
            }
            @media print and (max-width: 72mm) {
              .invoice-print { max-width: 58mm; }
            }
          `}</style>

          {/* Header */}
          <div className="text-center mb-2">
            <img src={logoSrc} alt="" className="h-10 w-10 rounded-full object-cover mx-auto mb-1" />
            <div className="text-lg font-bold">Highlands Cafe & Motel Inn</div>
            <div className="text-sm">Birendranagar-8, Khajura</div>
            <div className="text-sm">Surkhet, Nepal</div>
            <div className="text-sm">+977 9763215874</div>
          </div>

          <hr className="divider" />

          {/* Invoice Info */}
          <div className="mb-2 text-sm">
            <div className="flex justify-between">
              <span>Invoice No</span>
              <span className="font-bold">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span>Date</span>
              <span>{dateStr}</span>
            </div>
            <div className="flex justify-between">
              <span>Time</span>
              <span>{timeStr}</span>
            </div>
            {invoice.customer_name && (
              <div className="flex justify-between">
                <span>Customer</span>
                <span>{invoice.customer_name}</span>
              </div>
            )}
          </div>

          <hr className="divider" />

          {/* Items */}
          <div className="mb-2">
            <div className="flex justify-between text-sm font-bold mb-1">
              <span>Item</span>
              <span>Amount</span>
            </div>
            {invoice.invoice_items?.map((item: InvoiceItem) => (
              <div key={item.id} className="mb-1">
                <div className="text-sm">{item.description}</div>
                <div className="flex justify-between text-sm pl-1">
                  <span>{item.quantity} x {formatCurrency(Number(item.unit_price))}</span>
                  <span>{formatCurrency(Number(item.total))}</span>
                </div>
              </div>
            ))}
          </div>

          <hr className="divider" />

          {/* Totals */}
          <div className="mb-2 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(Number(invoice.subtotal))}</span>
            </div>
            {Number(invoice.discount) > 0 && (
              <div className="flex justify-between">
                <span>Discount</span>
                <span>-{formatCurrency(Number(invoice.discount))}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t pt-1 mt-1">
              <span>TOTAL</span>
              <span>{formatCurrency(Number(invoice.total))}</span>
            </div>
            {paidAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span>Paid</span>
                <span>{formatCurrency(paidAmount)}</span>
              </div>
            )}
            {remaining > 0 && (
              <div className="flex justify-between text-sm">
                <span>Balance Due</span>
                <span>{formatCurrency(remaining)}</span>
              </div>
            )}
          </div>

          {/* Payments */}
          {invoice.payment_logs && invoice.payment_logs.length > 0 && (
            <>
              <hr className="divider" />
              <div className="mb-2 text-sm">
                <div className="font-bold mb-1">Payment Method</div>
                {invoice.payment_logs.map((log: PaymentLog) => (
                  <div key={log.id}>
                    <div className="flex justify-between">
                      <span>{methodLabel[log.method] || log.method}</span>
                      <span>{formatCurrency(Number(log.amount))}</span>
                    </div>
                    {log.reference && (
                      <div className="flex justify-between text-xs ml-1">
                        <span>Ref: {log.reference}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <hr className="divider" />

          {/* Footer */}
          <div className="text-center text-sm mb-2">
            <div className="font-bold">Thank you for visiting!</div>
            <div className="text-xs">We hope to see you again.</div>
          </div>

          {/* Review QR */}
          <div className="text-center mb-2">
            <img src={reviewQrSrc} alt="Google Review QR" className="h-20 w-20 object-contain mx-auto mb-1" />
            <div className="text-sm mb-1">★★★★★</div>
            <div className="text-xs font-bold">Loved your experience?</div>
            <div className="text-xs">Please scan the QR code</div>
            <div className="text-xs">and leave us a Google Review.</div>
            <div className="text-xs mt-1">Your feedback helps us improve</div>
            <div className="text-xs">and supports our local business.</div>
          </div>

          <hr className="divider" />

          <div className="text-center text-xs">Highlands Cafe & Motel Inn</div>
        </div>
      </div>
    </>
  );
}
