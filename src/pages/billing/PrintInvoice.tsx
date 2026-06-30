import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Invoice, InvoiceItem, PaymentLog } from "../../types";
import logoSrc from "../../assets/logo.png";
import reviewQrSrc from "../../assets/review.png";

interface PrintInvoiceProps {
  invoice: Invoice;
  onClose: () => void;
}

function fmt(n: number): string {
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
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
  const subtotal = Number(invoice.subtotal);
  const discount = Number(invoice.discount);
  const tax = Number(invoice.tax);
  const serviceCharge = Number(invoice.service_charge);
  const total = Number(invoice.total);
  const totalItemDiscounts = invoice.invoice_items?.reduce((s, i) => s + Number(i.discount), 0) ?? 0;
  const totalDiscount = discount + totalItemDiscounts;

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
        <div ref={printRef} className="invoice-print p-4 md:p-8 print:p-0">
          <style>{`
            @media print {
              @page { margin: 6mm 4mm; }
              body { font-family: 'Courier New', 'Courier', monospace; font-size: 10px; line-height: 1.35; }
              .invoice-print { max-width: 80mm; margin: 0 auto; }
              .no-print { display: none !important; }
              .dashed { border: none; border-top: 1px dashed #888; margin: 6px 0; }
              .solid { border: none; border-top: 1px solid #333; margin: 4px 0; }
              .txt-c { text-align: center; }
              .txt-r { text-align: right; }
              .b { font-weight: bold; }
              .xs { font-size: 8px; }
              .sm { font-size: 9px; }
              .base { font-size: 10px; }
              .lg { font-size: 12px; }
              .xl { font-size: 14px; }
              .mt1 { margin-top: 3px; }
              .mt2 { margin-top: 6px; }
              .mb1 { margin-bottom: 3px; }
              .mb2 { margin-bottom: 6px; }
              .row { display: flex; justify-content: space-between; }
            }
          `}</style>

          <div className="txt-c mb2">
            <img src={logoSrc} alt="" className="h-10 w-10 object-contain mx-auto mb1" />
            <div className="lg b">Highlands Cafe & Motel Inn</div>
            <div className="sm">Birendranagar-8, Khajura</div>
            <div className="sm">Surkhet, Nepal</div>
            <div className="sm">+977 9763215874</div>
          </div>

          <hr className="dashed" />

          <div className="mb2 sm">
            <div className="row">
              <span>Invoice No</span>
              <span className="b">{invoice.invoice_number}</span>
            </div>
            <div className="row">
              <span>Date</span>
              <span>{dateStr}</span>
            </div>
            <div className="row">
              <span>Time</span>
              <span>{timeStr}</span>
            </div>
            {invoice.customer_name && (
              <div className="row">
                <span>Customer</span>
                <span>{invoice.customer_name}</span>
              </div>
            )}
          </div>

          <hr className="dashed" />

          <div className="mb2">
            <div className="row sm b mb1">
              <span style={{ width: '40%' }}>Item</span>
              <span style={{ width: '15%', textAlign: 'right' }}>Qty</span>
              <span style={{ width: '20%', textAlign: 'right' }}>Price</span>
              <span style={{ width: '25%', textAlign: 'right' }}>Total</span>
            </div>
            {invoice.invoice_items?.map((item: InvoiceItem) => {
              const itemDiscount = Number(item.discount);
              const itemTotal = Number(item.total);
              return (
                <div key={item.id} className="mb1">
                  <div className="sm">{item.description}</div>
                  {itemDiscount > 0 && (
                    <div className="xs txt-r" style={{ color: '#888' }}>
                      Discount: -{fmt(itemDiscount)}
                    </div>
                  )}
                  <div className="row sm" style={{ paddingLeft: "4px" }}>
                    <span style={{ width: '40%' }}>{item.quantity} x {fmt(Number(item.unit_price))}</span>
                    <span style={{ width: '15%', textAlign: 'right' }}>{fmt(item.quantity)}</span>
                    <span style={{ width: '20%', textAlign: 'right' }}>{fmt(Number(item.unit_price))}</span>
                    <span style={{ width: '25%', textAlign: 'right' }}>{fmt(itemTotal)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <hr className="dashed" />

          <div className="mb2 sm">
            <div className="row">
              <span>Subtotal</span>
              <span>{fmt(subtotal)}</span>
            </div>
            {totalItemDiscounts > 0 && (
              <div className="row">
                <span>Item Discounts</span>
                <span>-{fmt(totalItemDiscounts)}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="row">
                <span>Order Discount</span>
                <span>-{fmt(discount)}</span>
              </div>
            )}
            {totalDiscount > 0 && (
              <div className="row">
                <span>Total Discount</span>
                <span>-{fmt(totalDiscount)}</span>
              </div>
            )}
            {tax > 0 && (
              <div className="row">
                <span>Tax{invoice.tax_rate > 0 ? ` (${fmt(invoice.tax_rate)}%)` : ''}</span>
                <span>{fmt(tax)}</span>
              </div>
            )}
            {serviceCharge > 0 && (
              <div className="row">
                <span>Service Charge{invoice.service_charge_rate > 0 ? ` (${fmt(invoice.service_charge_rate)}%)` : ''}</span>
                <span>{fmt(serviceCharge)}</span>
              </div>
            )}
            <hr className="solid" />
            <div className="row b lg">
              <span>GRAND TOTAL</span>
              <span>{fmt(total)}</span>
            </div>
            {paidAmount > 0 && (
              <div className="row sm">
                <span>Paid</span>
                <span>{fmt(paidAmount)}</span>
              </div>
            )}
            {remaining > 0 && (
              <div className="row sm">
                <span>Balance Due</span>
                <span>{fmt(remaining)}</span>
              </div>
            )}
          </div>

          {invoice.payment_logs && invoice.payment_logs.length > 0 && (
            <>
              <hr className="dashed" />
              <div className="mb2 sm">
                <div className="b mb1">Payment Method</div>
                {invoice.payment_logs.map((log: PaymentLog) => (
                  <div key={log.id} className="row">
                    <span>{methodLabel[log.method] || log.method}</span>
                    <span>{fmt(Number(log.amount))}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <hr className="dashed" />

          <div className="txt-c sm mb2">
            <div className="b">Thank you for visiting!</div>
            <div className="xs">We hope to see you again.</div>
          </div>

          <div className="txt-c mb2">
            <img src={reviewQrSrc} alt="Google Review QR" className="h-20 w-20 object-contain mx-auto mb1" />
            <div className="sm mb1" style={{ letterSpacing: "2px" }}>★★★★★</div>
            <div className="xs b">Loved your experience?</div>
            <div className="xs">Please scan the QR code</div>
            <div className="xs">and leave us a Google Review.</div>
            <div className="xs mt1">Your feedback helps us improve</div>
            <div className="xs">and supports our local business.</div>
          </div>

          <hr className="dashed" />

          <div className="txt-c xs">Highlands Cafe & Motel Inn</div>
        </div>
      </div>
    </>
  );
}
